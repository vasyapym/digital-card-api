// src/second-brain/auth/hash-passphrase.spec.ts
import { stripTrailingNl } from './hash-passphrase';

// Only the pure helper is exercised; the CLI body runs solely under require.main.
describe('stripTrailingNl', () => {
  it('leaves input without a trailing newline unchanged', () => {
    expect(stripTrailingNl('abc')).toBe('abc');
    expect(stripTrailingNl('')).toBe('');
  });

  it('removes exactly one trailing LF', () => {
    expect(stripTrailingNl('abc\n')).toBe('abc');
    expect(stripTrailingNl('abc\n\n')).toBe('abc\n');
    expect(stripTrailingNl('\n')).toBe('');
  });

  it('removes exactly one trailing CRLF pair', () => {
    expect(stripTrailingNl('abc\r\n')).toBe('abc');
    expect(stripTrailingNl('abc\r\n\r\n')).toBe('abc\r\n');
    expect(stripTrailingNl('\r\n')).toBe('');
  });

  it('keeps interior and surrounding spaces', () => {
    expect(stripTrailingNl('a b\n')).toBe('a b');
    expect(stripTrailingNl(' a b \n')).toBe(' a b ');
    expect(stripTrailingNl(' \n')).toBe(' ');
  });

  it('does not touch a lone trailing CR or a leading newline', () => {
    expect(stripTrailingNl('abc\r')).toBe('abc\r');
    expect(stripTrailingNl('\nabc')).toBe('\nabc');
  });
});
