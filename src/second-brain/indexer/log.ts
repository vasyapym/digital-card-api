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
