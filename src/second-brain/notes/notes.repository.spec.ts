// src/second-brain/notes/notes.repository.spec.ts
import type { PrismaService } from '../../prisma/prisma.service';
import { renderMarkdown } from './markdown';
import { BACKLINK_SQL, FORWARD_SQL, NOTE_SQL, NotesRepository } from './notes.repository';

type RawRow = Record<string, unknown>;

interface Tables {
  note?: RawRow[];
  forward?: RawRow[];
  backlink?: RawRow[];
}

const NOTE_ID = 'aaaaaaaaaaaaaaaa';
const THIS_ID = 'THISID000000000000';

function noteRow(overrides: RawRow = {}): RawRow {
  return {
    id: NOTE_ID,
    path: 'Notes/Alpha.md',
    name: 'Alpha',
    title: 'Alpha',
    keys: ['notes/alpha', 'alpha'],
    tags: ['garden'],
    body: 'plain text',
    updated_at: new Date('2026-01-02T03:04:05Z'),
    ...overrides,
  };
}

// Routes each SQL text to its canned table; any other text is a test bug.
function routeFor(tables: Tables): (sql: string) => RawRow[] {
  return (sql) => {
    if (sql === NOTE_SQL) return tables.note ?? [];
    if (sql === FORWARD_SQL) return tables.forward ?? [];
    if (sql === BACKLINK_SQL) return tables.backlink ?? [];
    throw new Error('unexpected sql: ' + sql);
  };
}

function makePrisma(tables: Tables) {
  const route = routeFor(tables);
  const queryRaw = jest.fn(async (sql: string, ..._params: unknown[]) => route(sql));
  const prisma = { $queryRawUnsafe: queryRaw } as unknown as PrismaService;
  return { prisma, queryRaw, repo: new NotesRepository(prisma) };
}

function sqlCalls(fn: { mock: { calls: unknown[][] } }): string[] {
  return fn.mock.calls.map((call) => call[0] as string);
}

function dbError(code: string): Error {
  return Object.assign(new Error('db ' + code), { code });
}

