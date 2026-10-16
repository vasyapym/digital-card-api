// src/second-brain/web/meta.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface BrainFreshness {
  lastIndexedAt: Date | null;
  noteCount: number | null;
}

// brain_meta keys read for the home page freshness line.
const KEYS: string[] = ['last_indexed_at', 'notes_count'];

// Parameterized SELECT; keys are bound, never interpolated.
const SQL = 'SELECT key, value FROM brain_meta WHERE key = ANY($1::text[])';

type MetaRow = { key: string; value: string };

// Parse an ISO timestamp; invalid, missing or non-string yields null.
function toDate(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

// Parse a plain decimal digit string; anything else yields null.
function toCount(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) {
    return null;
  }
  const count = parseInt(value, 10);
  return Number.isSafeInteger(count) ? count : null;
}

@Injectable()
export class MetaService {
  constructor(private readonly prisma: PrismaService) {}

  // One small SELECT per call; no caching, no retry, errors propagate.
  public async freshness(): Promise<BrainFreshness> {
    // Keys are bound as $1, never interpolated; a copy keeps the KEYS constant untouched.
    const rows = await this.prisma.$queryRawUnsafe<MetaRow[]>(SQL, [...KEYS]);
    const byKey = new Map<string, unknown>();
    for (const row of rows) {
      byKey.set(row.key, row.value);
    }
    return {
      lastIndexedAt: toDate(byKey.get('last_indexed_at')),
      noteCount: toCount(byKey.get('notes_count')),
    };
  }
}
