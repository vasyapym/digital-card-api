// src/second-brain/views/search.view.spec.ts
import { SearchView, highlightSnippet, folderOf } from './search.view';
import type { SearchHit, SearchResults } from '../search/search.service';

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    id: 'a1',
    title: 'T<i>tle',
    path: 'Notes/Alpha.md',
    heading: 'Setup',
    anchor: 'setup',
    snippet: 'x\uE000alpha\uE001y',
    ...overrides,
  };
}

function results(hits: SearchHit[], notices: string[] = []): SearchResults {
  return { hits, notices };
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('SearchView', () => {
  const view = new SearchView();

  it('renders the prefilled form first and a full hit', () => {
    const html = view.render('two words', results([hit()]));
    expect(html.startsWith('<form method="get" action="/brain/search">')).toBe(true);
    expect(html).toContain('<input type="search" name="q" value="two words" autocomplete="off">');
    expect(html).not.toContain('autofocus');
    expect(html).toContain('<ol><li><p class="hit-title">');
    expect(html).toContain('<a href="/brain/n/a1#setup">T&lt;i&gt;tle</a>');
    expect(html).toContain('<p class="meta">Notes &middot; Setup</p>');
    expect(html).toContain('<p class="snippet">x<mark>alpha</mark>y</p>');
    expect(html).not.toContain('no matches');
  });

  it('omits the fragment entirely when anchor is empty', () => {
    const html = view.render('q', results([hit({ anchor: '' })]));
    expect(html).toContain('href="/brain/n/a1"');
    expect(html).not.toContain('/brain/n/a1#');
  });

  it('omits the meta line when there is no folder and no heading', () => {
    const html = view.render('q', results([hit({ path: 'Root.md', heading: '' })], ['note']));
    const li = html.slice(html.indexOf('<li>'), html.indexOf('</li>') + '</li>'.length);
    expect(li).toBe(
      '<li><p class="hit-title"><a href="/brain/n/a1#setup">T&lt;i&gt;tle</a></p>' +
        '<p class="snippet">x<mark>alpha</mark>y</p></li>',
    );
    expect(count(li, '<p class="meta">')).toBe(0);
    expect(count(html, '<p class="meta">')).toBe(1);
  });

  it('renders exactly one no-matches line for empty results without notices', () => {
    const html = view.render('nothing', results([]));
    expect(count(html, '<p class="meta">no matches</p>')).toBe(1);
    expect(count(html, '<p class="meta">')).toBe(1);
    expect(html).not.toContain('<ol>');
    expect(html).toContain('value="nothing"');
  });

  it('renders notices in array order with escaped text before the results', () => {
    const html = view.render('q', results([], ['keyword-only', 'paused <now>']));
    const first = html.indexOf('<p class="meta">keyword-only</p>');
    const second = html.indexOf('<p class="meta">paused &lt;now&gt;</p>');
    const none = html.indexOf('<p class="meta">no matches</p>');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(none).toBeGreaterThan(second);
    expect(html).not.toContain('<now>');
  });

  it('escapes a hostile q in the form value', () => {
    const html = view.render('q"><script>', results([]));
    expect(html).toContain('value="q&quot;&gt;&lt;script&gt;"');
    expect(html).not.toContain('<script');
  });

  it('escapes a hostile title in the link text', () => {
    const html = view.render('q', results([hit({ title: '<script>alert(1)</script>' })]));
    expect(html).toContain('>&lt;script&gt;alert(1)&lt;/script&gt;</a>');
    expect(html).not.toContain('<script');
  });

  it('escapes hostile id, anchor, heading and snippet', () => {
    const html = view.render(
      'q',
      results([
        hit({
          id: '"><script>',
          anchor: '"><script>',
          heading: '<script>h</script>',
          snippet: '<script>\uE000s\uE001</script>',
        }),
      ]),
    );
    expect(html).toContain('href="/brain/n/&quot;&gt;&lt;script&gt;#&quot;&gt;&lt;script&gt;"');
    expect(html).toContain('<p class="meta">Notes &middot; &lt;script&gt;h&lt;/script&gt;</p>');
    expect(html).toContain('<p class="snippet">&lt;script&gt;<mark>s</mark>&lt;/script&gt;</p>');
    expect(html).not.toContain('<script');
  });

  it('highlightSnippet escapes first and then swaps the markers', () => {
    expect(highlightSnippet('abc')).toBe('abc');
    expect(highlightSnippet('')).toBe('');
    expect(highlightSnippet('\uE000abc')).toBe('<mark>abc');
    expect(highlightSnippet('a<b \uE000c\uE001 & d')).toBe('a&lt;b <mark>c</mark> &amp; d');
    expect(highlightSnippet('<mark>x</mark>')).toBe('&lt;mark&gt;x&lt;/mark&gt;');
  });

  it('folderOf returns the parent folder or an empty string', () => {
    expect(folderOf('Notes/Alpha.md')).toBe('Notes');
    expect(folderOf('A/B/C.md')).toBe('A/B');
    expect(folderOf('Root.md')).toBe('');
  });

  it('shows only the heading when the path has no folder', () => {
    const html = view.render('q', results([hit({ path: 'Root.md', heading: 'H' })]));
    expect(html).toContain('<p class="meta">H</p>');
    expect(html).not.toContain('&middot;');
    expect(html).toContain('<form method="get" action="/brain/search">');
  });

  it('shows only the folder when the heading is empty', () => {
    const html = view.render('q', results([hit({ heading: '' })]));
    expect(html).toContain('<p class="meta">Notes</p>');
    expect(html).not.toContain('&middot;');
  });

  it('renders a bare fragment without doctype, shell, style or script', () => {
    const html = view.render('q', results([hit()], ['keyword-only']));
    expect(html).not.toContain('<!DOCTYPE');
    expect(html).not.toContain('<html');
    expect(html).not.toContain('<body');
    expect(html).not.toContain('style=');
    expect(html).not.toContain('<script');
  });
});
