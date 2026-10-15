// src/second-brain/auth/session.guard.spec.ts
import { ExecutionContext } from '@nestjs/common';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  SessionGuard,
  UnauthenticatedException,
  sanitizeNext,
} from './session.guard';
import { SessionService } from './session.service';

const SECRET = 'unit-test-session-secret-0123456789abcdef';
const NOW_MS = 1700000000000;
const NOW_SEC = 1700000000;

// The guard only consults switchToHttp().getRequest().
function contextFor(request: {
  headers: { cookie?: string };
  query?: { next?: string };
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

// Runs the guard and returns the UnauthenticatedException it throws.
function rejection(
  guard: SessionGuard,
  ctx: ExecutionContext,
): UnauthenticatedException {
  try {
    guard.canActivate(ctx);
  } catch (err) {
    if (err instanceof UnauthenticatedException) {
      return err;
    }
    throw err;
  }
  throw new Error('expected canActivate to throw');
}

describe('session.guard constants', () => {
  it('match the cookie contract', () => {
    expect(SESSION_COOKIE).toBe('sb_session');
    expect(SESSION_MAX_AGE).toBe(604800);
    expect(SESSION_MAX_AGE).toBe(7 * 24 * 60 * 60);
  });
});

describe('sanitizeNext', () => {
  it('keeps paths inside /brain', () => {
    expect(sanitizeNext('/brain')).toBe('/brain');
    expect(sanitizeNext('/brain/')).toBe('/brain/');
    expect(sanitizeNext('/brain/sub')).toBe('/brain/sub');
    expect(sanitizeNext('/brain/notes/42?tab=links')).toBe(
      '/brain/notes/42?tab=links',
    );
  });

  it('falls back to /brain for anything else', () => {
    expect(sanitizeNext(undefined)).toBe('/brain');
    expect(sanitizeNext('')).toBe('/brain');
    expect(sanitizeNext('/brainfoo')).toBe('/brain');
    expect(sanitizeNext('//evil.com')).toBe('/brain');
    expect(sanitizeNext('/brain//evil.com')).toBe('/brain');
    expect(sanitizeNext('/brain\\x')).toBe('/brain');
    expect(sanitizeNext('/brain/a\\b')).toBe('/brain');
    expect(sanitizeNext('/other')).toBe('/brain');
    expect(sanitizeNext('https://evil.com/brain')).toBe('/brain');
    expect(sanitizeNext('brain/sub')).toBe('/brain');
  });
});

describe('UnauthenticatedException', () => {
  it('is a generic 401 that carries next', () => {
    const err = new UnauthenticatedException('/brain/sub');
    expect(err.getStatus()).toBe(401);
    expect(err.message).toBe('unauthenticated');
    expect(err.next).toBe('/brain/sub');
  });
});

describe('SessionGuard', () => {
  const sessions = new SessionService(SECRET, () => NOW_MS);
  const guard = new SessionGuard(sessions);
  const token = sessions.sign(NOW_SEC, NOW_SEC + 3600);

  it('throws UnauthenticatedException with next=/brain when there is no cookie header', () => {
    const err = rejection(guard, contextFor({ headers: {} }));
    expect(err).toBeInstanceOf(UnauthenticatedException);
    expect(err.getStatus()).toBe(401);
    expect(err.next).toBe('/brain');
  });

  it('accepts a valid signed cookie', () => {
    const ctx = contextFor({ headers: { cookie: `${SESSION_COOKIE}=${token}` } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('finds the cookie among others and splits each pair on the first "="', () => {
    const cookie = `theme=dark; a=b=c; ${SESSION_COOKIE}=${token} ;trailing=1`;
    expect(guard.canActivate(contextFor({ headers: { cookie } }))).toBe(true);
  });

  it('requires an exact cookie name match', () => {
    const cookies = [
      `x${SESSION_COOKIE}=${token}`,
      `${SESSION_COOKIE}2=${token}`,
      SESSION_COOKIE,
    ];
    for (const cookie of cookies) {
      expect(rejection(guard, contextFor({ headers: { cookie } })).next).toBe(
        '/brain',
      );
    }
  });

  it('rejects tampered, foreign, expired and empty cookie values', () => {
    const foreign = new SessionService(
      'some-other-secret-0123456789abcdefghij',
      () => NOW_MS,
    );
    const values = [
      `${token}x`,
      token.slice(1),
      foreign.sign(NOW_SEC, NOW_SEC + 3600),
      sessions.sign(NOW_SEC - 7200, NOW_SEC - 1),
      '',
      'garbage',
    ];
    for (const value of values) {
      const ctx = contextFor({
        headers: { cookie: `${SESSION_COOKIE}=${value}` },
      });
      expect(() => guard.canActivate(ctx)).toThrow(UnauthenticatedException);
    }
  });

  it('sanitizes hostile next values down to /brain', () => {
    for (const next of ['/brainfoo', '//evil.com', '/brain\\x', '/other']) {
      expect(
        rejection(guard, contextFor({ headers: {}, query: { next } })).next,
      ).toBe('/brain');
    }
    expect(rejection(guard, contextFor({ headers: {}, query: {} })).next).toBe(
      '/brain',
    );
    expect(rejection(guard, contextFor({ headers: {} })).next).toBe('/brain');
  });

  it('keeps a safe next inside /brain', () => {
    const ctx = contextFor({
      headers: { cookie: 'theme=dark' },
      query: { next: '/brain/sub' },
    });
    expect(rejection(guard, ctx).next).toBe('/brain/sub');
  });

  it('ignores next entirely when the session is valid', () => {
    const ctx = contextFor({
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
      query: { next: '//evil.com' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
