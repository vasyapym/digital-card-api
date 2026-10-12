/**
 * The one wikilink grammar, shared by the indexer (link extraction) and the reader
 * (markdown rendering). Context-free: skipping code fences is the caller's job.
 *
 * Lexeme: optional "!", then "[[" payload "]]", where the payload is a single-line run
 * of chars other than "[", "]" and line breaks (\n, \r).
 */

export interface ParsedLink {
  embed: boolean;
  /** "" means same-page ([[#Heading]]). */
  target: string;
  alias?: string;
  heading?: string;
  /** [[t#^id]]: the block id is dropped; v1 links to the note itself. */
  block?: boolean;
}

const LEXEME = '(!?)\\[\\[([^\\[\\]\\n\\r]*?)\\]\\]';
const WHOLE_LEXEME = new RegExp(`^${LEXEME}$`);
const SCAN = new RegExp(LEXEME, 'g');

/** Parses one complete lexeme ("[[…]]" or "![[…]]"); null for anything malformed. */
export function parseWikilink(raw: string): ParsedLink | null {
  const m = WHOLE_LEXEME.exec(raw);
  if (!m) return null;
  const embed = m[1] === '!';
  const payload = m[2];

  // The first separator, written "|" or "\|" (tables), starts the alias; everything
  // after it is alias text with "\|" unescaped. "[[a|]]" keeps the target-only label.
  let location = payload;
  let alias: string | undefined;
  const bar = payload.indexOf('|');
  if (bar >= 0) {
    const cut = bar > 0 && payload[bar - 1] === '\\' ? bar - 1 : bar;
    location = payload.slice(0, cut);
    const text = payload.slice(bar + 1).replace(/\\\|/g, '|');
    if (text !== '') alias = text;
  }

  // The first "#" splits target and heading; the heading stays one opaque string.
  // Target and heading are trimmed, so "[[a | b]]" equals "[[a|b]]".
  let target = location.trim();
  let heading: string | undefined;
  let block = false;
  const hash = location.indexOf('#');
  if (hash >= 0) {
    target = location.slice(0, hash).trim();
    const rest = location.slice(hash + 1).trim();
    if (rest.startsWith('^')) block = rest.length > 1; // "[[t#^]]" → plain note link
    else if (rest !== '') heading = rest;
  }

  if (target === '' && heading === undefined) return null; // [[]], [[#]], [[|x]], [[#^b]]

  const link: ParsedLink = { embed, target };
  if (alias !== undefined) link.alias = alias;
  if (heading !== undefined) link.heading = heading;
  if (block) link.block = true;
  return link;
}

/** One ParsedLink per well-formed lexeme, in scan order; embeds included, no dedup. */
export function extractWikilinks(text: string): ParsedLink[] {
  const out: ParsedLink[] = [];
  for (const m of text.matchAll(new RegExp(LEXEME, 'g'))) {
    const link = parseWikilink(m[0]);
    if (link) out.push(link);
  }
  return out;
}