describe('NotesRepository', () => {
  it('returns null for an unknown id after a single note select', async () => {
    const { repo, queryRaw } = makePrisma({});
    expect(await repo.findNote('nope')).toBeNull();
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0]).toEqual([NOTE_SQL, 'nope']);
  });

  it('assembles the page from the first note row', async () => {
    const updated = new Date('2026-01-02T03:04:05Z');
    const { repo } = makePrisma({
      note: [noteRow({ updated_at: updated }), noteRow({ id: 'second', title: 'Ignored' })],
    });
    const page = await repo.findNote(NOTE_ID);
    expect(page).toMatchObject({
      id: NOTE_ID,
      title: 'Alpha',
      name: 'Alpha',
      path: 'Notes/Alpha.md',
      folderPath: 'Notes',
      tags: ['garden'],
      backlinks: [],
    });
    expect(page?.updatedAt).toBe(updated);

    const root = makePrisma({ note: [noteRow({ path: 'Root.md' })] });
    expect((await root.repo.findNote(NOTE_ID))?.folderPath).toBe('');
  });

  it('renders the plain body without a forward query when there are no links', async () => {
    const { repo, queryRaw } = makePrisma({ note: [noteRow({ body: 'plain *text*' })] });
    const page = await repo.findNote(NOTE_ID);
    expect(page?.bodyHtml).toBe(renderMarkdown('plain *text*', () => null));
    expect(sqlCalls(queryRaw)).not.toContain(FORWARD_SQL);
  });

  it('queries forward candidates once with normalized, deduped, first-seen keys', async () => {
    const body = 'See [[A/B.md]], then [[C]], skip ![[Pic.png]] and [[a/b]] again.';
    const { repo, queryRaw } = makePrisma({ note: [noteRow({ body })] });
    await repo.findNote(NOTE_ID);
    expect(sqlCalls(queryRaw).filter((sql) => sql === FORWARD_SQL)).toHaveLength(1);
    expect(queryRaw).toHaveBeenCalledWith(FORWARD_SQL, ['a/b', 'c']);
  });

  it('links resolved targets to the key-scoped winner', async () => {
    const forward = [
      { id: 'w1', path: 'Garden/X.md', title: 'X', keys: ['x', 'garden/x'] },
      { id: 'w2', path: 'Y.md', title: 'Y', keys: ['y'] },
    ];
    const { repo } = makePrisma({
      note: [noteRow({ body: 'See [[X]] and [[Y]].' })],
      forward,
    });
    const html = (await repo.findNote(NOTE_ID))?.bodyHtml ?? '';
    expect(html).toContain('href="/brain/n/w1"');
    expect(html).toContain('href="/brain/n/w2"');
    expect(html.indexOf('href="/brain/n/w1"')).toBeLessThan(html.indexOf('href="/brain/n/w2"'));
  });

  it('leaves unresolved targets raw', async () => {
    const forward = [{ id: 'w9', path: 'Somewhere.md', title: 'S', keys: ['somewhere'] }];
    const { repo, queryRaw } = makePrisma({
      note: [noteRow({ body: 'Go [[Nowhere]].' })],
      forward,
    });
    const page = await repo.findNote(NOTE_ID);
    expect(queryRaw).toHaveBeenCalledWith(FORWARD_SQL, ['nowhere']);
    expect(page?.bodyHtml).toContain('Nowhere');
    expect(page?.bodyHtml).not.toContain('/brain/n/');
  });

  it('keeps a backlink only when this note wins the dst_key', async () => {
    const note = noteRow({
      id: THIS_ID,
      path: 'Deep/Folder/Alias.md',
      keys: ['this-alias', 'deep/folder/alias'],
    });
    const backlink = [
      {
        dst_key: 'this-alias',
        id: 'AAAAAAAAAAAAAAAA',
        title: 'Competitor',
        path: 'this-alias.md',
        keys: ['this-alias'],
      },
      { dst_key: 'this-alias', id: 'CCCCCCCCCCCCCCCC', title: 'Follower', path: 'Follower.md', keys: ['follower'] },
      { dst_key: 'deep/folder/alias', id: 'BBBBBBBBBBBBBBBB', title: 'Friend', path: 'Friend.md', keys: ['friend'] },
    ];
    const { repo, queryRaw } = makePrisma({ note: [note], backlink });
    const page = await repo.findNote(THIS_ID);
    expect(queryRaw).toHaveBeenCalledWith(BACKLINK_SQL, ['this-alias', 'deep/folder/alias'], THIS_ID);
    expect(page?.backlinks).toEqual([{ id: 'BBBBBBBBBBBBBBBB', title: 'Friend' }]);
  });

  it('dedupes backlinks by source id and sorts by title (case-insensitive) then id', async () => {
    const note = noteRow({ id: THIS_ID, path: 'K.md', keys: ['k1', 'k2'] });
    const backlink = [
      { dst_key: 'k1', id: 'ZZZZ', title: 'zeta', path: 'Z.md', keys: ['z'] },
      { dst_key: 'k2', id: 'ZZZZ', title: 'zeta', path: 'Z.md', keys: ['z'] },
      { dst_key: 'k1', id: 'NNNN', title: 'alpha', path: 'N.md', keys: ['n'] },
      { dst_key: 'k1', id: 'MMMM', title: 'Alpha', path: 'M.md', keys: ['m'] },
      { dst_key: 'k2', id: 'BBBB', title: 'beta', path: 'B.md', keys: ['b'] },
    ];
    const { repo } = makePrisma({ note: [note], backlink });
    const page = await repo.findNote(THIS_ID);
    expect(page?.backlinks).toEqual([
      { id: 'MMMM', title: 'Alpha' },
      { id: 'NNNN', title: 'alpha' },
      { id: 'BBBB', title: 'beta' },
      { id: 'ZZZZ', title: 'zeta' },
    ]);
  });

  it('narrows null columns and skips both link queries', async () => {
    const { repo, queryRaw } = makePrisma({
      note: [noteRow({ tags: null, body: null, updated_at: null, keys: null })],
    });
    const page = await repo.findNote(NOTE_ID);
    expect(page?.tags).toEqual([]);
    expect(page?.bodyHtml).toBe(renderMarkdown('', () => null));
    expect(page?.updatedAt).toBeNull();
    expect(page?.backlinks).toEqual([]);
    expect(sqlCalls(queryRaw)).toEqual([NOTE_SQL]);
  });

  it('drops non-string array items and non-Date timestamps', async () => {
    const note = noteRow({ keys: ['ok', 3, null], tags: ['a', 7, {}], updated_at: '2026-01-01' });
    const { repo, queryRaw } = makePrisma({ note: [note] });
    const page = await repo.findNote(NOTE_ID);
    expect(page?.tags).toEqual(['a']);
    expect(page?.updatedAt).toBeNull();
    expect(queryRaw).toHaveBeenCalledWith(BACKLINK_SQL, ['ok'], NOTE_ID);
  });

  it('retries exactly once on a transient code and keeps the outcome intact', async () => {
    const { repo, queryRaw } = makePrisma({ note: [noteRow({ keys: null, body: null })] });
    queryRaw.mockRejectedValueOnce(dbError('P1001'));
    const page = await repo.findNote(NOTE_ID);
    expect(page?.id).toBe(NOTE_ID);
    expect(sqlCalls(queryRaw)).toEqual([NOTE_SQL, NOTE_SQL]);
  });

  it('propagates a second transient failure', async () => {
    const { repo, queryRaw } = makePrisma({ note: [noteRow()] });
    queryRaw.mockRejectedValueOnce(dbError('P1017')).mockRejectedValueOnce(dbError('P1017'));
    await expect(repo.findNote(NOTE_ID)).rejects.toMatchObject({ code: 'P1017' });
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('propagates other codes without retrying', async () => {
    const { repo, queryRaw } = makePrisma({ note: [noteRow()] });
    queryRaw.mockRejectedValueOnce(dbError('P9999'));
    await expect(repo.findNote(NOTE_ID)).rejects.toMatchObject({ code: 'P9999' });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('pins the SQL texts', () => {
    expect(NOTE_SQL).toBe(
      'SELECT id, path, name, title, keys, tags, frontmatter, body, hash, updated_at, indexed_at FROM brain_notes WHERE id = $1',
    );
    expect(FORWARD_SQL).toBe('SELECT id, path, title, keys FROM brain_notes WHERE keys && $1::text[]');
    expect(BACKLINK_SQL).toBe(
      'SELECT l.dst_key, n.id, n.title, n.path, n.keys FROM brain_links l JOIN brain_notes n ON n.id = l.src_id WHERE l.dst_key = ANY($1::text[]) AND l.src_id <> $2',
    );
    expect(BACKLINK_SQL).toContain('n.keys');
  });
});
