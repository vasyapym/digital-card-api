// src/second-brain/web/brain.controller.integ.spec.ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { BrainController } from './brain.controller';
import { BrainExceptionFilter } from './brain-exception.filter';
import { BrainLayoutView } from '../views/layout';
import { HomeView } from '../views/home.view';
import { LoginView } from '../views/login.view';
import { LoginThrottle } from '../auth/login-throttle';
import { systemClock } from '../../common/clock';
import { PassphraseService } from '../auth/passphrase.service';
import { SessionGuard } from '../auth/session.guard';
import { SessionService } from '../auth/session.service';
import { MetaService } from './meta.service';

type FetchResponse = Awaited<ReturnType<typeof fetch>>;

const SECRET = 'integ-probe-session-secret-0123456789abcdefghij';
const FORM_TYPE = 'application/x-www-form-urlencoded';

jest.setTimeout(20000);

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

function setCookies(res: FetchResponse): string[] {
  const headers = res.headers as typeof res.headers & {
    getSetCookie?: () => string[];
  };
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }
  const single = headers.get('set-cookie');
  return single === null ? [] : [single];
}

function sessionCookieOf(res: FetchResponse): string | undefined {
  return setCookies(res).find((entry) => entry.startsWith('sb_session='));
}

describe('BrainController runtime probe (real Nest boot, plain HTTP on localhost)', () => {
  let app: INestApplication | undefined;
  let base = '';

  function get(
    path: string,
    headers: Record<string, string> = {},
  ): Promise<FetchResponse> {
    return fetch(base + path, { method: 'GET', headers, redirect: 'manual' });
  }

  function post(
    path: string,
    body: string,
    headers: Record<string, string> = {},
  ): Promise<FetchResponse> {
    return fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': FORM_TYPE, ...headers },
      body,
      redirect: 'manual',
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [BrainController],
      providers: [
        { provide: SessionService, useFactory: () => new SessionService(SECRET) },
        { provide: LoginThrottle, useFactory: () => new LoginThrottle(systemClock) },
        {
          provide: PassphraseService,
          useFactory: () => ({
            verify: async (candidate: string) => candidate === 'right',
          }),
        },
        {
          provide: MetaService,
          useFactory: () => ({
            freshness: async () => ({ lastIndexedAt: null, noteCount: null }),
          }),
        },
        BrainLayoutView,
        LoginView,
        HomeView,
        SessionGuard,
        BrainExceptionFilter,
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });

  afterAll(async () => {
    if (app === undefined) return;
    const server = app.getHttpServer() as { closeAllConnections?: () => void };
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await app.close();
  });

  it('serves the login page and turns the guard rejection into an HTML 303, not a JSON 401', async () => {
    const login = await get('/brain/login');
    const loginBody = await login.text();
    expect(login.status).toBe(200);
    expect(loginBody).toContain('Sign in');
    expect(loginBody).toContain('autocomplete="current-password"');
    expect(login.headers.get('cache-control')).toContain('private, no-store');
    expect(login.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(login.headers.get('content-security-policy')).toContain(
      "default-src 'none'",
    );
    expect(login.headers.get('referrer-policy')).toBe('no-referrer');
    expect(login.headers.get('x-content-type-options')).toBe('nosniff');

    const home = await get('/brain');
    const homeBody = await home.text();
    expect(home.status).toBe(303);
    expect(home.headers.get('location') ?? '').toMatch(/^\/brain\/login/);
    expect(homeBody).not.toContain('"message"');
    expect(homeBody).not.toContain('"statusCode"');
    const contentType = home.headers.get('content-type') ?? '';
    expect(homeBody.length === 0 || contentType.includes('text/html')).toBe(true);
  });

  it('runs the full cycle in order: CSRF 403 -> login -> wrong passphrase -> home -> login shortcut -> logout', async () => {
    const csrf = await post(
      '/brain/login',
      form({ passphrase: 'right', next: '/brain/sub' }),
      { origin: 'https://evil.example' },
    );
    const csrfBody = await csrf.text();
    expect(csrf.status).toBe(403);
    expect(csrfBody).toContain('the request failed (status 403)');
    expect(csrfBody).not.toContain('"statusCode"');
    expect(sessionCookieOf(csrf)).toBeUndefined();

    const signIn = await post('/brain/login', form({ passphrase: 'right', next: '/brain/sub' }));
    await signIn.text();
    expect(signIn.status).toBe(303);
    expect(signIn.headers.get('location')).toBe('/brain/sub');
    const issued = sessionCookieOf(signIn) ?? '';
    expect(issued).toContain('sb_session=');
    expect(issued).toContain('Max-Age=604800');
    expect(issued).toContain('Path=/brain');
    expect(issued).toContain('HttpOnly');
    expect(issued).toContain('SameSite=Lax');
    const token = issued.slice('sb_session='.length, issued.indexOf(';'));
    expect(token.length).toBeGreaterThan(0);

    const wrong = await post('/brain/login', form({ passphrase: 'wrong', next: '//' }));
    const wrongBody = await wrong.text();
    expect(wrong.status).toBe(401);
    expect(wrongBody).toContain('wrong passphrase');
    expect(
      setCookies(wrong).some((entry) => entry.includes('sb_session=')),
    ).toBe(false);

    const cookie = 'sb_session=' + token + '; theme=x';
    const home = await get('/brain', { cookie });
    const homeBody = await home.text();
    expect(home.status).toBe(200);
    expect(homeBody).toContain('not indexed yet');
    expect(home.headers.get('cache-control')).toBe('private, no-store');

    const shortcut = await get('/brain/login?next=' + encodeURIComponent('/brain/sub'), {
      cookie,
    });
    await shortcut.text();
    expect(shortcut.status).toBe(303);
    expect(shortcut.headers.get('location')).toBe('/brain/sub');

    const logout = await post('/brain/logout', '', { cookie });
    await logout.text();
    expect(logout.status).toBe(303);
    expect(logout.headers.get('location')).toBe('/brain/login');
    expect(
      setCookies(logout).some((entry) => entry.includes('sb_session=; Max-Age=0')),
    ).toBe(true);
  });
});
