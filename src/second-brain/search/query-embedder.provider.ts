// src/second-brain/search/query-embedder.provider.ts
import { Logger } from '@nestjs/common';

import type { TransformersEmbedder } from '../embedding/transformers-embedder';
import type { QueryEmbedder } from './search.service';

const BYTES_PER_MB = 1048576;

/**
 * Web-only wrapper around the shared embedder.
 *
 * TransformersEmbedder is also constructed by the batch CI tool, so the class
 * itself must stay logging-free. The RSS line below is what the memory gate
 * greps out of the container logs, and it is only meaningful once the first
 * embedPassages call has resolved, because that is when the pipeline has
 * actually been loaded and is resident.
 */
export function createQueryEmbedder(
  embedder: Pick<TransformersEmbedder, 'embedPassages'>,
): QueryEmbedder {
  let hasLoggedLoad = false;

  return (text: string): Promise<number[]> =>
    embedder.embedPassages([text]).then((rows) => {
      // Only a resolved call proves the model is resident. A rejection falls
      // through to the keyword fallback untouched and must stay silent, so a
      // later success still gets to print the line exactly once.
      if (!hasLoggedLoad) {
        hasLoggedLoad = true;
        const rssMb = Math.ceil(process.memoryUsage().rss / BYTES_PER_MB);
        Logger.log(`brain: embedder loaded rss=${rssMb} mb`);
      }

      return rows[0] ?? [];
    });
}
