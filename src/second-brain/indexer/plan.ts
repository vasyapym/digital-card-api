// src/second-brain/indexer/plan.ts
export type IndexMode = 'full' | 'incremental';

export interface ChooseModeInput {
  brainFull: boolean;
  storedSha: string | null;
  headShaExists: boolean;
  storedSignature: string | null;
  signature: string;
  storedChunkerVersion: number | null;
  chunkerVersion: number;
}

export function chooseMode(input: ChooseModeInput): IndexMode {
  if (input.brainFull) return 'full';
  if (!input.storedSha) return 'full';
  if (!input.headShaExists) return 'full';
  if (input.storedSignature !== input.signature) return 'full';
  if (input.storedChunkerVersion !== input.chunkerVersion) return 'full';
  return 'incremental';
}

export interface FileChange {
  status: 'A' | 'M' | 'T' | 'D' | 'R';
  path: string;
  oldPath?: string;
}

export interface PlanInput {
  mode: IndexMode;
  fullPaths?: string[];
  changes?: FileChange[];
  excludedPaths: Iterable<string>;
  brainFalsePaths?: Iterable<string>;
}

export interface Plan {
  upsertPaths: string[];
  deletePaths: string[];
}

export function applyActions(input: PlanInput): Plan {
  const excluded = new Set(input.excludedPaths);
  const brainFalse = new Set(input.brainFalsePaths ?? []);
  const upserts = new Set<string>();
  const deletes = new Set<string>();

  if (input.mode === 'full') {
    for (const p of input.fullPaths ?? []) upserts.add(p);
  } else {
    for (const c of input.changes ?? []) {
      if (c.status === 'D') {
        deletes.add(c.path);
      } else if (c.status === 'R') {
        if (c.oldPath) deletes.add(c.oldPath);
        upserts.add(c.path);
      } else {
        upserts.add(c.path);
      }
    }
  }

  for (const p of [...upserts]) {
    if (excluded.has(p) || brainFalse.has(p)) {
      upserts.delete(p);
      deletes.add(p);
    }
  }
  for (const p of deletes) upserts.delete(p);

  return { upsertPaths: [...upserts], deletePaths: [...deletes] };
}
