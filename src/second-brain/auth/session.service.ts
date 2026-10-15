// src/second-brain/auth/session.service.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

// Signs and verifies the stateless sb_session cookie value:
// base64url({"iat":<sec>,"exp":<sec>}) + "." + base64url(HMAC-SHA256(secret, payload part)).
// Rotating the secret invalidates every token because nothing is cached.
export class SessionService {
  private readonly key: Buffer;

  // `now` returns epoch milliseconds like Date.now(); iat/exp are epoch seconds.
  constructor(
    secret: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.key = Buffer.from(secret, 'utf8');
  }

  sign(iat: number, exp: number): string {
    const json = JSON.stringify({ iat: Math.floor(iat), exp: Math.floor(exp) });
    const payload = Buffer.from(json, 'utf8').toString('base64url');
    return `${payload}.${this.mac(payload)}`;
  }

  // Fails closed: any malformed, tampered or expired token yields false, never a throw.
  verify(token: string): boolean {
    try {
      if (typeof token !== 'string') {
        return false;
      }
      const dot = token.indexOf('.');
      if (dot === -1 || token.indexOf('.', dot + 1) !== -1) {
        return false;
      }
      const payload = token.slice(0, dot);
      const received = Buffer.from(token.slice(dot + 1), 'utf8');
      const expected = Buffer.from(this.mac(payload), 'utf8');
      // timingSafeEqual throws on unequal lengths, so compare lengths first.
      if (
        received.length !== expected.length ||
        !timingSafeEqual(received, expected)
      ) {
        return false;
      }
      const parsed: unknown = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      );
      if (typeof parsed !== 'object' || parsed === null) {
        return false;
      }
      const { iat, exp } = parsed as { iat?: unknown; exp?: unknown };
      if (typeof iat !== 'number' || !Number.isFinite(iat)) {
        return false;
      }
      if (typeof exp !== 'number' || !Number.isFinite(exp)) {
        return false;
      }
      return exp > Math.floor(this.now() / 1000);
    } catch {
      return false;
    }
  }

  // HMAC over the exact base64url payload bytes that travel in the cookie.
  private mac(payload: string): string {
    return createHmac('sha256', this.key)
      .update(payload, 'utf8')
      .digest('base64url');
  }
}
