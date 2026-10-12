import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * The second brain is server-rendered + REST only. It must never leak into (or pull in)
 * the card API's GraphQL surface: a brain resolver would publish private note content
 * through the public schema. Cheap structural guard, runs offline.
 */
const BRAIN_DIR = __dirname;
const ALLOWLIST = new Set([basename(__filename)]);

const BANNED: ReadonlyArray<{ rule: string; re: RegExp }> = [
  { rule: '@nestjs/graphql import', re: /@nestjs\/graphql/ },
  { rule: 'graphql package import', re: /from\s+['"]graphql(\/|['"])/ },
  { rule: 'apollo import', re: /@apollo\// },
  { rule: '@Resolver()', re: /@Resolver\s*\(/ },
  { rule: '@ObjectType()', re: /@ObjectType\s*\(/ },
  { rule: '@InputType()', re: /@InputType\s*\(/ },
  { rule: '@Mutation()', re: /@Mutation\s*\(/ },
  { rule: '@Subscription()', re: /@Subscription\s*\(/ },
  { rule: 'gql template tag', re: /\bgql`/ },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(entry) && !ALLOWLIST.has(entry)) out.push(full);
  }
  return out;
}

describe('second-brain stays off GraphQL', () => {
  it('has a source directory to lint', () => {
    expect(existsSync(BRAIN_DIR)).toBe(true);
  });

  it('contains no GraphQL imports or decorators', () => {
    const violations: string[] = [];
    for (const file of walk(BRAIN_DIR)) {
      const src = readFileSync(file, 'utf8');
      for (const { rule, re } of BANNED) {
        if (re.test(src)) violations.push(`${file.slice(file.indexOf('src'))}: ${rule}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
