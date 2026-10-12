import { keysForNote, normalizeKey, resolveWinner } from './link-keys';

// Offline, mock-free: one deterministic resolver for forward links and backlinks.
describe('normalizeKey', () => {
  it('trims, unifies slashes, strips one .md and lowercases', () => {
    expect(normalizeKey(' Garden\\Tomatoes.md ')).toBe('garden/tomatoes');
    expect(normalizeKey('Note.MD')).toBe('note');
    expect(normalizeKey('a.md.md')).toBe('a.md');
    expect(normalizeKey('Note.mdx')).toBe('note.mdx');
  });

  it('handles Cyrillic case', () => {
    expect(normalizeKey('Сад/Томаты.md')).toBe('сад/томаты');
    expect(normalizeKey('ЁЛКА')).toBe('ёлка');
  });

  it('applies NFC so composed and decomposed spellings meet', () => {
    expect(normalizeKey('Cafe\u0301')).toBe('caf\u00e9');
    expect(normalizeKey('Мои\u0306')).toBe(normalizeKey('Мой'));
    expect(normalizeKey('Мои\u0306')).toBe('мой');
  });
});

describe('keysForNote', () => {
  it('emits every path suffix, then aliases, deduplicated in first-seen order', () => {
    expect(keysForNote('A/B/Note.md', ['Alias One', ' note ', 'Сад'])).toEqual([
      'note',
      'b/note',
      'a/b/note',
      'alias one',
      'сад',
    ]);
  });

  it('keeps the last-segment key for root, Cyrillic and backslash paths', () => {
    expect(keysForNote('Note.md', [])).toEqual(['note']);
    expect(keysForNote('Сад/Томаты.md', [])).toEqual(['томаты', 'сад/томаты']);
    expect(keysForNote('Garden\\Tomatoes.md', [])).toEqual(['tomatoes', 'garden/tomatoes']);
  });

  it('normalizes aliases and drops empty ones', () => {
    expect(keysForNote('X.md', ['Cafe\u0301', '  ', 'X'])).toEqual(['x', 'caf\u00e9']);
  });
});

describe('resolveWinner', () => {
  it('returns null for no candidates', () => {
    expect(resolveWinner([], 'note')).toBeNull();
  });

  it('prefers an exact full-path match', () => {
    const notes = [{ path: 'Z/Note.md' }, { path: 'A/B/Note.md' }, { path: 'Note.md' }];
    expect(resolveWinner(notes, 'a/b/note')).toEqual({ path: 'A/B/Note.md' });
    expect(resolveWinner(notes, 'note')).toEqual({ path: 'Note.md' });
  });

  it('falls back to the shortest path', () => {
    const notes = [{ path: 'Deep/Er/Note.md' }, { path: 'Ab/Note.md' }];
    expect(resolveWinner(notes, 'alias')).toEqual({ path: 'Ab/Note.md' });
  });

  it('breaks ties by code-unit order, never locale, independent of input order', () => {
    const notes = [{ path: 'a/Note.md' }, { path: 'B/Note.md' }];
    expect(resolveWinner(notes, 'note')).toEqual({ path: 'B/Note.md' }); // 'B' < 'a'
    expect(resolveWinner([...notes].reverse(), 'note')).toEqual({ path: 'B/Note.md' });
  });

  it('returns the original candidate object, extra fields intact', () => {
    const winner = resolveWinner([{ id: 'n1', path: 'Сад/Томаты.md' }], 'томаты');
    expect(winner?.id).toBe('n1');
  });
});
