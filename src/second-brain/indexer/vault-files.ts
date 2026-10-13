// src/second-brain/indexer/vault-files.ts
const BUILT_IN_EXCLUDES = ['.obsidian', '.trash', '.git', '.second-brain'];

export interface ExcludeResult {
  keep: string[];
  excluded: string[];
}

/**
 * Splits paths into kept vs excluded. Built-ins exclude a folder NAME anywhere in
 * the path ("a/.git/x" is excluded); config entries are leading prefixes
 * ("notes/old" excludes "notes/old/a.md" but not "x/notes/old/a.md"), all
 * case-insensitive.
 */
export function applyExcludes(paths: string[], excludeFolders: string[] = []): ExcludeResult {
  const prefixes = [...excludeFolders]
    .map((f) => f.replace(/^\/+|\/+$/g, '').toLowerCase())
    .filter((f) => f.length > 0);

  const keep: string[] = [];
  const excluded: string[] = [];
  for (const p of paths) {
    const lower = p.toLowerCase();
    const segments = lower.split('/');
    const builtIn = BUILT_IN_EXCLUDES.some((b) => segments.includes(b));
    const prefix = prefixes.some((pre) => lower === pre || lower.startsWith(`${pre}/`));
    (builtIn || prefix ? excluded : keep).push(p);
  }
  return { keep, excluded };
}
