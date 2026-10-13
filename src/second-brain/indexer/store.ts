// src/second-brain/indexer/store.ts
import { Prisma, PrismaClient } from '@prisma/client';
import { normalizeKey } from '../shared/link-keys';
import type { Chunk } from './chunk';

export interface StoreNote {
  id: string;
  path: string;
  name: string;
  title: string;
  keys: string[];
  tags: string[];
  body: string;
  frontmatter: unknown;
  hash: string;
  updatedAt: string;
  chunks: Chunk[];
  embeddings: number[][];
  linkTargets: string[];
}

const NOTE_UPSERT_SQL = `
INSERT INTO brain_notes
  (id, path, name, title, keys, tags, frontmatter, body, hash, updated_at, indexed_at)
VALUES
  ($1, $2, $3, $4, $5::text[], $6::text[], $7::jsonb, $8, $9, $10::timestamptz, now())
ON CONFLICT (id) DO UPDATE SET
  path = EXCLUDED.path, name = EXCLUDED.name, title = EXCLUDED.title,
  keys = EXCLUDED.keys, tags = EXCLUDED.tags, frontmatter = EXCLUDED.frontmatter,
  body = EXCLUDED.body, hash = EXCLUDED.hash,
  updated_at = EXCLUDED.updated_at, indexed_at = now()`;

const META_UPSERT_SQL = `
INSERT INTO brain_meta (key, value, updated_at) VALUES ($1, $2, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;

function vectorText(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/** normalizeKey each target, skip same-page targets, dedupe. */
export function dstKeysFor(targets: string[]): string[] {
  const keys = new Set<string>();
  for (const raw of targets) {
    const target = raw.trim();
    if (!target || target.startsWith('#')) continue;
    const key = normalizeKey(target);
    if (key) keys.add(key);
  }
  return [...keys];
}

export async function storeNote(
  prisma: PrismaClient,
  note: StoreNote,
): Promise<{ links: number }> {
  if (note.embeddings.length !== note.chunks.length) throw new Error('embedding failed');
  const dstKeys = dstKeysFor(note.linkTargets);
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$executeRawUnsafe(
      NOTE_UPSERT_SQL,
      note.id,
      note.path,
      note.name,
      note.title,
      note.keys,
      note.tags,
      JSON.stringify(note.frontmatter ?? {}),
      note.body,
      note.hash,
      note.updatedAt,
    );

    await tx.$executeRawUnsafe('DELETE FROM brain_chunks WHERE note_id = $1', note.id);
    const CHUNKS_PER_STATEMENT = 128; // bound params per statement, no argument-spread blowups
    for (let c = 0; c < note.chunks.length; c += CHUNKS_PER_STATEMENT) {
      const slice = note.chunks.slice(c, c + CHUNKS_PER_STATEMENT);
      const params: unknown[] = [];
      const rows = slice.map((chunk, i) => {
        const b = params.length;
        params.push(
          note.id,
          chunk.ord,
          chunk.heading,
          chunk.anchor,
          chunk.text,
          vectorText(note.embeddings[c + i]),
        );
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}::vector)`;
      });
      await tx.$executeRawUnsafe(
        `INSERT INTO brain_chunks (note_id, ord, heading, anchor, text, emb) VALUES ${rows.join(', ')}`,
        ...params,
      );
    }

    await tx.$executeRawUnsafe('DELETE FROM brain_links WHERE src_id = $1', note.id);
    if (dstKeys.length > 0) {
      const params: unknown[] = [];
      const rows = dstKeys.map((key) => {
        const b = params.length;
        params.push(note.id, key);
        return `($${b + 1}, $${b + 2})`;
      });
      await tx.$executeRawUnsafe(
        `INSERT INTO brain_links (src_id, dst_key) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`,
        ...params,
      );
    }
  });
  return { links: dstKeys.length };
}

export async function deleteNotes(prisma: PrismaClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.$executeRawUnsafe('DELETE FROM brain_notes WHERE id = ANY($1::text[])', ids);
}

export async function selectNoteHashes(
  prisma: PrismaClient,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; hash: string }>>(
    'SELECT id, hash FROM brain_notes WHERE id = ANY($1::text[])',
    ids,
  );
  return new Map(rows.map((r) => [r.id, r.hash]));
}

export async function listNoteIds(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM brain_notes');
  return rows.map((r) => r.id);
}

export async function countAll(
  prisma: PrismaClient,
): Promise<{ notes: number; chunks: number; links: number }> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ notes: number; chunks: number; links: number }>
  >(
    `SELECT (SELECT count(*)::int FROM brain_notes) AS notes,
            (SELECT count(*)::int FROM brain_chunks) AS chunks,
            (SELECT count(*)::int FROM brain_links) AS links`,
  );
  return rows[0];
}

export async function readMeta(
  prisma: PrismaClient,
  keys: string[],
): Promise<Record<string, string>> {
  const rows = await prisma.$queryRawUnsafe<Array<{ key: string; value: string }>>(
    'SELECT key, value FROM brain_meta WHERE key = ANY($1::text[])',
    keys,
  );
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function writeMeta(
  prisma: PrismaClient,
  entries: Record<string, string>,
): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const [key, value] of Object.entries(entries)) {
      await tx.$executeRawUnsafe(META_UPSERT_SQL, key, value);
    }
  });
}
