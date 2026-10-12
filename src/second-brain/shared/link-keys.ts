/**
 * Link keys and the deterministic winner rule (§10.2). Obsidian links are
 * case-insensitive; the same resolver serves forward links AND backlinks.
 * Pure: no locale, no state, no imports.
 */

const TRAILING_MD = /\.md$/i;

/** NFC → trim → "\" to "/" → strip ONE trailing ".md" (any case) → lowercase. */
export function normalizeKey(key: string): string {
  return key
    .normalize('NFC')
    .trim()
    .replace(/\\/g, '/')
    .replace(TRAILING_MD, '')
    .toLowerCase();
}

/**
 * "A/B/Note.md" → ["note", "b/note", "a/b/note", ...normalized aliases] —
 * every path suffix, basename first, then aliases; duplicates dropped keeping
 * first-seen order; every element normalized.
 */
export function keysForNote(path: string, aliases: readonly string[]): string[] {
  const full = normalizeKey(path);
  const segments = full.split('/').filter((s) => s !== '');
  const keys: string[] = [];
  for (let i = segments.length - 1; i >= 0; i--) {
    keys.push(segments.slice(i).join('/')); // basename first, full path last
  }
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (key !== '') keys.push(key);
  }
  return [...new Set(keys)]; // Set keeps first-seen order
}

/** Shorter path first, then plain code-unit order (never localeCompare). */
function beats(a: string, b: string): boolean {
  if (a.length !== b.length) return a.length < b.length;
  return a < b;
}

/**
 * Winner for an (already normalized) key among candidate notes:
 * exact full-path match first, else shortest path, else code-unit alphabetical.
 */
export function resolveWinner<T extends { path: string }>(
  candidates: readonly T[],
  key: string,
): T | null {
  if (candidates.length === 0) return null;
  const exact = candidates.filter((c) => normalizeKey(c.path) === key);
  const pool = exact.length > 0 ? exact : candidates;
  return pool.reduce((best, c) => (beats(c.path, best.path) ? c : best));
}
