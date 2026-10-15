// src/second-brain/indexer/store.spec.ts
import { PrismaClient } from '@prisma/client';
import { SELECT_NOTE_HASHES_CHUNK, selectNoteHashes } from './store';

const asClient = (obj: unknown): PrismaClient => obj as unknown as PrismaClient;

describe('selectNoteHashes', () => {
  it('bounds the ANY() array per slice and merges results into one map', async () => {
    const callArgs: string[][] = [];
    const prisma = asClient({
      $queryRawUnsafe: jest.fn(async (_sql: string, ids: string[]) => {
        callArgs.push(ids);
        return ids.slice(0, 2).map((id) => ({ id, hash: `h-${id}` }));
      }),
    });

    const ids = Array.from({ length: SELECT_NOTE_HASHES_CHUNK * 2 + 1 }, (_, i) => `id${i}`);
    const map = await selectNoteHashes(prisma, ids);

    expect(callArgs).toHaveLength(3);
    expect(callArgs[0].length).toBe(SELECT_NOTE_HASHES_CHUNK);
    expect(callArgs[1].length).toBe(SELECT_NOTE_HASHES_CHUNK);
    expect(callArgs[2].length).toBe(1);
    expect(callArgs[0][0]).toBe('id0');
    expect(callArgs[2][0]).toBe(`id${SELECT_NOTE_HASHES_CHUNK * 2}`);
    expect(map.size).toBe(5);
    expect(map.get('id0')).toBe('h-id0');
    expect(map.get(`id${SELECT_NOTE_HASHES_CHUNK * 2}`)).toBe(`h-id${SELECT_NOTE_HASHES_CHUNK * 2}`);
  });

  it('returns an empty map without querying when there are no ids', async () => {
    const $queryRawUnsafe = jest.fn(async () => [] as Array<{ id: string; hash: string }>);
    const map = await selectNoteHashes(asClient({ $queryRawUnsafe }), []);
    expect(map.size).toBe(0);
    expect($queryRawUnsafe).not.toHaveBeenCalled();
  });
});
