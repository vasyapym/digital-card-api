import { extractWikilinks, parseWikilink } from './wikilinks';

// Offline, mock-free: the one grammar shared by the indexer and the reader.
describe('parseWikilink', () => {
  it('parses a bare target, Latin and Cyrillic', () => {
    expect(parseWikilink('[[Tomatoes]]')).toEqual({ embed: false, target: 'Tomatoes' });
    expect(parseWikilink('[[Сад/Томаты]]')).toEqual({ embed: false, target: 'Сад/Томаты' });
  });

  it('starts the alias at the first separator, written | or \\|', () => {
    expect(parseWikilink('[[Tomatoes|Помидоры]]')).toEqual({
      embed: false,
      target: 'Tomatoes',
      alias: 'Помидоры',
    });
    expect(parseWikilink('[[Tomatoes\\|tom]]')).toEqual({
      embed: false,
      target: 'Tomatoes',
      alias: 'tom',
    });
    expect(parseWikilink('[[a|b|c]]')).toEqual({ embed: false, target: 'a', alias: 'b|c' });
    expect(parseWikilink('[[a\\|b\\|c]]')).toEqual({ embed: false, target: 'a', alias: 'b|c' });
    expect(parseWikilink('[[a|]]')).toEqual({ embed: false, target: 'a' });
  });

  it('splits target and heading at the first #', () => {
    expect(parseWikilink('[[Tomatoes#Setup Steps]]')).toEqual({
      embed: false,
      target: 'Tomatoes',
      heading: 'Setup Steps',
    });
    expect(parseWikilink('[[Tomatoes#Setup|how]]')).toEqual({
      embed: false,
      target: 'Tomatoes',
      heading: 'Setup',
      alias: 'how',
    });
    expect(parseWikilink('[[t#a#b]]')).toEqual({ embed: false, target: 't', heading: 'a#b' });
    expect(parseWikilink('[[#Полив]]')).toEqual({ embed: false, target: '', heading: 'Полив' });
  });

  it('turns block refs into plain note links', () => {
    expect(parseWikilink('[[Tomatoes#^abc123]]')).toEqual({
      embed: false,
      target: 'Tomatoes',
      block: true,
    });
    expect(parseWikilink('[[Tomatoes#^]]')).toEqual({ embed: false, target: 'Tomatoes' });
  });

  it('parses embeds', () => {
    expect(parseWikilink('![[pic.png]]')).toEqual({ embed: true, target: 'pic.png' });
    expect(parseWikilink('![[Other note|Card]]')).toEqual({
      embed: true,
      target: 'Other note',
      alias: 'Card',
    });
  });

  it('returns null for anything malformed', () => {
    const bad = [
      '', 'Tomatoes', '[Tomatoes]', '[[]]', '[[ ]]', '[[#]]', '[[|alias]]', '[[#^blk]]',
      '[[a\nb]]', '[[a]b]]', '[[a[b]]', '[[a]] ', ' [[a]]', '!![[a]]',
    ];
    for (const raw of bad) expect(parseWikilink(raw)).toBeNull();
  });
});

describe('extractWikilinks', () => {
  it('returns every well-formed lexeme in scan order, embeds included, no dedup', () => {
    const text = 'See [[A]], ![[b.png]] and [[A]]; [[]] [[x\ny]] `[[C\\|c]]` [[[d]]]';
    expect(extractWikilinks(text)).toEqual([
      { embed: false, target: 'A' },
      { embed: true, target: 'b.png' },
      { embed: false, target: 'A' },
      { embed: false, target: 'C', alias: 'c' }, // context-free: code is the parser's job
      { embed: false, target: 'd' },
    ]);
  });

  it('is stateless across calls', () => {
    expect(extractWikilinks('[[A]] [[B]]')).toHaveLength(2);
    expect(extractWikilinks('[[A]] [[B]]')).toHaveLength(2);
    expect(extractWikilinks('')).toEqual([]);
  });
});
