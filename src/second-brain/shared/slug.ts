/**
 * Heading → anchor slug. The indexer stores it in brain_chunks.anchor and the reader
 * renders it as the heading id, so both sides must produce byte-identical output.
 * Pure and deterministic: no locale, no state, no imports.
 */

const NOT_WORD = /[^\p{L}\p{N}_]/gu;
const DASH_RUN = /-+/g;
const EDGE_DASHES = /^-+|-+$/g;
const ATX_TAIL = /[ \t]*#+[ \t]*$/;

/** NFC → lowercase → non [\p{L}\p{N}_] to "-" → collapse runs → trim "-" → "section" if empty. */
export function slug(text: string): string {
  const s = text
    .normalize('NFC')
    .toLowerCase()
    .replace(NOT_WORD, '-')
    .replace(DASH_RUN, '-')
    .replace(EDGE_DASHES, '');
  return s === '' ? 'section' : s;
}

/** Slug of a raw heading text: strips an ATX closing sequence ("Title ##"), trims, slugs. */
export function headingSlug(rawHeading: string): string {
  return slug(rawHeading.replace(ATX_TAIL, '').trim());
}
