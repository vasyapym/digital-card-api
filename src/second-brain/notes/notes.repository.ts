// src/second-brain/notes/notes.repository.ts
import { Injectable } from '@nestjs/common';
import { setTimeout as sleep } from 'node:timers/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeKey, resolveWinner } from '../shared/link-keys';
import { extractWikilinks } from '../shared/wikilinks';
import { renderMarkdown, type ResolveLink } from './markdown';

export interface Backlink {
  id: string;
  title: string;
}

export interface NotePage {
  id: string;
  title: string;
  path: string;
  folderPath: string;
  name: string;
  bodyHtml: string;
  tags: string[];
  updatedAt: Date | null;
  backlinks: Backlink[];
}

// Q1: the note itself; id is the PK so the first row is the only row.
export const NOTE_SQL =
  'SELECT id, path, name, title, keys, tags, frontmatter, body, hash, updated_at, indexed_at FROM brain_notes WHERE id = $1';
// Q2: every candidate for every forward-link key in one trip; winners are picked in TS.
export const FORWARD_SQL =
  'SELECT id, path, title, keys FROM brain_notes WHERE keys && $1::text[]';
// Q3: linkers aiming at any of this note's keys; n.keys exposes competing claims to the winner filter.
export const BACKLINK_SQL =
  'SELECT l.dst_key, n.id, n.title, n.path, n.keys FROM brain_links l JOIN brain_notes n ON n.id = l.src_id WHERE l.dst_key = ANY($1::text[]) AND l.src_id <> $2';

const RETRY_DELAY_MS = 500;
const TRANSIENT_CODES = new Set(['P1001', 'P1017']);

type RawRow = Record<string, unknown>;

interface NoteRow {
  id: string;
  path: string;
  name: string;
  title: string;
  keys: string[];
  tags: string[];
  body: string;
  updatedAt: Date | null;
}

interface ForwardRow {
  id: string;
  path: string;
  title: string;
  keys: string[];
}

// n.id is the LINKER, so it becomes srcId here and cannot be confused with the note being read.
interface BacklinkRow {
  dstKey: string;
  srcId: string;
  title: string;
  path: string;
  keys: string[];
}

interface Candidate {
  id: string;
  path: string;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asDate(value: unknown): Date | null {
  return value instanceof Date ? value : null;
}

function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function isTransient(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && TRANSIENT_CODES.has(code);
}

function toNoteRow(raw: RawRow, fallbackId: string): NoteRow {
  return {
    id: asString(raw.id) ?? fallbackId,
    path: asString(raw.path) ?? '',
    name: asString(raw.name) ?? '',
    title: asString(raw.title) ?? '',
    keys: asStringArray(raw.keys),
    tags: asStringArray(raw.tags),
    body: asString(raw.body) ?? '',
    updatedAt: asDate(raw.updated_at),
  };
}

function toForwardRow(raw: RawRow): ForwardRow | null {
  const id = asString(raw.id);
  const path = asString(raw.path);
  if (id === null || path === null) return null;
  return { id, path, title: asString(raw.title) ?? '', keys: asStringArray(raw.keys) };
}

function toBacklinkRow(raw: RawRow): BacklinkRow | null {
  const dstKey = asString(raw.dst_key);
  const srcId = asString(raw.id);
  if (dstKey === null || srcId === null) return null;
  return {
    dstKey,
    srcId,
    title: asString(raw.title) ?? '',
    path: asString(raw.path) ?? '',
    keys: asStringArray(raw.keys),
  };
}

// Non-embed targets, normalized, deduped, first-seen order.
function linkTargetsOf(body: string): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const link of extractWikilinks(body)) {
    if (link.embed || link.target.trim() === '') continue;
    const key = normalizeKey(link.target);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    targets.push(key);
  }
  return targets;
}

// This note plus every fetched linker that also claims dstKey, one entry per note.
function competitorsFor(rows: BacklinkRow[], dstKey: string, thisNote: Candidate): Candidate[] {
  const byId = new Map<string, Candidate>([[thisNote.id, thisNote]]);
  for (const row of rows) {
    if (row.keys.includes(dstKey) && !byId.has(row.srcId)) {
      byId.set(row.srcId, { id: row.srcId, path: row.path });
    }
  }
  return Array.from(byId.values());
}

function compareBacklinks(a: Backlink, b: Backlink): number {
  const left = a.title.toLowerCase();
  const right = b.title.toLowerCase();
  if (left < right) return -1;
  if (left > right) return 1;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

// A linker row counts only when THIS note wins its dst_key against every fetched competitor.
function pickBacklinks(rows: BacklinkRow[], thisNote: Candidate): Backlink[] {
  const groups = new Map<string, BacklinkRow[]>();
  for (const row of rows) {
    const group = groups.get(row.dstKey);
    if (group) group.push(row);
    else groups.set(row.dstKey, [row]);
  }
  const kept = new Map<string, Backlink>();
  groups.forEach((group, dstKey) => {
    const winner = resolveWinner(competitorsFor(rows, dstKey, thisNote), dstKey);
    if (winner === null || winner.id !== thisNote.id) return;
    for (const row of group) {
      if (!kept.has(row.srcId)) kept.set(row.srcId, { id: row.srcId, title: row.title });
    }
  });
  return Array.from(kept.values()).sort(compareBacklinks);
}

@Injectable()
export class NotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  public async findNote(id: string): Promise<NotePage | null> {
    const noteRows = await this.runQuery<RawRow>(NOTE_SQL, [id]);
    const first = noteRows[0];
    if (first === undefined) return null;

    const note = toNoteRow(first, id);
    const linkTargets = linkTargetsOf(note.body);
    const forwardRows =
      linkTargets.length === 0
        ? []
        : (
            await this.runQuery<RawRow>(FORWARD_SQL, [linkTargets])
          )
            .map(toForwardRow)
            .filter((row): row is ForwardRow => row !== null);

    const resolve: ResolveLink =
      linkTargets.length === 0
        ? () => null
        : (raw) => {
            const key = normalizeKey(raw);
            // Per-key scope: the winner must come from notes claiming THIS key,
            // never from the globally shortest path among all fetched candidates.
            const candidates = forwardRows.filter((row) => row.keys.includes(key));
            const winner = resolveWinner(candidates, key);
            return winner ? { id: winner.id } : null;
          };
    const bodyHtml = renderMarkdown(note.body, resolve);

    const ownKeys = note.keys.slice();
    const backlinkRows =
      ownKeys.length === 0
        ? []
        : (
            await this.runQuery<RawRow>(BACKLINK_SQL, [ownKeys, id])
          )
            .map(toBacklinkRow)
            .filter((row): row is BacklinkRow => row !== null);

    return {
      id: note.id,
      title: note.title,
      path: note.path,
      folderPath: folderOf(note.path),
      name: note.name,
      bodyHtml,
      tags: note.tags,
      updatedAt: note.updatedAt,
      backlinks: pickBacklinks(backlinkRows, { id: note.id, path: note.path }),
    };
  }

  // One retry on a transient connection code; anything else propagates untouched.
  private async runQuery<Row>(sql: string, params: unknown[]): Promise<Row[]> {
    try {
      return await this.prisma.$queryRawUnsafe<Row[]>(sql, ...params);
    } catch (error) {
      if (!isTransient(error)) throw error;
      await sleep(RETRY_DELAY_MS);
      return this.prisma.$queryRawUnsafe<Row[]>(sql, ...params);
    }
  }
}
