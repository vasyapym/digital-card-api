// src/second-brain/embedding/token-guard.ts
/**
 * The tokenizer's encode() is cheap in the small-input region and slides into
 * a superlinear penalty past tens of thousands of chars (measured 48s for a
 * 45-char KB, 100s for 93KB). The chunker calls the counter dozens of times
 * per large note, so an uncapped exact count is minutes PER CAP CALL. The
 * guard is a drop-in wrapper around any counter: exact counts in the safe
 * region, the same length/3 estimate v1.0.4 introduced for throwing inputs
 * everywhere above the threshold.
 */

/** Above this char length the counter estimates instead of tokenizing. */
export const ESTIMATE_CHARS = 8_000;

/**
 * Above this char length the pipeline's own tokenizer would pay the same
 * superlinear penalty before truncating to the 512-window anyway, so the
 * embedder feeds at most this many chars.
 */
export const SAFE_INPUT_CHARS = 2_500;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Exact below the threshold, estimate above; throwing exact also falls back. */
export function guardedCount(text: string, exact: (t: string) => number): number {
  if (text.length > ESTIMATE_CHARS) return estimateTokens(text);
  try {
    const n = exact(text);
    return n > 0 ? n : estimateTokens(text);
  } catch {
    return estimateTokens(text);
  }
}
