// src/second-brain/indexer/log.spec.ts
import { formatSummary, redactError } from './log';

describe('formatSummary', () => {
  it('formats the incremental line exactly', () => {
    const line = formatSummary({
      mode: 'incremental',
      changed: 3,
      deleted: 1,
      unchanged: 2,
      notes: 3,
      chunks: 11,
      links: 7,
      yamlErrors: 0,
      skippedUtf8: 0,
      ms: 8421,
    });
    expect(line).toBe(
      'index: mode=incremental changed=3 deleted=1 unchanged=2 notes=3 chunks=11 links=7 yaml_errors=0 skipped_utf8=0 ms=8421',
    );
    expect(line.split('\n')).toHaveLength(1);
  });

  it('formats the full line exactly', () => {
    const line = formatSummary({
      mode: 'full',
      changed: 120,
      deleted: 0,
      unchanged: 0,
      notes: 120,
      chunks: 540,
      links: 300,
      yamlErrors: 2,
      skippedUtf8: 1,
      ms: 90000,
    });
    expect(line).toBe(
      'index: mode=full changed=120 deleted=0 unchanged=0 notes=120 chunks=540 links=300 yaml_errors=2 skipped_utf8=1 ms=90000',
    );
  });
});

describe('redactError', () => {
  it('keeps name and string code, never message, stack or paths', () => {
    const err = Object.assign(new Error('ENOENT: no such file /vault/secret-note.md'), {
      code: 'ENOENT',
    });
    const out = redactError(err);
    expect(out).toEqual({ name: 'Error', code: 'ENOENT' });
    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain('secret-note');
    expect(serialized).not.toContain('vault');
    expect(serialized).not.toContain('no such file');
  });

  it('uses the constructor name', () => {
    expect(redactError(new TypeError('boom'))).toEqual({ name: 'TypeError' });
  });

  it('drops non-string codes', () => {
    const err = Object.assign(new RangeError('bad'), { code: 42 });
    const out = redactError(err);
    expect(out.name).toBe('RangeError');
    expect(out.code).toBeUndefined();
  });

  it('survives non-error values', () => {
    expect(redactError('oops /tmp/leak.md').name).toBe('String');
    expect(JSON.stringify(redactError('oops /tmp/leak.md'))).not.toContain('leak');
  });
});
