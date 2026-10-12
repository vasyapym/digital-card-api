#!/usr/bin/env node
/**
 * BUILD-TIME ONLY. Downloads the pinned embedding model into the image.
 *
 *   docker build stage:  RUN node dist/second-brain/embedding/fetch-model.js
 *
 * Runtime never touches the network. Tests never run this file (no side effects on
 * import — main() only runs when the module is the process entry point).
 *
 * Exit codes: 0 ok (possibly with warnings), 1 fetch/verification failure.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import {
  HF_ENDPOINT,
  MANIFEST_FILE,
  MODEL_FILES,
  MODEL_ID,
  ONNX_FILE,
  ONNX_SHA256,
  REVISION,
  SIGNATURE,
  isPinnedRevision,
  isPinnedSha256,
  modelFilePath,
  resolveModelRoot,
} from './embedding.constants';

export function fileUrl(file: string, revision: string = REVISION): string {
  return `${HF_ENDPOINT}/${MODEL_ID}/resolve/${revision}/${file}`;
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

interface Downloaded {
  bytes: Uint8Array;
  commit: string | null;
}

async function download(url: string): Promise<Downloaded | null> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'second-brain-fetch-model' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, commit: res.headers.get('x-repo-commit') };
}

async function writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, path);
}

export async function main(): Promise<void> {
  const root = resolveModelRoot();
  const strict = process.env.BRAIN_MODEL_STRICT === '1';
  const warnings: string[] = [];
  const digests: Record<string, string> = {};
  let resolvedCommit: string | null = null;

  console.log(`[fetch-model] ${MODEL_ID}@${REVISION} -> ${root}`);

  for (const file of MODEL_FILES) {
    const dest = modelFilePath(root, file.path);
    let bytes: Uint8Array;

    if (await exists(dest)) {
      bytes = new Uint8Array(await readFile(dest));
      console.log(`[fetch-model] cached  ${file.path} (${bytes.byteLength} bytes)`);
    } else {
      const got = await download(fileUrl(file.path));
      if (got === null) {
        if (file.required) throw new Error(`required model file missing upstream: ${file.path}`);
        console.log(`[fetch-model] absent  ${file.path} (optional)`);
        continue;
      }
      resolvedCommit ??= got.commit;
      bytes = got.bytes;
      await writeAtomic(dest, bytes);
      console.log(`[fetch-model] fetched ${file.path} (${bytes.byteLength} bytes)`);
    }
    digests[file.path] = sha256(bytes);
  }

  // ── verification ────────────────────────────────────────────────────────────
  const onnxDigest = digests[ONNX_FILE];
  if (!onnxDigest) throw new Error(`no digest computed for ${ONNX_FILE}`);

  if (isPinnedSha256()) {
    if (onnxDigest !== ONNX_SHA256) {
      throw new Error(
        `sha256 mismatch for ${ONNX_FILE}\n  expected ${ONNX_SHA256}\n  actual   ${onnxDigest}\n` +
          'The upstream file changed or the revision is wrong. Re-pin deliberately.',
      );
    }
    console.log(`[fetch-model] sha256 ok ${onnxDigest}`);
  } else {
    warnings.push(`ONNX_SHA256 is not pinned; actual digest is ${onnxDigest}`);
  }

  if (!isPinnedRevision()) {
    warnings.push(
      `REVISION is '${REVISION}', not a commit sha` +
        (resolvedCommit ? `; upstream resolved to ${resolvedCommit}` : ''),
    );
  }

  if (warnings.length > 0) {
    console.warn('\n[fetch-model] ACTION REQUIRED — pin these in embedding.constants.ts:');
    for (const w of warnings) console.warn(`  - ${w}`);
    if (resolvedCommit) console.warn(`  export const REVISION = '${resolvedCommit}';`);
    console.warn(`  export const ONNX_SHA256 = '${onnxDigest}';`);
    if (strict) throw new Error('BRAIN_MODEL_STRICT=1 and the model is not fully pinned');
    console.warn('[fetch-model] continuing (BRAIN_MODEL_STRICT is not set)\n');
  }

  await writeAtomic(
    modelFilePath(root, MANIFEST_FILE),
    new TextEncoder().encode(
      `${JSON.stringify(
        {
          signature: SIGNATURE,
          modelId: MODEL_ID,
          revision: REVISION,
          resolvedCommit,
          pinned: isPinnedRevision() && isPinnedSha256(),
          digests,
          fetchedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    ),
  );

  console.log('[fetch-model] done');
}

// CommonJS entry guard (nest build emits CJS) — importing this file is side-effect free.
if (typeof require !== 'undefined' && require.main === module) {
  main().catch((err: unknown) => {
    console.error(`[fetch-model] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
