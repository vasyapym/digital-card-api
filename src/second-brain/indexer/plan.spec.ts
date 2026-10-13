// src/second-brain/indexer/plan.spec.ts
import { applyActions, chooseMode, ChooseModeInput } from './plan';

const base: ChooseModeInput = {
  brainFull: false,
  storedSha: 'abc123',
  headShaExists: true,
  storedSignature: 'sig-v1',
  signature: 'sig-v1',
  storedChunkerVersion: 1,
  chunkerVersion: 1,
};

describe('chooseMode', () => {
  it('is incremental when everything matches', () => {
    expect(chooseMode(base)).toBe('incremental');
  });

  it('is full when BRAIN_FULL is set', () => {
    expect(chooseMode({ ...base, brainFull: true })).toBe('full');
  });

  it('is full when there is no stored sha', () => {
    expect(chooseMode({ ...base, storedSha: null })).toBe('full');
  });

  it('is full when the stored sha is unknown to git', () => {
    expect(chooseMode({ ...base, headShaExists: false })).toBe('full');
  });

  it('is full when the embedding signature changed', () => {
    expect(chooseMode({ ...base, storedSignature: 'sig-v0' })).toBe('full');
    expect(chooseMode({ ...base, storedSignature: null })).toBe('full');
  });

  it('is full when the chunker version changed', () => {
    expect(chooseMode({ ...base, storedChunkerVersion: 0 })).toBe('full');
    expect(chooseMode({ ...base, storedChunkerVersion: null })).toBe('full');
  });
});

describe('applyActions', () => {
  it('incremental: A/M/T upsert, D delete', () => {
    const plan = applyActions({
      mode: 'incremental',
      changes: [
        { status: 'A', path: 'a.md' },
        { status: 'M', path: 'b.md' },
        { status: 'T', path: 'c.md' },
        { status: 'D', path: 'd.md' },
      ],
      excludedPaths: [],
    });
    expect([...plan.upsertPaths].sort()).toEqual(['a.md', 'b.md', 'c.md']);
    expect(plan.deletePaths).toEqual(['d.md']);
  });

  it('rename becomes delete old plus upsert new', () => {
    const plan = applyActions({
      mode: 'incremental',
      changes: [{ status: 'R', path: 'new.md', oldPath: 'old.md' }],
      excludedPaths: [],
    });
    expect(plan.upsertPaths).toEqual(['new.md']);
    expect(plan.deletePaths).toEqual(['old.md']);
  });

  it('full upserts every listed path', () => {
    const plan = applyActions({
      mode: 'full',
      fullPaths: ['a.md', 'b.md'],
      excludedPaths: [],
    });
    expect([...plan.upsertPaths].sort()).toEqual(['a.md', 'b.md']);
    expect(plan.deletePaths).toEqual([]);
  });

  it('excluded paths become deletions', () => {
    const plan = applyActions({
      mode: 'full',
      fullPaths: ['keep.md', 'junk/x.md'],
      excludedPaths: ['junk/x.md'],
    });
    expect(plan.upsertPaths).toEqual(['keep.md']);
    expect(plan.deletePaths).toEqual(['junk/x.md']);
  });

  it('frontmatter brain:false becomes a deletion', () => {
    const plan = applyActions({
      mode: 'incremental',
      changes: [{ status: 'M', path: 'private.md' }],
      excludedPaths: [],
      brainFalsePaths: ['private.md'],
    });
    expect(plan.upsertPaths).toEqual([]);
    expect(plan.deletePaths).toEqual(['private.md']);
  });
});
