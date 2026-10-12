import { headingSlug, slug } from '../shared/slug';
import { renderMarkdown } from './markdown';

// Offline, mock-free: inline strings only.
const IDS: Record<string, string> = { Tomatoes: '11', 'Сад/Томаты': '22', 'Other note': '33' };

function resolver() {
  const calls: string[] = [];
  const fn = (target: string) => {
    calls.push(target);
    const id = IDS[target];
    return id !== undefined ? { id } : null;
  };
  return { calls, fn };
}

describe('renderMarkdown', () => {
  it('renders "" without calling resolve', () => {
    const r = resolver();
    expect(renderMarkdown('', r.fn)).toBe('');
    expect(r.calls).toEqual([]);
  });

  it('escapes raw HTML in text, labels and aliases', () => {
    const src = '<script>alert(1)</script>\n\nhi <b>x</b> & [[Tomatoes|"<b>"]] [[<img src=x>]]';
    const out = renderMarkdown(src, resolver().fn);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<b>');
    expect(out).not.toContain('<img');
    const E = String.fromCharCode(0x26); // literal ampersand at runtime
    expect(out).toContain(`${E}lt;script${E}gt;alert(1)${E}lt;/script${E}gt;`);
    expect(out).toContain(`<a href="/brain/n/11">${E}quot;${E}lt;b${E}gt;${E}quot;</a>`);
    expect(out).toContain(`<span class="missing">${E}lt;img src=x${E}gt;</span>`);
  });

  it('hides %% comments, inline and block, but code wins', () => {
    const src = [
      'Visible %%secret one%% text', '', '%%', 'hidden block', '%%', '', 'After',
      'Para', '%%', 'hid', '%%', '', '```', '%% kept %%', '```', '', '`%%inline kept%%`',
    ].join('\n');
    const out = renderMarkdown(src, resolver().fn);
    expect(out).toContain('Visible  text');
    expect(out).not.toContain('secret');
    expect(out).not.toContain('hidden block');
    expect(out).not.toContain('hid\n');
    expect(out).toContain('After');
    expect(out).toContain('<code>%% kept %%\n</code>');
    expect(out).toContain('<code>%%inline kept%%</code>');
  });

  it('hides an unclosed block comment to EOF', () => {
    const out = renderMarkdown('Top\n\n%% never closed\nstill hidden', resolver().fn);
    expect(out).toContain('Top');
    expect(out).not.toContain('never closed');
    expect(out).not.toContain('still hidden');
  });

  it('sets heading ids from slug() without deduplicating collisions', () => {
    expect(slug('Hello, World!')).toBe('hello-world');
    expect(slug('snake_case 42')).toBe('snake_case-42');
    expect(slug('Cafe\u0301')).toBe(slug('Caf\u00e9'));
    expect(slug('Ёж — ёлка')).toBe('ёж-ёлка');
    expect(slug('')).toBe('section');
    expect(headingSlug('  Title ##  ')).toBe('title');
    const out = renderMarkdown('# Полив и уход\n\n## Setup ##\n\n## Setup\n\n### !!!', resolver().fn);
    expect(out).toContain(`<h1 id="${headingSlug('Полив и уход')}">`);
    expect(out).toContain('<h1 id="полив-и-уход">');
    expect(out.match(/<h2 id="setup">/g)).toHaveLength(2);
    expect(out).toContain('<h3 id="section">');
  });

  it('links resolved notes and marks missing ones', () => {
    const r = resolver();
    const out = renderMarkdown('[[Tomatoes]] [[Tomatoes|Помидоры]] [[Nowhere]] [[Сад/Томаты]]', r.fn);
    expect(out).toContain('<a href="/brain/n/11">Tomatoes</a>');
    expect(out).toContain('<a href="/brain/n/11">Помидоры</a>');
    expect(out).toContain('<span class="missing">Nowhere</span>');
    expect(out).toContain('<a href="/brain/n/22">Сад/Томаты</a>');
    expect(r.calls).toEqual(['Tomatoes', 'Tomatoes', 'Nowhere', 'Сад/Томаты']);
  });

  it('renders heading, same-page and block links; same-page never resolves', () => {
    const r = resolver();
    const out = renderMarkdown('[[#Полив и уход]] [[Tomatoes#Setup Steps]] [[Tomatoes#^blk]]', r.fn);
    expect(out).toContain('<a href="#полив-и-уход">Полив и уход</a>');
    expect(out).toContain('<a href="/brain/n/11#setup-steps">Setup Steps</a>');
    expect(out).toContain('<a href="/brain/n/11">Tomatoes</a>');
    expect(r.calls).toEqual(['Tomatoes', 'Tomatoes']);
  });

  it('accepts the escaped pipe inside tables', () => {
    const out = renderMarkdown('| a | b |\n|---|---|\n| [[Tomatoes\\|tom]] | x |', resolver().fn);
    expect(out).toContain('<a href="/brain/n/11">tom</a>');
  });

  it('renders image placeholders locally and note embeds as cards', () => {
    const r = resolver();
    const src = '![[pic.png]] ![[docs/report.PDF|300]] ![[Other note]] ![[Other note|Card]] ![[Ghost]]';
    const out = renderMarkdown(src, r.fn);
    expect(out).toContain('[image: pic.png]');
    expect(out).toContain('[image: docs/report.PDF]');
    expect(out).toContain('<a class="embed-card" href="/brain/n/33">↪ Other note</a>');
    expect(out).toContain('<a class="embed-card" href="/brain/n/33">↪ Card</a>');
    expect(out).toContain('<span class="missing">Ghost</span>');
    expect(r.calls).toEqual(['Other note', 'Other note', 'Ghost']);
  });

  it('degrades callouts, task lists and unknown syntax to plain markup', () => {
    const src = '> [!note] Title\n> body\n\n- [ ] task\n- [x] done\n\n==hl== ^blockid';
    const out = renderMarkdown(src, resolver().fn);
    expect(out).toContain('<blockquote>');
    expect(out).toContain('[!note] Title');
    expect(out).toContain('<li>[ ] task</li>');
    expect(out).not.toContain('<input');
    expect(out).toContain('==hl== ^blockid');
  });

  it('linkifies bare URLs and keeps instances per call', () => {
    expect(renderMarkdown('see https://example.com', resolver().fn)).toContain(
      'href="https://example.com"',
    );
    const other = (t: string) => (t === 'Tomatoes' ? { id: '99' } : null);
    expect(renderMarkdown('[[Tomatoes]]', other)).toContain('/brain/n/99');
    expect(renderMarkdown('[[Tomatoes]]', resolver().fn)).toContain('/brain/n/11');
  });
});
