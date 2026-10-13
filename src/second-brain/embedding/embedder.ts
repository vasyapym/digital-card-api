// src/second-brain/embedding/embedder.ts
import { PASSAGE_PREFIX } from './embedding.constants';

export const BATCH_SIZE = 32;

export interface PassageEmbedder {
  embedPassages(texts: string[]): Promise<number[][]>;
}

/** "passage: <title> — <trail>\n<text>" (real U+2014 em dash). */
export function passageInput(title: string, trail: string, text: string): string {
  return `${PASSAGE_PREFIX}${title} — ${trail}\n${text}`;
}

export type EmbedBackend = (texts: string[]) => Promise<number[][]>;

/** Feeds the backend sequential batches of at most BATCH_SIZE, keeping order. */
export class BatchingEmbedder implements PassageEmbedder {
  constructor(private readonly backend: EmbedBackend) {}

  async embedPassages(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const vectors = await this.backend(texts.slice(i, i + BATCH_SIZE));
      out.push(...vectors);
    }
    return out;
  }
}
