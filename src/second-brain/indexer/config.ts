// src/second-brain/indexer/config.ts
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

const envSchema = z.object({
  BRAIN_DB_URL: z
    .string()
    .url()
    .refine(
      (u) => u.startsWith('postgres://') || u.startsWith('postgresql://'),
      'BRAIN_DB_URL must be a postgres URL',
    ),
  BRAIN_VAULT_DIR: z.string().min(1),
  BRAIN_FULL: z
    .enum(['0', '1'])
    .default('0')
    .transform((v) => v === '1'),
});

export type IndexerEnv = z.infer<typeof envSchema>;

export function parseEnv(env: NodeJS.ProcessEnv): IndexerEnv {
  return envSchema.parse(env);
}

export interface VaultConfig {
  excludeFolders?: string[];
}

/** Reads <vault>/.second-brain/config.json; missing or invalid JSON -> {}. */
export function loadVaultConfig(vaultDir: string): VaultConfig {
  try {
    const raw = fs.readFileSync(path.join(vaultDir, '.second-brain', 'config.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: VaultConfig = {};
    const folders = (parsed as { excludeFolders?: unknown }).excludeFolders;
    if (Array.isArray(folders)) {
      out.excludeFolders = folders.filter((f): f is string => typeof f === 'string');
    }
    return out;
  } catch {
    return {};
  }
}
