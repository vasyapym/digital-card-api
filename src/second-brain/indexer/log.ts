// src/second-brain/indexer/log.ts
export interface IndexSummary {
  mode: 'full' | 'incremental';
  changed: number;
  deleted: number;
  unchanged: number;
  notes: number;
  chunks: number;
  links: number;
  yamlErrors: number;
  skippedUtf8: number;
  ms: number;
}

export function formatSummary(s: IndexSummary): string {
  return (
    `index: mode=${s.mode} changed=${s.changed} deleted=${s.deleted} ` +
    `unchanged=${s.unchanged} notes=${s.notes} chunks=${s.chunks} ` +
    `links=${s.links} yaml_errors=${s.yamlErrors} ` +
    `skipped_utf8=${s.skippedUtf8} ms=${s.ms}`
  );
}

export interface ProgressLine {
  done: number;
  total: number;
  chunks: number;
  ms: number;
}

/**
 * One line every N indexed notes: counts and elapsed time only — never note
 * content, titles or paths. Long full rebuilds are otherwise silent until the
 * final summary, so a ceiling-killed run leaves no trace of how far it got.
 */
export function formatProgress(p: ProgressLine): string {
  const notesPerMin = p.done > 0 ? p.done / (p.ms / 60000) : 0;
  const etaMin =
    notesPerMin > 0 ? Math.round((p.total - p.done) / notesPerMin) : null;
  const eta = etaMin === null ? 'unknown' : formatEtaMinutes(etaMin);
  return (
    `index: progress done=${p.done}/${p.total} chunks=${p.chunks} ms=${p.ms} ` +
    `rate=${notesPerMin.toFixed(1)}/min eta=${eta}`
  );
}

function formatEtaMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, '0')}m`;
}

export interface RedactedError {
  name: string;
  code?: string;
}

/** Strips everything that could leak content: message, stack, paths. */
export function redactError(err: unknown): RedactedError {
  let name = 'Error';
  if (err !== null && err !== undefined) {
    const ctor = (err as { constructor?: { name?: unknown } }).constructor;
    if (ctor && typeof ctor.name === 'string' && ctor.name.length > 0) name = ctor.name;
  }
  const out: RedactedError = { name };
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === 'string') out.code = code;
  return out;
}
