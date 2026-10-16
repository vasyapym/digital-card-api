// src/second-brain/web/security-headers.ts
// Fixed security headers applied to every /brain response.
export const BRAIN_HEADERS: Record<string, string> = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

// Write every brain header onto the response.
export function applyBrainHeaders(res: {
  setHeader(name: string, value: string): void;
}): void {
  for (const [name, value] of Object.entries(BRAIN_HEADERS)) {
    res.setHeader(name, value);
  }
}
