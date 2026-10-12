import MarkdownIt from 'markdown-it';

import { headingSlug } from '../shared/slug';
import { parseWikilink, type ParsedLink } from '../shared/wikilinks';

/**
 * Server-side note rendering (§10): markdown-it with html:false (raw HTML is shown
 * escaped, so no sanitizer is needed) plus the Obsidian rules — wikilinks/embeds,
 * %% comments and heading anchors. A fresh instance is built per call and plugins
 * never touch a shared instance. The plugin's own <a>/<span> tokens escape href and
 * label via the very same markdown-it helper used for ordinary text tokens.
 */

export type ResolveLink = (target: string) => { id: string } | null;

const NOTE_HREF = '/brain/n/';
/** Trailing-segment extension with at least one letter; ".md" itself is a note. */
const ATTACHMENT_EXT = /\.(?=[0-9a-z]*[a-z])[0-9a-z]{1,10}$/i;
const NOTE_EXT = /\.md$/i;

function isAttachment(target: string): boolean {
  const last = target.slice(target.lastIndexOf('/') + 1);
  return ATTACHMENT_EXT.test(last) && !NOTE_EXT.test(last);
}

function renderLink(
  link: ParsedLink,
  resolve: ResolveLink,
  esc: (s: string) => string,
): { kind: 'html' | 'text'; value: string } {
  if (link.target === '') {
    // Same-page anchor: resolve is never called.
    const heading = link.heading ?? '';
    return {
      kind: 'html',
      value: `<a href="${esc(`#${headingSlug(heading)}`)}">${esc(link.alias || heading)}</a>`,
    };
  }
  if (link.embed && isAttachment(link.target)) {
    // Attachments are not indexed: placeholder decided locally, no resolve call.
    return { kind: 'text', value: `[image: ${link.target}]` };
  }
  const label = link.alias || (link.embed ? link.target : link.heading || link.target);
  const hit = resolve(link.target);
  if (!hit) return { kind: 'html', value: `<span class="missing">${esc(label)}</span>` };
  const fragment = link.heading ? `#${headingSlug(link.heading)}` : '';
  const href = esc(`${NOTE_HREF}${encodeURIComponent(hit.id)}${fragment}`);
  return link.embed
    ? { kind: 'html', value: `<a class="embed-card" href="${href}">↪ ${esc(label)}</a>` }
    : { kind: 'html', value: `<a href="${href}">${esc(label)}</a>` };
}

export function renderMarkdown(body: string, resolve: ResolveLink): string {
  if (body === '') return '';
  const md = new MarkdownIt({ html: false, linkify: true });
  const esc = md.utils.escapeHtml;

  // [[…]] and ![[…]]. After "backticks" so code wins, before "link" so markdown
  // links never see the [[ brackets.
  md.inline.ruler.after('backticks', 'brain_wikilink', (state, silent) => {
    const { src, pos, posMax } = state;
    const open = src.charCodeAt(pos) === 0x21 /* ! */ ? pos + 1 : pos;
    if (src.charCodeAt(open) !== 0x5b /* [ */ || src.charCodeAt(open + 1) !== 0x5b) return false;
    const close = src.indexOf(']', open + 2);
    if (close < 0 || close + 1 >= posMax || src.charCodeAt(close + 1) !== 0x5d /* ] */) {
      return false;
    }
    const link = parseWikilink(src.slice(pos, close + 2));
    if (!link) return false;
    if (!silent) {
      const piece = renderLink(link, resolve, esc);
      const token = state.push(piece.kind === 'html' ? 'html_inline' : 'text', '', 0);
      token.content = piece.value;
    }
    state.pos = close + 2;
    return true;
  });

  // Inline %%…%% within one line. Code spans are consumed earlier by "backticks".
  md.inline.ruler.after('backticks', 'brain_comment_inline', (state, silent) => {
    const { src, pos, posMax } = state;
    if (src.charCodeAt(pos) !== 0x25 /* % */ || src.charCodeAt(pos + 1) !== 0x25) return false;
    const close = src.indexOf('%%', pos + 2);
    if (close < 0 || close + 2 > posMax) return false;
    const newline = src.indexOf('\n', pos + 2);
    if (newline >= 0 && newline < close) return false; // closing "%%" is on another line
    state.pos = close + 2;
    return true;
  });

  // Block %%: a line starting (optionally indented) with "%%" hides through the line
  // holding the matching "%%", otherwise to the end of the container. Fenced and
  // indented code are separate blocks, so "%%" inside them stays visible.
  md.block.ruler.before(
    'fence',
    'brain_comment_block',
    (state, startLine, endLine, silent) => {
      if (state.sCount[startLine] - state.blkIndent >= 4) return false; // indented code
      const src = state.src;
      const start = state.bMarks[startLine] + state.tShift[startLine];
      if (src.charCodeAt(start) !== 0x25 || src.charCodeAt(start + 1) !== 0x25) return false;
      let line = startLine;
      let closerLine = -1;
      for (; line < endLine; line++) {
        const lo = line === startLine ? start + 2 : state.bMarks[line] + state.tShift[line];
        const hi = state.eMarks[line];
        const at = src.slice(lo, hi).indexOf('%%');
        if (at < 0) continue;
        if (line === startLine && src.slice(lo + at + 2, hi).trim() !== '') {
          return false; // "%%a%% visible" on the opening line: an inline comment
        }
        closerLine = line;
        break;
      }
      if (silent) return true;
      state.line = closerLine >= 0 ? closerLine + 1 : endLine;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );

  // Heading id = headingSlug(heading text), same as the indexer; collisions not deduped.
  md.core.ruler.push('brain_heading_anchor', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i + 1 < tokens.length; i++) {
      if (tokens[i].type === 'heading_open' && tokens[i + 1].type === 'inline') {
        tokens[i].attrSet('id', headingSlug(tokens[i + 1].content));
      }
    }
  });

  return md.render(body);
}
