// src/second-brain/embedding/embedder.spec.ts
import { EMBEDDING_DIM, PASSAGE_PREFIX } from './embedding.constants';
import { BATCH_SIZE, BatchingEmbedder, passageInput } from './embedder';

describe('passageInput', () => {
  it('formats exactly with a spaced em dash and newline', () => {
    expect(passageInput('Title', 'A > B', 'body text')).toBe(
      `${PASSAGE_PREFIX}Title — A > B\nbody text`,
    );
  });
});

describe('BatchingEmbedder', () => {
  it('sends sequential batches of BATCH_SIZE, keeping order and dims', async () => {
    const calls: string[][] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let seq = 0;

    const embedder = new BatchingEmbedder(async (texts) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      calls.push(texts);
      await Promise.resolve();
      const vectors = texts.map(() => {
        const v = new Array<number>(EMBEDDING_DIM).fill(0);
        v[0] = seq;
        seq += 1;
        return v;
      });
      inFlight -= 1;
      return vectors;
    });

    const inputs = Array.from({ length: 70 }, (_, i) =>
      passageInput(`Note ${i}`, 'Heading', `chunk body ${i}`),
    );
    const out = await embedder.embedPassages(inputs);

    expect(calls.map((batch) => batch.length)).toEqual([BATCH_SIZE, BATCH_SIZE, 6]);
    expect(maxInFlight).toBe(1);
    expect(out).toHaveLength(70);
    out.forEach((vector, i) => {
      expect(vector).toHaveLength(EMBEDDING_DIM);
      expect(vector[0]).toBe(i);
    });
    expect(calls.flat()).toEqual(inputs);
    for (const batch of calls) {
      for (const text of batch) {
        expect(text.startsWith(PASSAGE_PREFIX)).toBe(true);
      }
    }
  });

  it('handles an empty input without calling the backend', async () => {
    let called = 0;
    const embedder = new BatchingEmbedder(async (texts) => {
      called += 1;
      return texts.map(() => new Array<number>(EMBEDDING_DIM).fill(0));
    });
    expect(await embedder.embedPassages([])).toEqual([]);
    expect(called).toBe(0);
  });
});
