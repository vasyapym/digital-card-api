import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Guards the hand-written second-brain DDL against a later machine-generated migration.
 * `prisma migrate dev --create-only` does not know about the generated tsv column or the
 * hnsw/gin indexes and will happily emit DROP/ALTER for them; this spec fails the build
 * before that reaches production. Migrations created BEFORE the brain migration are not
 * inspected at all, so the existing card migrations can never trip it.
 */
const BRAIN_MIGRATION = '_second_brain_v1';

function findMigrationsDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, 'prisma', 'migrations');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('prisma/migrations not found above ' + __dirname);
}

function listMigrations(root: string): string[] {
  return readdirSync(root)
    .filter((name) => statSync(join(root, name)).isDirectory())
    .filter((name) => existsSync(join(root, name, 'migration.sql')))
    .sort();
}

function statements(sql: string): string[] {
  const stripped = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return stripped.split(';').map((s) => s.trim()).filter(Boolean);
}

const FORBIDDEN: ReadonlyArray<{ rule: string; re: RegExp }> = [
  { rule: 'dropping a guarded index', re: /drop\s+index\s+(concurrently\s+)?(if\s+exists\s+)?[\w."]*brain_chunks_(emb_hnsw|tsv_gin)/ },
  { rule: 'altering/renaming a guarded index', re: /alter\s+index\s+(if\s+exists\s+)?[\w."]*brain_chunks_(emb_hnsw|tsv_gin)/ },
  { rule: 'dropping brain_chunks.tsv', re: /alter\s+table\s+(if\s+exists\s+)?(only\s+)?[\w."]*brain_chunks\b[\s\S]*\bdrop\s+column\s+(if\s+exists\s+)?"?tsv"?/ },
  { rule: 'altering brain_chunks.tsv', re: /alter\s+table\s+(if\s+exists\s+)?(only\s+)?[\w."]*brain_chunks\b[\s\S]*\balter\s+column\s+"?tsv"?/ },
  { rule: 'renaming brain_chunks.tsv', re: /alter\s+table\s+(if\s+exists\s+)?(only\s+)?[\w."]*brain_chunks\b[\s\S]*\brename\s+column\s+"?tsv"?/ },
  { rule: 'dropping brain_chunks', re: /drop\s+table\s+(if\s+exists\s+)?[\w."]*brain_chunks\b/ },
  { rule: 'dropping the vector extension', re: /drop\s+extension\s+(if\s+exists\s+)?"?vector"?/ },
];

describe('prisma migrations lint', () => {
  const root = findMigrationsDir();
  const all = listMigrations(root);
  const brain = all.filter((name) => name.endsWith(BRAIN_MIGRATION));

  it('has exactly one second-brain migration', () => {
    expect(brain).toHaveLength(1);
    expect(brain[0]).toMatch(/^\d{14}_second_brain_v1$/);
  });

  it('creates the guarded objects', () => {
    const sql = readFileSync(join(root, brain[0], 'migration.sql'), 'utf8').toLowerCase();
    expect(sql).toContain('create extension if not exists vector');
    for (const table of ['brain_notes', 'brain_chunks', 'brain_links', 'brain_meta']) {
      expect(sql).toContain(`create table ${table}`);
    }
    expect(sql).toMatch(/tsv\s+tsvector\s+generated\s+always\s+as/);
    expect(sql).toMatch(/emb\s+vector\(384\)\s+not\s+null/);
    expect(sql).toContain('brain_chunks_tsv_gin');
    expect(sql).toContain('brain_chunks_emb_hnsw');
    expect(sql).toContain('brain_notes_keys_gin');
    expect(sql).toContain('brain_links_dst');
  });

  it('no later migration drops or alters tsv / the brain_chunks indexes', () => {
    const later = all.slice(all.indexOf(brain[0]) + 1);
    const violations: string[] = [];
    for (const name of later) {
      const sql = readFileSync(join(root, name, 'migration.sql'), 'utf8');
      for (const stmt of statements(sql)) {
        for (const { rule, re } of FORBIDDEN) {
          if (re.test(stmt)) violations.push(`${name}: ${rule} -> "${stmt.slice(0, 120)}"`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
