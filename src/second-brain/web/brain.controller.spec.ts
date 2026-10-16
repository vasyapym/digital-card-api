// src/second-brain/web/brain.controller.spec.ts
import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BrainController } from './brain.controller';
import { BrainLayoutView } from '../views/layout';
import { HomeView } from '../views/home.view';
import { LoginView } from '../views/login.view';
import { LoginThrottle } from '../auth/login-throttle';
import { PassphraseService } from '../auth/passphrase.service';
import { SessionService } from '../auth/session.service';
import { MetaService } from './meta.service';

const SECRET = 'unit-spec-session-secret-0123456789abcdefghij';
const HOST = 'app.example.com';
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const WEEK_SECONDS = 604800;
const SESSION_COOKIE = /^sb_session=([^;]+); Max-Age=604800; Path=\/brain; HttpOnly; Secure; SameSite=Lax$/;
const CLEAR_COOKIE = 'sb_session=; Max-Age=0; Path=/brain; HttpOnly; Secure; SameSite=Lax';

const FIXED_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['cache-control', 'private, no-store'],
  ['x-robots-tag', 'noindex, nofollow'],
  ['content-security-policy', "default-src 'none'"],
  ['referrer-policy', 'no-referrer'],
  ['x-content-type-options', 'nosniff'],
];

interface Freshness {
  lastIndexedAt: Date | null;
  noteCount: number | null;
}
const NOT_INDEXED: Freshness = { lastIndexedAt: null, noteCount: null };

interface FakeResponse {
  statusCalls: number[];
  headers: Map<string, string>;
  body: string | null;
  status(code: number): FakeResponse;
  setHeader(name: string, value: string): FakeResponse;
  send(payload?: string): FakeResponse;
}

function makeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCalls: [],
    headers: new Map<string, string>(),
    body: null,
    status(code: number): FakeResponse {
      res.statusCalls.push(code);
      return res;
    },
    setHeader(name: string, value: string): FakeResponse {
      res.headers.set(name, value);
      return res;
    },
    send(payload?: string): FakeResponse {
      res.body = payload ?? '';
      return res;
    },
  };
  return res;
}

function asExpress(res: FakeResponse): Response {
  return res as unknown as Response;
}

interface RequestParts {
  cookie?: string;
  origin?: string;
  host?: string;
  next?: string;
  body?: Record<string, unknown>;
}

function makeRequest(parts: RequestParts = {}): Request {
  const headers: Record<string, string> = {};
  if (parts.cookie !== undefined) headers.cookie = parts.cookie;
  if (parts.origin !== undefined) headers.origin = parts.origin;
  if (parts.host !== undefined) headers.host = parts.host;
  const query: Record<string, string> = {};
  if (parts.next !== undefined) query.next = parts.next;
  return { headers, query, body: parts.body ?? {} } as unknown as Request;
}

