// src/second-brain/web/brain.controller.ts
import {
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LoginThrottle } from '../auth/login-throttle';
import { PassphraseService } from '../auth/passphrase.service';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  SessionGuard,
  readCookie,
  sanitizeNext,
} from '../auth/session.guard';
import { SessionService } from '../auth/session.service';
import { NotesRepository } from '../notes/notes.repository';
import { NoteView } from '../notes/note.view';
import { HomeView } from '../views/home.view';
import { BrainLayoutView } from '../views/layout';
import { LoginView } from '../views/login.view';
import { SearchView } from '../views/search.view';
import { BrainExceptionFilter } from './brain-exception.filter';
import { SearchService } from '../search/search.service';
import { MetaService } from './meta.service';
import { applyBrainHeaders } from './security-headers';

@Injectable()
@Controller('brain')
@UseFilters(BrainExceptionFilter)
export class BrainController {
  constructor(
    private readonly sessions: SessionService,
    private readonly throttle: LoginThrottle,
    private readonly passphrases: PassphraseService,
    private readonly meta: MetaService,
    private readonly layout: BrainLayoutView,
    private readonly loginView: LoginView,
    private readonly homeView: HomeView,
    private readonly searchView: SearchView,
    private readonly searches: SearchService,
    private readonly notes: NotesRepository,
    private readonly noteView: NoteView,
  ) {}

  // GET /brain/login: a valid session skips the form.
  @Get('login')
  login(@Req() req: Request, @Res() res: Response): void {
    const raw = req.query['next'];
    const nextValue = typeof raw === 'string' ? raw : undefined;
    const next = sanitizeNext(nextValue);
    const cookie = readCookie(req.headers.cookie, SESSION_COOKIE);
    this.applyHeaders(res);
    if (cookie !== undefined && this.sessions.verify(cookie)) {
      this.redirect(res, next);
      return;
    }
    res
      .status(200)
      .send(this.layout.render('Sign in', this.loginView.render(next)));
  }

  // POST /brain/login: origin gate, lockout, passphrase, then session cookie.
  @Post('login')
  async loginPost(@Req() req: Request, @Res() res: Response): Promise<void> {
    // CSRF gate: a present Origin must parse and match the Host header.
    const origin = req.headers['origin'];
    if (typeof origin === 'string') {
      let originHost: string | undefined;
      try {
        originHost = new URL(origin).host;
      } catch {
        originHost = undefined;
      }
      if (originHost === undefined || originHost !== req.headers.host) {
        throw new ForbiddenException();
      }
    }

    // Form fields: anything that is not a string counts as absent.
    const body = (req.body ?? {}) as Record<string, unknown>;
    const rawNext = body['next'];
    const bodyNext = typeof rawNext === 'string' ? rawNext : undefined;
    const next = sanitizeNext(bodyNext);
    this.applyHeaders(res);

    if (this.throttle.isLocked()) {
      res
        .status(429)
        .send(
          this.layout.render(
            'Sign in',
            this.loginView.render(next, {
              kind: 'lockout',
              text: 'too many attempts, try again later',
            }),
          ),
        );
      return;
    }

    const rawPassphrase = body['passphrase'];
    if (typeof rawPassphrase !== 'string') {
      res
        .status(400)
        .send(
          this.layout.render(
            'Sign in',
            this.loginView.render(next, { kind: 'error', text: 'missing passphrase' }),
          ),
        );
      return;
    }

    const accepted = await this.passphrases.verify(rawPassphrase);
    if (!accepted) {
      this.throttle.recordFailure();
      res
        .status(401)
        .send(
          this.layout.render(
            'Sign in',
            this.loginView.render(next, { kind: 'error', text: 'wrong passphrase' }),
          ),
        );
      return;
    }

    this.throttle.registerSuccess();
    const iat = Math.floor(Date.now() / 1000);
    const token = this.sessions.sign(iat, iat + SESSION_MAX_AGE);
    res.setHeader(
      'Set-Cookie',
      SESSION_COOKIE +
        '=' +
        token +
        '; Max-Age=' +
        SESSION_MAX_AGE +
        '; Path=/brain; HttpOnly; Secure; SameSite=Lax',
    );
    this.redirect(res, next);
  }

  // POST /brain/logout: expire the cookie and return to the sign-in page.
  @Post('logout')
  @UseGuards(SessionGuard)
  logout(@Res() res: Response): void {
    this.applyHeaders(res);
    res.setHeader(
      'Set-Cookie',
      SESSION_COOKIE + '=; Max-Age=0; Path=/brain; HttpOnly; Secure; SameSite=Lax',
    );
    this.redirect(res, '/brain/login');
  }

  // GET /brain/home: home page with exactly one freshness lookup.
  @Get()
  @UseGuards(SessionGuard)
  async home(@Res() res: Response): Promise<void> {
    this.applyHeaders(res);
    const freshness = await this.meta.freshness();
    res
      .status(200)
      .send(this.layout.render('Brain', this.homeView.render(freshness)));
  }

  // GET /brain/search?q=... : the q gate trims, caps at 200 and bounces home on empty.
  @Get('search')
  @UseGuards(SessionGuard)
  async search(@Req() req: Request, @Res() res: Response): Promise<void> {
    this.applyHeaders(res);
    const q = firstQueryValue(req.query['q'])
      .trim()
      .slice(0, SEARCH_MAX_LENGTH);
    if (q === '') {
      this.redirect(res, '/brain');
      return;
    }
    const results = await this.searches.search(q);
    res
      .status(200)
      .send(this.layout.render('Search', this.searchView.render(q, results)));
  }

  // GET /brain/n/:id : the 16-hex gate rejects before any database query.
  @Get('n/:id')
  @UseGuards(SessionGuard)
  async openNote(@Req() req: Request, @Res() res: Response): Promise<void> {
    const id = req.params['id'];
    if (typeof id !== 'string' || !NOTE_ID_PATTERN.test(id)) {
      throw new NotFoundException();
    }
    const page = await this.notes.findNote(id);
    if (page === null) {
      throw new NotFoundException();
    }
    this.applyHeaders(res);
    res
      .status(200)
      .send(this.layout.render(page.title, this.noteView.render(page)));
  }

  private applyHeaders(res: Response): void {
    applyBrainHeaders(res);
  }

  private redirect(res: Response, url: string): void {
    res.status(303);
    res.setHeader('Location', url);
    res.send('');
  }
}

// The search-query cap and the note-id gate, pinned by the design.
const SEARCH_MAX_LENGTH = 200;
const NOTE_ID_PATTERN = /^[0-9a-f]{16}$/;

// Only the first member of a repeated query value is considered.
function firstQueryValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return '';
}
