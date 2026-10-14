// src/second-brain/embedding/transformers-embedder.ts
import { EMBEDDING_DIM, MODEL_ID, resolveModelRoot } from './embedding.constants';
import { BATCH_SIZE, BatchingEmbedder } from './embedder';

type FeaturePipeline = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

export interface TransformersEmbedderOptions {
  intraOpNumThreads?: number;
}

export class TransformersEmbedder {
  private pipelinePromise: Promise<FeaturePipeline> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly batcher = new BatchingEmbedder((texts) => this.embedBatch(texts));

  constructor(private readonly options: TransformersEmbedderOptions = {}) {}

  /** Calls are serialized; batching in groups of BATCH_SIZE is delegated. */
  embedPassages(texts: string[]): Promise<number[][]> {
    const result = this.queue.then(() => this.batcher.embedPassages(texts));
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private getPipeline(): Promise<FeaturePipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = (async () => {
        const transformers = await import('@huggingface/transformers');
        const env = transformers.env as {
          allowRemoteModels: boolean;
          localModelPath: string;
        };
        env.allowRemoteModels = false;
        env.localModelPath = resolveModelRoot();
        try {
          const pipe = await (transformers.pipeline as unknown as (
            task: string,
            model: string,
            options: unknown,
          ) => Promise<FeaturePipeline>)('feature-extraction', MODEL_ID, {
            dtype: 'q8',
            session_options: {
              intraOpNumThreads: this.options.intraOpNumThreads ?? 1,
            },
          });
          return pipe;
        } catch {
          throw new Error('model load failed');
        }
      })();
    }
    return this.pipelinePromise;
  }

  private async embedBatch(texts: string[]): Promise<number[][]> {
    // Hostile inputs could make the pipeline's own tokenizer explode; the pipeline
    // truncates to the 512-token window anyway, so cap the fed text defensively.
    const SAFE_CHARS = 20000;
    texts = texts.map((t) => (t.length > SAFE_CHARS ? t.slice(0, SAFE_CHARS) : t));
    const pipe = await this.getPipeline();
    let vectors: number[][];
    try {
      const output = await pipe(texts, { pooling: 'mean', normalize: true });
      vectors = output.tolist();
    } catch {
      throw new Error('embedding failed');
    }
    for (const v of vectors) {
      if (v.length !== EMBEDDING_DIM) throw new Error('embedding failed');
    }
    return vectors;
  }
}

/** Loads the tokenizer once and returns a synchronous token counter. */
export async function loadCountTokens(): Promise<(text: string) => number> {
  const transformers = await import('@huggingface/transformers');
  const env = transformers.env as {
    allowRemoteModels: boolean;
    localModelPath: string;
  };
  env.allowRemoteModels = false;
  env.localModelPath = resolveModelRoot();
  try {
    const tokenizer = await transformers.AutoTokenizer.from_pretrained(MODEL_ID);
    const rawCount = (text: string): number => {
      // transformers.js encode() returns a plain number[] of token ids; older
      // shapes ({ input_ids: number[] | Tensor }) are covered defensively.
      const enc = tokenizer.encode(text) as unknown;
      const ids: unknown = Array.isArray(enc) ? enc : (enc as { input_ids?: unknown })?.input_ids;
      const list: readonly unknown[] | undefined = Array.isArray(ids)
        ? ids
        : (ids as { data?: readonly unknown[] } | undefined)?.data;
      const n = list?.length ?? 0;
      if (n === 0) throw new Error('tokenizer failed');
      return n;
    };
    return (text: string): number => {
      try {
        return rawCount(text);
      } catch {
        // the library's own encode() can hit call-stack limits on hostile input
        // (course-grained unicode, huge runs); degrade to a length estimate so
        // the chunker still splits instead of failing the whole run.
        const estimate = Math.ceil(text.length / 3);
        return estimate > 0 ? estimate : 1;
      }
    };
  } catch {
    throw new Error('model load failed');
  }
}
