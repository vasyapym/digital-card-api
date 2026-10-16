// src/second-brain/search/search.service.spec.ts
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { PrismaService } from '../../prisma/prisma.service';
import { SIGNATURE } from '../embedding/embedding.constants';
import { HEADLINE_OPTS, HYBRID_SQL, KEYWORD_SQL, META_SQL } from './search.sql';
import { KEYWORD_NOTICE, PAUSED_NOTICE, SearchService } from './search.service';

interface MetaRow {
  key: string;
  value: string;
}

interface HarnessOptions {
  semantic: boolean;
  meta?: MetaRow[];
  hits?: unknown[];
}

const META_PARAMS = ['embed_signature'];
const SIGNATURE_ROW: MetaRow = { key: 'embed_signature', value: SIGNATURE };

// Hand fakes: the prisma stub routes by SQL text, the config stub answers the flag only.
const makeHarness = (opts: HarnessOptions) => {
  const meta = opts.meta ?? [];
  const hits = opts.hits ?? [];
  const raw = jest.fn(
    async (sql: string, ..._params: unknown[]): Promise<unknown> =>
      sql === META_SQL ? meta : hits,
  );
  const embedder = jest.fn(async (_text: string): Promise<number[]> => [0.1, 0.2]);
  const config = {
    get: (key: string, _opts?: { infer?: boolean }) =>
      key === 'BRAIN_SEMANTIC' ? opts.semantic : undefined,
  };
  const service = new SearchService(
    { $queryRawUnsafe: raw } as unknown as PrismaService,
    config as unknown as ConfigService<Env, true>,
    embedder,
  );
  return { service, raw, embedder };
};

