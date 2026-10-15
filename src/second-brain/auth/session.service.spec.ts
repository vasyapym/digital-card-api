// src/second-brain/auth/session.service.spec.ts
import { createHmac } from 'node:crypto';
import { SessionService } from './session.service';

const SECRET = 'unit-test-session-secret-0123456789abcdef';
const OTHER_SECRET = 'another-session-secret-0123456789abcdef';
const NOW_MS = 1700000000000;
const NOW_SEC = 1700000000;

// Splits "payload.mac" without relying on array indexing.
function splitToken(token: string): { payload: string; mac: string } {
  const dot = token.indexOf('.');
  return { payload: token.slice(0, dot), mac: token.slice(dot + 1) };
}

function b64url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

function macFor(secret: string, payload: string): string {
  return createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(payload, 'utf8')
    .digest('base64url');
}

describe('SessionService', () => {
  const service = new SessionService(SECRET, () => NOW_MS);

  it('round-trips a freshly signed token', () => {
    const token = service.sign(NOW_SEC, NOW_SEC + 60);
    expect(service.verify(token)).toBe(true);
  });

  it('encodes exactly {"iat","exp"} plus a 43-char base64url MAC over the payload part', () => {
    const token = service.sign(NOW_SEC, NOW_SEC + 60);
    const { payload, mac } = splitToken(token);
    expect(token.split('.')).toHaveLength(2);
    expect(Buffer.from(payload, 'base64url').toString('utf8')).toBe(
      `{"iat":${NOW_SEC},"exp":${NOW_SEC + 60}}`,
    );
    expect(mac).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(mac).toBe(macFor(SECRET, payload));
  });

  it('truncates fractional seconds when signing', () => {
    const { payload } = splitToken(service.sign(NOW_SEC + 0.9, NOW_SEC + 60.5));
    expect(Buffer.from(payload, 'base64url').toString('utf8')).toBe(
      `{"iat":${NOW_SEC},"exp":${NOW_SEC + 60}}`,
    );
  });

  it('rejects a tampered payload', () => {
    const { mac } = splitToken(service.sign(NOW_SEC, NOW_SEC + 60));
    const forged = b64url(
      JSON.stringify({ iat: NOW_SEC, exp: NOW_SEC + 999999 }),
    );
    expect(service.verify(`${forged}.${mac}`)).toBe(false);
  });

  it('rejects a tampered MAC of the correct length', () => {
    const { payload, mac } = splitToken(service.sign(NOW_SEC, NOW_SEC + 60));
    const flipped = (mac.startsWith('A') ? 'B' : 'A') + mac.slice(1);
    expect(flipped).toHaveLength(mac.length);
    expect(service.verify(`${payload}.${flipped}`)).toBe(false);
  });

  it('rejects a MAC of the wrong length without throwing', () => {
    const { payload, mac } = splitToken(service.sign(NOW_SEC, NOW_SEC + 60));
    expect(service.verify(`${payload}.${mac.slice(0, -1)}`)).toBe(false);
    expect(service.verify(`${payload}.${mac}x`)).toBe(false);
    expect(service.verify(`${payload}.`)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const other = new SessionService(OTHER_SECRET, () => NOW_MS);
    expect(service.verify(other.sign(NOW_SEC, NOW_SEC + 60))).toBe(false);
  });

  it('rejects an expired token', () => {
    expect(service.verify(service.sign(NOW_SEC - 120, NOW_SEC - 1))).toBe(
      false,
    );
  });

  it('rejects a token whose exp equals now and accepts one second later', () => {
    expect(service.verify(service.sign(NOW_SEC - 120, NOW_SEC))).toBe(false);
    expect(service.verify(service.sign(NOW_SEC, NOW_SEC + 1))).toBe(true);
  });

  it('rejects garbage strings', () => {
    expect(service.verify('garbage')).toBe(false);
    expect(service.verify('')).toBe(false);
    expect(service.verify('.')).toBe(false);
    expect(service.verify('a.b.c')).toBe(false);
    expect(service.verify('not base64url!.not a mac')).toBe(false);
  });

  it('rejects a correctly signed payload that is not JSON', () => {
    const payload = b64url('not json');
    expect(service.verify(`${payload}.${macFor(SECRET, payload)}`)).toBe(false);
  });

  it('rejects a correctly signed payload without finite numeric iat and exp', () => {
    const payloads = [
      '{"iat":"1","exp":"9999999999"}',
      '{"iat":1}',
      '{"exp":9999999999}',
      '{"iat":1,"exp":null}',
      '[1,2]',
      'null',
      '42',
    ];
    for (const json of payloads) {
      const payload = b64url(json);
      expect(service.verify(`${payload}.${macFor(SECRET, payload)}`)).toBe(
        false,
      );
    }
  });

  it('uses Date.now by default', () => {
    const live = new SessionService(SECRET);
    const nowSec = Math.floor(Date.now() / 1000);
    expect(live.verify(live.sign(nowSec, nowSec + 3600))).toBe(true);
    expect(live.verify(live.sign(nowSec - 7200, nowSec - 3600))).toBe(false);
  });
});
