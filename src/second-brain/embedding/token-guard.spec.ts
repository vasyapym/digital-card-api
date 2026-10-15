// src/second-brain/embedding/token-guard.spec.ts
import { ESTIMATE_CHARS, SAFE_INPUT_CHARS, estimateTokens, guardedCount } from './token-guard';

describe('token-guard', () => {
  it('uses the exact counter in the safe region', () => {
    const text = 'a'.repeat(ESTIMATE_CHARS - 1);
    expect(guardedCount(text, () => 42)).toBe(42);
  });

  it('estimates without calling the tokenizer above the threshold', () => {
    const text = 'a'.repeat(ESTIMATE_CHARS + 1);
    expect(guardedCount(text, () => {
      throw new Error('tokenizer must not be reached');
    })).toBe(Math.ceil((ESTIMATE_CHARS + 1) / 3));
  });

  it('falls back to the length/3 estimate when the exact counter throws', () => {
    const text = 'b'.repeat(999);
    expect(guardedCount(text, () => {
      throw new Error('call stack overflow');
    })).toBe(333);
  });

  it('falls back to the estimate when the exact counter returns 0', () => {
    const text = 'c'.repeat(600);
    expect(guardedCount(text, () => 0)).toBe(200);
  });

  it('keeps the length constants plausible', () => {
    expect(estimateTokens('x'.repeat(30_000))).toBe(10_000);
    expect(ESTIMATE_CHARS).toBe(8_000);
    expect(SAFE_INPUT_CHARS).toBe(2_500);
    expect(SAFE_INPUT_CHARS).toBeLessThan(ESTIMATE_CHARS);
  });
});
