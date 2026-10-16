// src/second-brain/search/query-embedder.provider.spec.ts
import { Logger } from '@nestjs/common';
import { createQueryEmbedder } from './query-embedder.provider';

const LOADED_LINE = /^brain: embedder loaded rss=\d+ mb$/;
const BYTES_PER_MB = 1048576;

describe('createQueryEmbedder', () => {
  let embedPassages: jest.Mock<Promise<number[][]>, [string[]]>;
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    embedPassages = jest.fn<Promise<number[][]>, [string[]]>();
    // Silence the real console output; the assertions only need the calls.
    logSpy = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards the text as a one-element batch and resolves the first row', async () => {
    embedPassages.mockResolvedValue([[0.1, 0.2, 0.3]]);
    const embed = createQueryEmbedder({ embedPassages });

    await expect(embed('hello')).resolves.toEqual([0.1, 0.2, 0.3]);
    expect(embedPassages).toHaveBeenCalledTimes(1);
    expect(embedPassages).toHaveBeenCalledWith(['hello']);
  });

  it('resolves an empty vector when the embedder returns no rows', async () => {
    embedPassages.mockResolvedValue([]);
    const embed = createQueryEmbedder({ embedPassages });

    await expect(embed('hello')).resolves.toEqual([]);
  });

  it('logs the loaded line exactly once on the first successful embed', async () => {
    embedPassages.mockResolvedValue([[1]]);
    const embed = createQueryEmbedder({ embedPassages });

    await embed('first');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(LOADED_LINE));
  });

  it('rounds the RSS up to whole megabytes', async () => {
    // The gate compares the number against a cap, so rounding down would
    // under-report by up to a full megabyte. 1.5 MB must read as 2 mb.
    jest.spyOn(process, 'memoryUsage').mockReturnValue({
      rss: 1.5 * BYTES_PER_MB,
      heapTotal: 0,
      heapUsed: 0,
      external: 0,
      arrayBuffers: 0,
    });
    embedPassages.mockResolvedValue([[1]]);
    const embed = createQueryEmbedder({ embedPassages });

    await embed('first');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('brain: embedder loaded rss=2 mb');
  });

  it('stays silent on a rejected call and logs once on the next success', async () => {
    const failure = new Error('pipeline failed to load');
    embedPassages.mockRejectedValueOnce(failure).mockResolvedValueOnce([[1]]);
    const embed = createQueryEmbedder({ embedPassages });

    await expect(embed('first')).rejects.toBe(failure);
    expect(logSpy).not.toHaveBeenCalled();

    await expect(embed('second')).resolves.toEqual([1]);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(expect.stringMatching(LOADED_LINE));
  });

  it('logs nothing more once the line has been printed', async () => {
    embedPassages.mockResolvedValue([[1]]);
    const embed = createQueryEmbedder({ embedPassages });

    await embed('first');
    await embed('second');
    await embed('third');

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('logs once even when the first searches resolve back to back', async () => {
    embedPassages.mockResolvedValue([[1]]);
    const embed = createQueryEmbedder({ embedPassages });

    await Promise.all([embed('a'), embed('b'), embed('c')]);

    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});