describe('SearchService', () => {
  it('runs the metadata SELECT first and the search SELECT second', async () => {
    const h = makeHarness({ semantic: false });
    await h.service.search('alpha');
    expect(h.raw.mock.calls).toEqual([
      [META_SQL, META_PARAMS],
      [KEYWORD_SQL, 'alpha', HEADLINE_OPTS],
    ]);
  });

  it('flag false: keyword SQL, embedder untouched, KEYWORD_NOTICE', async () => {
    const h = makeHarness({ semantic: false, meta: [SIGNATURE_ROW] });
    const result = await h.service.search('alpha beta');
    expect(h.raw).toHaveBeenCalledTimes(2);
    expect(h.raw).toHaveBeenNthCalledWith(2, KEYWORD_SQL, 'alpha beta', HEADLINE_OPTS);
    expect(h.embedder).not.toHaveBeenCalled();
    expect(result.notices).toEqual([KEYWORD_NOTICE]);
  });

  it('flag true, no embed_signature row: keyword SQL with PAUSED_NOTICE', async () => {
    const h = makeHarness({ semantic: true });
    const result = await h.service.search('alpha');
    expect(h.raw).toHaveBeenNthCalledWith(2, KEYWORD_SQL, 'alpha', HEADLINE_OPTS);
    expect(h.embedder).not.toHaveBeenCalled();
    expect(result.notices).toEqual([PAUSED_NOTICE]);
  });

  it('flag true, signature mismatch: keyword SQL with PAUSED_NOTICE', async () => {
    const h = makeHarness({
      semantic: true,
      meta: [{ key: 'embed_signature', value: 'not-our-signature' }],
    });
    const result = await h.service.search('alpha');
    expect(h.raw).toHaveBeenNthCalledWith(2, KEYWORD_SQL, 'alpha', HEADLINE_OPTS);
    expect(h.embedder).not.toHaveBeenCalled();
    expect(result.notices).toEqual([PAUSED_NOTICE]);
  });

  it('flag true, matching signature, embedder ok: hybrid SQL with the vector literal', async () => {
    const h = makeHarness({ semantic: true, meta: [SIGNATURE_ROW] });
    const result = await h.service.search('alpha');
    expect(h.embedder).toHaveBeenCalledTimes(1);
    expect(h.embedder).toHaveBeenCalledWith('query: alpha');
    expect(h.raw).toHaveBeenNthCalledWith(
      2,
      HYBRID_SQL,
      'alpha',
      '[0.1,0.2]',
      HEADLINE_OPTS,
    );
    expect(result.notices).toEqual([]);
  });

  it('flag true, embedder rejects: keyword fallback with KEYWORD_NOTICE', async () => {
    const h = makeHarness({ semantic: true, meta: [SIGNATURE_ROW] });
    let rawCallsBeforeFailure = -1;
    h.embedder.mockImplementationOnce(async () => {
      rawCallsBeforeFailure = h.raw.mock.calls.length;
      throw new Error('embedder down');
    });
    const result = await h.service.search('alpha');
    expect(rawCallsBeforeFailure).toBe(1);
    expect(h.raw).toHaveBeenCalledTimes(2);
    expect(h.raw).toHaveBeenNthCalledWith(2, KEYWORD_SQL, 'alpha', HEADLINE_OPTS);
    expect(result.notices).toEqual([KEYWORD_NOTICE]);
  });

  it.each(['P1001', 'P1017'])(
    'retries a %s failure exactly once',
    async (code) => {
      const h = makeHarness({ semantic: false });
      h.raw.mockRejectedValueOnce(Object.assign(new Error('cold start'), { code }));
      const result = await h.service.search('alpha');
      expect(result).toEqual({ hits: [], notices: [KEYWORD_NOTICE] });
      expect(h.raw).toHaveBeenCalledTimes(3);
      expect(h.raw.mock.calls).toEqual([
        [META_SQL, META_PARAMS],
        [META_SQL, META_PARAMS],
        [KEYWORD_SQL, 'alpha', HEADLINE_OPTS],
      ]);
    },
  );

  it('does not retry other error codes', async () => {
    const h = makeHarness({ semantic: false });
    const error = Object.assign(new Error('boom'), { code: 'P9999' });
    h.raw.mockRejectedValueOnce(error);
    await expect(h.service.search('alpha')).rejects.toBe(error);
    expect(h.raw).toHaveBeenCalledTimes(1);
  });

  it('maps rows to six string fields and drops anything else', async () => {
    const full = {
      id: 'n1',
      title: 'Title',
      path: 'notes/a.md',
      heading: 'H2',
      anchor: 'h2',
      snippet: 'S',
      junk: 42,
    };
    const sparse = {
      id: 'n2',
      title: null,
      path: 7,
      heading: undefined,
      anchor: {},
      snippet: ['x'],
    };
    const h = makeHarness({ semantic: false, hits: [full, sparse] });
    const result = await h.service.search('alpha');
    expect(result.hits).toStrictEqual([
      { id: 'n1', title: 'Title', path: 'notes/a.md', heading: 'H2', anchor: 'h2', snippet: 'S' },
      { id: 'n2', title: '', path: '', heading: '', anchor: '', snippet: '' },
    ]);
  });
});

describe('search SQL constants', () => {
  const occurrences = (text: string, needle: string): number =>
    text.split(needle).length - 1;

  it('pins the shared CTE shape', () => {
    for (const sql of [HYBRID_SQL, KEYWORD_SQL]) {
      expect(sql).toContain("websearch_to_tsquery('russian', $1)");
      expect(sql).toContain("websearch_to_tsquery('english', $1)");
      expect(sql).toContain('sum(1.0 / (60 + r))');
      expect(sql).toContain('ORDER BY b.score DESC');
      expect(sql).toContain('LIMIT 20');
    }
  });

  it('differs only by the vector leg and the headline parameter slot', () => {
    expect(occurrences(HYBRID_SQL, 'LIMIT 40')).toBe(2);
    expect(occurrences(KEYWORD_SQL, 'LIMIT 40')).toBe(1);
    expect(HYBRID_SQL).toContain('$2::vector');
    expect(KEYWORD_SQL).not.toContain('::vector');
    expect(HYBRID_SQL).toContain('q.tsq, $3)');
    expect(KEYWORD_SQL).toContain('q.tsq, $2)');
  });

  it('pins the headline markers and limits', () => {
    expect(HEADLINE_OPTS).toBe(
      'StartSel=\uE000, StopSel=\uE001, MaxWords=30, MinWords=12, MaxFragments=2',
    );
  });
});
