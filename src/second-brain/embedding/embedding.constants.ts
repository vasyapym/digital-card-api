/**
 * Embedding model identity — a CODE constant, deliberately not an environment variable:
 * vectors written by one model are meaningless to another, so the model is part of the
 * build, not of the deployment config. Changing anything below means a full re-embed.
 */

/** Hugging Face repo id. */
export const MODEL_ID = 'Xenova/multilingual-e5-small';

/**
 * Hugging Face commit sha this build pins to.
 * UNPINNED ('main') is tolerated by fetch-model with a loud warning; it refuses to pass
 * when BRAIN_MODEL_STRICT=1. Re-pin with the sha fetch-model prints.
 */
export const REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';

/** Quantised int8 graph: 384-dim output, ~118 MB. */
export const ONNX_FILE = 'onnx/model_quantized.onnx';

/**
 * sha256 of ONNX_FILE at REVISION. Empty string = not pinned yet; once set, any mismatch
 * is a hard build failure. fetch-model prints the real digest on its first run.
 */
export const ONNX_SHA256 = 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193';

/** Output dimensionality — must equal vector(384) in brain_chunks.emb. */
export const EMBEDDING_DIM = 384;

/** Pooling/normalisation contract used by the (M2) encoder: mean pooling + L2 normalise. */
export const POOLING = 'mean' as const;
export const NORMALIZE = true as const;

/** e5 asymmetric prefixes — never embed raw text with this family. */
export const QUERY_PREFIX = 'query: ';
export const PASSAGE_PREFIX = 'passage: ';

/** major.minor of @huggingface/transformers this build is pinned to (see package.json). */
export const TRANSFORMERS_MAJOR_MINOR = '3.5';

/**
 * Everything that can invalidate stored vectors, in one string. Stored in brain_meta so
 * the indexer can detect "the model changed" and force a full re-embed.
 */
export const SIGNATURE =
  `${MODEL_ID}@${REVISION}#q8#mean-norm#e5-prefix-v1#${EMBEDDING_DIM}#transformers-${TRANSFORMERS_MAJOR_MINOR}`;

export interface ModelFile {
  /** repo-relative path, also the on-disk path under the model dir */
  readonly path: string;
  /** optional files are skipped on 404 instead of failing the build */
  readonly required: boolean;
}

/** Weights + tokenizer + config. Nothing else is downloaded, ever. */
export const MODEL_FILES: readonly ModelFile[] = [
  { path: 'config.json', required: true },
  { path: 'tokenizer.json', required: true },
  { path: 'tokenizer_config.json', required: true },
  { path: 'special_tokens_map.json', required: false },
  { path: ONNX_FILE, required: true },
];

export const HF_ENDPOINT = 'https://huggingface.co';

/**
 * Where the baked model lives. The Dockerfile fetches into /app/models in the build stage
 * and copies that directory into the runtime stage, so nothing downloads at runtime.
 * Overridable only for local development.
 */
export const DEFAULT_MODEL_DIR = '/app/models';
export const MODEL_DIR_ENV = 'BRAIN_MODEL_DIR';

export function resolveModelRoot(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[MODEL_DIR_ENV];
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_MODEL_DIR;
}

/** Layout matches transformers.js `env.localModelPath`: <root>/<org>/<model>/<file>. */
export function modelFilePath(root: string, file: string): string {
  return [root, ...MODEL_ID.split('/'), ...file.split('/')].join('/');
}

export const MANIFEST_FILE = 'MANIFEST.json';

export function isPinnedRevision(revision: string = REVISION): boolean {
  return /^[0-9a-f]{40}$/.test(revision);
}

export function isPinnedSha256(sha: string = ONNX_SHA256): boolean {
  return /^[0-9a-f]{64}$/.test(sha);
}
