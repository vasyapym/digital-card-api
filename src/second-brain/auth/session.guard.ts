// src/second-brain/auth/session.guard.ts
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { SessionService } from './session.service';

export const SESSION_COOKIE = 'sb_session';
export const SESSION_MAX_AGE = 604800;

const BRAIN_ROOT = '/brain';
const BRAIN_PATH = /^\/brain(\/|$)/;

// Keeps the post-login redirect inside /brain; anything else falls back to /brain.
export function sanitizeNext(next: string | undefined): string {
  if (typeof next !== 'string' || next.length === 0) {
    return BRAIN_ROOT;
  }
  if (!BRAIN_PATH.test(next) || next.includes('//') || next.includes('\\')) {
    return BRAIN_ROOT;
  }
  return next;
}

// 401 that carries the sanitized redirect target for the login page.
export class UnauthenticatedException extends HttpException {
  constructor(public readonly next: string) {
    super('unauthenticated', HttpStatus.UNAUTHORIZED);
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx
      .switchToHttp()
      .getRequest<{ headers: { cookie?: string }; query?: { next?: string }; }>();

    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token === undefined || !this.sessions.verify(token)) {
      throw new UnauthenticatedException(sanitizeNext(req.query?.next));
    }
    return true;
  }
}

// Returns the literal value of the named cookie from a raw Cookie header.
// The token is base64url plus a dot, so no URL decoding is applied.
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const pair of header.split(';')) {
    const trimmed = pair.trim();
    const eq = trimmed.indexOf('=');
    if (eq !== -1 && trimmed.slice(0, eq) === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return undefined;
}
