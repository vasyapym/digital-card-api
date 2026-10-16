// src/second-brain/search/search.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { QUERY_PREFIX, SIGNATURE } from '../embedding/embedding.constants';
import { HEADLINE_OPTS, HYBRID_SQL, KEYWORD_SQL, META_SQL } from './search.sql';

// Boundary contract for the later view piece. The snippet is RAW: the view
// escapes it and then swaps the U+E000/U+E001 markers for highlight tags.
export interface SearchHit {
  id: string;
  title: string;
  path: string;
  heading: string;
  anchor: string;
  snippet: string;
}

export interface SearchResults {
  hits: SearchHit[];
  notices: string[];
}

// DI token for the query embedder; the provider is wired in a later piece.
export const QUERY_EMBEDDER = Symbol('QUERY_EMBEDDER');
export type QueryEmbedder = (text: string) => Promise<number[]>;

// Pinned user-facing notices (plain text, rendered verbatim by the view).
export const KEYWORD_NOTICE = 'keyword-only search (semantic off or unavailable)';
export const PAUSED_NOTICE = 'search paused: index built with a different model';

const SIGNATURE_KEY = 'embed_signature';
const META_KEYS: readonly string[] = [SIGNATURE_KEY];
const RETRY_CODES = new Set(['P1001', 'P1017']);
const RETRY_DELAY_MS = 500;

interface MetaRow {
  key: string;
  value: string;
}

// Raw search row; every field is narrowed with typeof before it leaves the service.
type HitRow = Partial<Record<keyof SearchHit, unknown>>;

interface QueryPlan {
  sql: string;
  params: unknown[];
  notices: string[];
}

const asText = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const toHit = (row: HitRow): SearchHit => ({
  id: asText(row.id),
  title: asText(row.title),
  path: asText(row.path),
  heading: asText(row.heading),
  anchor: asText(row.anchor),
  snippet: asText(row.snippet),
});

const toMetaMap = (rows: MetaRow[]): Map<string, string> =>
  new Map<string, string>(
    rows.map((row): [string, string] => [row.key, row.value]),
  );

// pgvector accepts the text form '[x,y,...]'; the SQL casts it with ::vector.
const toVectorLiteral = (vector: number[]): string =>
  '[' + vector.map(String).join(',') + ']';

const keywordPlan = (q: string, notice: string): QueryPlan => ({
  sql: KEYWORD_SQL,
  params: [q, HEADLINE_OPTS],
  notices: [notice],
});

const errorCode = (e: unknown): unknown =>
  typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;

const isColdStartError = (e: unknown): boolean => {
  const code = errorCode(e);
  return typeof code === 'string' && RETRY_CODES.has(code);
};

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(QUERY_EMBEDDER) private readonly embedder: QueryEmbedder,
  ) {}

  // SIGNATURE/QUERY_PREFIX come from the shared embedding constants: the gate
  // cannot drift from what the indexer stores at full-rebuild time.
  public async search(q: string): Promise<SearchResults> {
    const meta = await this.runQuery<MetaRow>(META_SQL, [META_KEYS]);
    const plan = await this.buildPlan(q, toMetaMap(meta));
    const rows = await this.runQuery<HitRow>(plan.sql, plan.params);
    return { hits: rows.map(toHit), notices: plan.notices };
  }

  // Three-way gate: flag -> stored signature -> embedder. Every miss downgrades to keyword.
  private async buildPlan(q: string, meta: Map<string, string>): Promise<QueryPlan> {
    if (!this.config.get('BRAIN_SEMANTIC', { infer: true })) {
      return keywordPlan(q, KEYWORD_NOTICE);
    }
    const storedSignature = meta.get(SIGNATURE_KEY) ?? null;
    if (storedSignature !== SIGNATURE) {
      return keywordPlan(q, PAUSED_NOTICE);
    }
    let vector: number[];
    try {
      vector = await this.embedder(QUERY_PREFIX + q);
    } catch {
      return keywordPlan(q, KEYWORD_NOTICE);
    }
    return {
      sql: HYBRID_SQL,
      params: [q, toVectorLiteral(vector), HEADLINE_OPTS],
      notices: [],
    };
  }

  // One raw query; a Neon cold-start failure (P1001/P1017) is retried exactly once.
  private async runQuery<Row>(sql: string, params: unknown[]): Promise<Row[]> {
    try {
      return await this.prisma.$queryRawUnsafe<Row[]>(sql, ...params);
    } catch (e: unknown) {
      if (!isColdStartError(e)) {
        throw e;
      }
      await sleep(RETRY_DELAY_MS);
      return this.prisma.$queryRawUnsafe<Row[]>(sql, ...params);
    }
  }
}
