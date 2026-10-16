// src/second-brain/web/security-headers.spec.ts
import { BRAIN_HEADERS, applyBrainHeaders } from './security-headers';

const EXPECTED: Array<[string, string]> = [
  ['Cache-Control', 'private, no-store'],
  ['X-Robots-Tag', 'noindex, nofollow'],
  ['Referrer-Policy', 'no-referrer'],
  ['X-Content-Type-Options', 'nosniff'],
  [
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  ],
];

describe('BRAIN_HEADERS', () => {
  it('has exactly the five header pairs in order', () => {
    expect(Object.entries(BRAIN_HEADERS)).toStrictEqual(EXPECTED);
  });
});

describe('applyBrainHeaders', () => {
  it('writes all five headers into the response', () => {
    const headers = new Map<string, string>();
    const res = {
      headers,
      setHeader(name: string, value: string): void {
        headers.set(name, value);
      },
    };

    applyBrainHeaders(res);

    expect(headers.size).toBe(5);
    expect(Array.from(headers.entries())).toStrictEqual(EXPECTED);
  });
});