function header(res: FakeResponse, name: string): string | undefined {
  const wanted = name.toLowerCase();
  for (const [key, value] of res.headers) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

function statusOf(res: FakeResponse): number {
  return res.statusCalls.length === 0 ? 200 : res.statusCalls[res.statusCalls.length - 1];
}

function expectFixedHeaders(res: FakeResponse): void {
  for (const [name, fragment] of FIXED_HEADERS) {
    const value = header(res, name);
    expect(value).toBeDefined();
    expect(value).toContain(fragment);
  }
}

function sessionTokenOf(res: FakeResponse): string {
  const setCookie = header(res, 'set-cookie') ?? '';
  const match = SESSION_COOKIE.exec(setCookie);
  if (match === null) {
    throw new Error('expected a session Set-Cookie, got ' + JSON.stringify(setCookie));
  }
  return match[1];
}

describe('BrainController (handlers invoked directly, guards bypassed)', () => {
  let locked = false;
  let canned: Freshness = NOT_INDEXED;
  let fx: ReturnType<typeof makeFixture>;

  function makeFixture() {
    const isLocked = jest.fn(() => locked);
    const recordFailure = jest.fn();
    const registerSuccess = jest.fn();
    const verify = jest.fn(async (candidate: string) => candidate === 'right');
    const freshness = jest.fn(async () => canned);
    const controller = new BrainController(
      new SessionService(SECRET),
      { isLocked, recordFailure, registerSuccess } as unknown as LoginThrottle,
      { verify } as unknown as PassphraseService,
      { freshness } as unknown as MetaService,
      new BrainLayoutView(),
      new LoginView(),
      new HomeView(),
    );
    return { controller, isLocked, recordFailure, registerSuccess, verify, freshness };
  }

  async function issueToken(): Promise<string> {
    const probe = makeFixture();
    const res = makeResponse();
    await probe.controller.loginPost(
      makeRequest({ host: HOST, body: { passphrase: 'right' } }),
      asExpress(res),
    );
    return sessionTokenOf(res);
  }

  beforeEach(() => {
    locked = false;
    canned = NOT_INDEXED;
    fx = makeFixture();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /brain/login', () => {
    it('unauthenticated: renders the sign-in form with the fixed headers and touches no service', async () => {
      const res = makeResponse();
      await fx.controller.login(makeRequest({ host: HOST }), asExpress(res));

      expect(statusOf(res)).toBe(200);
      expect(res.body).toContain('Sign in');
      expect(res.body).toContain('autocomplete="current-password"');
      expectFixedHeaders(res);
      expect(header(res, 'set-cookie')).toBeUndefined();
      expect(fx.freshness).not.toHaveBeenCalled();
      expect(fx.verify).not.toHaveBeenCalled();
    });

    it('valid cookie + next: 303 to the sanitized next with an empty body', async () => {
      const token = await issueToken();
      const res = makeResponse();
      await fx.controller.login(
        makeRequest({ host: HOST, cookie: 'sb_session=' + token, next: '/brain/sub?x=1' }),
        asExpress(res),
      );

      expect(statusOf(res)).toBe(303);
      expect(header(res, 'location')).toBe('/brain/sub?x=1');
      expect(res.body).toBe('');
    });

    it('valid cookie, no query: 303 to /brain', async () => {
      const token = await issueToken();
      const res = makeResponse();
      await fx.controller.login(
        makeRequest({ host: HOST, cookie: 'sb_session=' + token }),
        asExpress(res),
      );

      expect(statusOf(res)).toBe(303);
      expect(header(res, 'location')).toBe('/brain');
      expect(res.body).toBe('');
    });

    it('unauthenticated with hostile next /brainfoo: the hidden next falls back to /brain', async () => {
      const res = makeResponse();
      await fx.controller.login(makeRequest({ host: HOST, next: '/brainfoo' }), asExpress(res));

      expect(statusOf(res)).toBe(200);
      expect(res.body).toContain('name="next"');
      expect(res.body).toContain('value="/brain"');
      expect(res.body).not.toContain('value="/brainfoo"');
      expect(res.body).not.toContain('/brainfoo');
    });
  });

  describe('POST /brain/login', () => {
    it('origin mismatch: rejects with ForbiddenException and writes nothing', async () => {
      const res = makeResponse();
      const req = makeRequest({
        host: HOST,
        origin: 'https://evil.example.com',
        body: { passphrase: 'right' },
      });
      await expect(fx.controller.loginPost(req, asExpress(res))).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(res.body).toBeNull();
      expect(res.statusCalls).toEqual([]);
      expect(header(res, 'set-cookie')).toBeUndefined();
      expect(fx.verify).not.toHaveBeenCalled();
      expect(fx.isLocked).not.toHaveBeenCalled();
      expect(fx.recordFailure).not.toHaveBeenCalled();
      expect(fx.registerSuccess).not.toHaveBeenCalled();
    });

    it('unparsable origin: rejects with ForbiddenException and writes nothing', async () => {
      const res = makeResponse();
      const req = makeRequest({
        host: HOST,
        origin: 'https://ex ample',
        body: { passphrase: 'right' },
      });
      await expect(fx.controller.loginPost(req, asExpress(res))).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(res.body).toBeNull();
      expect(res.statusCalls).toEqual([]);
      expect(fx.verify).not.toHaveBeenCalled();
      expect(fx.isLocked).not.toHaveBeenCalled();
      expect(fx.recordFailure).not.toHaveBeenCalled();
    });

    it('no origin but locked out: 429 warning, no verify, no failure recorded, no cookie', async () => {
      locked = true;
      const res = makeResponse();
      await fx.controller.loginPost(
        makeRequest({ host: HOST, body: { passphrase: 'right' } }),
        asExpress(res),
      );

      expect(statusOf(res)).toBe(429);
      expect(res.body).toContain('too many attempts, try again later');
      expect(res.body).toContain('class="warn"');
      expect(fx.isLocked).toHaveBeenCalled();
      expect(fx.verify).not.toHaveBeenCalled();
      expect(fx.recordFailure).not.toHaveBeenCalled();
      expect(fx.registerSuccess).not.toHaveBeenCalled();
      expect(header(res, 'set-cookie')).toBeUndefined();
      expectFixedHeaders(res);
    });

    it('unlocked, empty body: 400 missing passphrase, no verify, no failure recorded', async () => {
      const res = makeResponse();
      await fx.controller.loginPost(
        makeRequest({ host: HOST, body: {} }),
        asExpress(res),
      );

      expect(statusOf(res)).toBe(400);
      expect(res.body).toContain('missing passphrase');
      expect(res.body).toContain('class="err"');
      expect(fx.verify).not.toHaveBeenCalled();
      expect(fx.recordFailure).not.toHaveBeenCalled();
      expect(fx.registerSuccess).not.toHaveBeenCalled();
      expect(header(res, 'set-cookie')).toBeUndefined();
    });

    it('unlocked, wrong passphrase: 401, one failure recorded, no success, no cookie', async () => {
      const res = makeResponse();
      await fx.controller.loginPost(
        makeRequest({ host: HOST, body: { passphrase: 'wrong' } }),
        asExpress(res),
      );

      expect(statusOf(res)).toBe(401);
      expect(res.body).toContain('wrong passphrase');
      expect(res.body).toContain('class="err"');
      expect(fx.verify).toHaveBeenCalledTimes(1);
      expect(fx.verify).toHaveBeenCalledWith('wrong');
      expect(fx.recordFailure).toHaveBeenCalledTimes(1);
      expect(fx.registerSuccess).not.toHaveBeenCalled();
      expect(header(res, 'set-cookie')).toBeUndefined();
    });

    it('unlocked, right passphrase, next /brain/sub: 303 + session cookie whose payload spans one week', async () => {
      const res = makeResponse();
      await fx.controller.loginPost(
        makeRequest({ host: HOST, body: { passphrase: 'right', next: '/brain/sub' } }),
        asExpress(res),
      );

      expect(statusOf(res)).toBe(303);
      expect(res.body).toBe('');
      expect(header(res, 'location')).toBe('/brain/sub');
      expect(header(res, 'set-cookie')).toMatch(SESSION_COOKIE);

      const token = sessionTokenOf(res);
      const dot = token.indexOf('.');
      expect(dot).toBeGreaterThan(0);
      const payload = JSON.parse(Buffer.from(token.slice(0, dot), 'base64url').toString()) as {
        iat: number;
        exp: number;
      };
      expect(typeof payload.iat).toBe('number');
      expect(typeof payload.exp).toBe('number');
      expect(payload.exp - payload.iat).toBe(WEEK_SECONDS);

      expect(fx.verify).toHaveBeenCalledTimes(1);
      expect(fx.verify).toHaveBeenCalledWith('right');
      expect(fx.registerSuccess).toHaveBeenCalledTimes(1);
      expect(fx.recordFailure).not.toHaveBeenCalled();
      expectFixedHeaders(res);
    });

    it('unlocked, right passphrase, no next: Location /brain', async () => {
      const res = makeResponse();
      await fx.controller.loginPost(
        makeRequest({ host: HOST, body: { passphrase: 'right' } }),
        asExpress(res),
      );

      expect(statusOf(res)).toBe(303);
      expect(header(res, 'location')).toBe('/brain');
      expect(header(res, 'set-cookie')).toMatch(SESSION_COOKIE);
    });

    it('unlocked, right passphrase, hostile next //evil.com: Location /brain', async () => {
      const res = makeResponse();
      await fx.controller.loginPost(
        makeRequest({ host: HOST, body: { passphrase: 'right', next: '//evil.com' } }),
        asExpress(res),
      );

      expect(statusOf(res)).toBe(303);
      expect(header(res, 'location')).toBe('/brain');
      expect(header(res, 'set-cookie')).toMatch(SESSION_COOKIE);
    });
  });

  describe('GET /brain', () => {
    it('renders Brain with "not indexed yet" after exactly one freshness call', async () => {
      const res = makeResponse();
      await fx.controller.home(asExpress(res));

      expect(fx.freshness).toHaveBeenCalledTimes(1);
      expect(statusOf(res)).toBe(200);
      expect(res.body).toContain('Brain');
      expect(res.body).toContain('<p class="meta">not indexed yet</p>');
      expect(header(res, 'set-cookie')).toBeUndefined();
      expectFixedHeaders(res);
    });

    it('renders "3 h ago &middot; 410 notes" for a canned freshness against a pinned clock', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(NOW);
      canned = { lastIndexedAt: new Date(NOW - 3 * 3600 * 1000), noteCount: 410 };

      const res = makeResponse();
      await fx.controller.home(asExpress(res));

      expect(statusOf(res)).toBe(200);
      expect(res.body).toContain('<p class="meta">3 h ago &middot; 410 notes</p>');
      expect(fx.freshness).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /brain/logout', () => {
    it('clears the session cookie and redirects 303 to the login page', async () => {
      const res = makeResponse();
      await fx.controller.logout(asExpress(res));

      expect(statusOf(res)).toBe(303);
      expect(header(res, 'location')).toBe('/brain/login');
      expect(header(res, 'set-cookie')).toBe(CLEAR_COOKIE);
      expect(res.body).toBe('');
      expectFixedHeaders(res);
    });
  });
});
