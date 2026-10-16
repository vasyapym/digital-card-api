// src/second-brain/web/meta.service.spec.ts
import type { PrismaService } from '../../prisma/prisma.service';
import { MetaService } from './meta.service';

type Row = { key: string; value: string };
type Call = { sql: string; keys: string[] };

// Build a service over a fresh literal prisma fake that records calls.
function makeService(result: Row[] | Error): { service: MetaService; calls: Call[] } {
  const calls: Call[] = [];
  const prisma = {
    $queryRawUnsafe: async (sql: string, keys: string[]): Promise<Row[]> => {
      calls.push({ sql, keys });
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
  return { service: new MetaService(prisma as unknown as PrismaService), calls };
}

describe('MetaService.freshness', () => {
  it('passes the two keys and the exact SQL', async () => {
    const { service, calls } = makeService([]);

    await service.freshness();

    expect(calls.length).toBe(1);
    expect(calls[0].sql).toBe('SELECT key, value FROM brain_meta WHERE key = ANY($1::text[])');
    expect(calls[0].keys).toEqual(['last_indexed_at', 'notes_count']);
  });

  it('maps a valid timestamp and count', async () => {
    const { service } = makeService([
      { key: 'last_indexed_at', value: '2026-10-14T10:00:00.000Z' },
      { key: 'notes_count', value: '410' },
    ]);

    const result = await service.freshness();

    expect(result.lastIndexedAt).toBeInstanceOf(Date);
    expect(result.lastIndexedAt?.toISOString()).toBe('2026-10-14T10:00:00.000Z');
    expect(result.noteCount).toBe(410);
  });

  it('returns both null for an empty table', async () => {
    const { service } = makeService([]);

    const result = await service.freshness();

    expect(result).toEqual({ lastIndexedAt: null, noteCount: null });
  });

  it('returns both null for unparseable values', async () => {
    const { service } = makeService([
      { key: 'last_indexed_at', value: 'not-a-date' },
      { key: 'notes_count', value: 'nope' },
    ]);

    const result = await service.freshness();

    expect(result.lastIndexedAt).toBeNull();
    expect(result.noteCount).toBeNull();
  });

  it('returns null noteCount when only last_indexed_at is present', async () => {
    const { service } = makeService([
      { key: 'last_indexed_at', value: '2026-10-14T10:00:00.000Z' },
    ]);

    const result = await service.freshness();

    expect(result.lastIndexedAt?.toISOString()).toBe('2026-10-14T10:00:00.000Z');
    expect(result.noteCount).toBeNull();
  });

  it('rejects a count with surrounding spaces', async () => {
    const { service } = makeService([{ key: 'notes_count', value: ' 410 ' }]);

    const result = await service.freshness();

    expect(result.noteCount).toBeNull();
    expect(result.lastIndexedAt).toBeNull();
  });

  it('rejects a digit string that overflows a safe integer', async () => {
    const { service } = makeService([{ key: 'notes_count', value: '9'.repeat(400) }]);

    const result = await service.freshness();

    expect(result.noteCount).toBeNull();
  });

  it('propagates a SELECT error unchanged', async () => {
    const error = new Error('db down');
    const { service } = makeService(error);

    await expect(service.freshness()).rejects.toBe(error);
  });
});
