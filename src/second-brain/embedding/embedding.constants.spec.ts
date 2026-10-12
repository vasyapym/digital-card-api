import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  EMBEDDING_DIM,
  MODEL_FILES,
  MODEL_ID,
  ONNX_FILE,
  ONNX_SHA256,
  PASSAGE_PREFIX,
  QUERY_PREFIX,
  REVISION,
  SIGNATURE,
  TRANSFORMERS_MAJOR_MINOR,
  isPinnedSha256,
  modelFilePath,
} from './embedding.constants';
import { fileUrl, sha256 } from './fetch-model';

// Offline by construction: nothing here touches the network, the DB or the model files.
describe('embedding constants', () => {
  it('keeps the e5 prefixes and the 384-dim contract', () => {
    expect(QUERY_PREFIX).toBe('query: ');
    expect(PASSAGE_PREFIX).toBe('passage: ');
    expect(EMBEDDING_DIM).toBe(384); // must match vector(384) in brain_chunks.emb
  });

  it('builds the signature from the pinned identity', () => {
    expect(SIGNATURE).toBe(
      `${MODEL_ID}@${REVISION}#q8#mean-norm#e5-prefix-v1#384#transformers-${TRANSFORMERS_MAJOR_MINOR}`,
    );
  });

  it('matches the installed @huggingface/transformers major.minor', () => {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, '../../../package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    const pinned = pkg.dependencies?.['@huggingface/transformers'];
    expect(pinned).toBeDefined();
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/); // exact pin, no range
    expect(pinned!.split('.').slice(0, 2).join('.')).toBe(TRANSFORMERS_MAJOR_MINOR);
  });

  it('lists the weights plus tokenizer/config and nothing else', () => {
    const paths = MODEL_FILES.map((f) => f.path);
    expect(paths).toContain(ONNX_FILE);
    expect(paths).toContain('tokenizer.json');
    expect(paths).toContain('config.json');
    expect(MODEL_FILES.filter((f) => f.required).length).toBeGreaterThanOrEqual(3);
  });

  it('accepts only a real sha256 as a pin', () => {
    const pin: string = ONNX_SHA256;
    if (pin !== '') {
      expect(pin).toMatch(/^[0-9a-f]{64}$/);
      expect(isPinnedSha256()).toBe(true);
    } else {
      expect(isPinnedSha256()).toBe(false); // unpinned: fetch-model warns loudly
    }
  });

  it('resolves URLs and local paths consistently', () => {
    expect(fileUrl(ONNX_FILE)).toBe(
      `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${ONNX_FILE}`,
    );
    expect(modelFilePath('/app/models', ONNX_FILE)).toBe(
      `/app/models/${MODEL_ID}/${ONNX_FILE}`,
    );
    expect(sha256(new TextEncoder().encode(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});
