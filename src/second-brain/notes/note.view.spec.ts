// src/second-brain/notes/note.view.spec.ts
import { isoDay, NoteView } from './note.view';
import type { NotePage } from './notes.repository';

function page(overrides: Partial<NotePage> = {}): NotePage {
  return {
    id: '0123456789abcdef',
    title: 'Alpha <x>',
    path: 'Notes/Alpha.md',
    folderPath: 'Notes',
    name: 'Alpha',
    bodyHtml: '<h1 id="h">H</h1>\n<p>body &amp; more</p>',
    tags: ['garden', 'a&b'],
    updatedAt: new Date('2026-03-04T05:06:07Z'),
    backlinks: [
      { id: 'fedcba9876543210', title: 'Beta <y>' },
      { id: '00000000000000aa', title: 'Gamma' },
    ],
    ...overrides,
  };
}

describe('NoteView', () => {
  const view = new NoteView();

  it('renders the full page fragment', () => {
    const html = view.render(page());
    expect(html).toContain('<p class="meta"><a href="/brain">Back to search</a></p>');
    expect(html).toContain('<h2>Alpha &lt;x&gt;</h2>');
    expect(html).toContain('<p class="meta">Notes &middot; updated 2026-03-04</p>');
    expect(html).toContain('<h1 id="h">H</h1>\n<p>body &amp; more</p>');
    expect(html).toContain(
      '<p class="meta">tags: <span class="dim">#garden</span> <span class="dim">#a&amp;b</span></p>',
    );
    expect(html).toContain('<p class="meta">linked from:</p>');
    expect(html).toContain('<li><a href="/brain/n/fedcba9876543210">Beta &lt;y&gt;</a></li>');
    expect(html).toContain('<li><a href="/brain/n/00000000000000aa">Gamma</a></li>');
    expect(html).not.toContain('no backlinks');
  });

  it('keeps the section order: back, title, meta, body, tags, backlinks', () => {
    const html = view.render(page());
    const markers = ['Back to search', '<h2>', '&middot;', '<h1 id="h">', 'tags:', 'linked from:'];
    const positions = markers.map((marker) => html.indexOf(marker));
    expect(positions.every((at) => at >= 0)).toBe(true);
    expect(positions.slice().sort((a, b) => a - b)).toEqual(positions);
  });

  it('omits tags, says no backlinks, and shows unknown date for empties', () => {
    const html = view.render(page({ tags: [], backlinks: [], updatedAt: null }));
    expect(html).not.toContain('tags:');
    expect(html).not.toContain('<span class="dim">');
    expect(html).toContain('<p class="meta">no backlinks</p>');
    expect(html).not.toContain('linked from:');
    expect(html).not.toContain('<ul>');
    expect(html).toContain('<p class="meta">Notes &middot; unknown date</p>');
  });

  it('drops the separator for root-level notes', () => {
    expect(view.render(page({ folderPath: '' }))).toContain(
      '<p class="meta">updated 2026-03-04</p>',
    );
    expect(view.render(page({ folderPath: '', updatedAt: null }))).toContain(
      '<p class="meta">unknown date</p>',
    );
  });

  it('escapes the folder path', () => {
    expect(view.render(page({ folderPath: 'A&B <c>' }))).toContain(
      '<p class="meta">A&amp;B &lt;c&gt; &middot; updated 2026-03-04</p>',
    );
  });

  it('never emits script or doctype tags', () => {
    const html = view.render(
      page({ title: '<script>alert(1)</script>', tags: ['<!DOCTYPE html>'], folderPath: '<script>' }),
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<!DOCTYPE');
    expect(html).toContain('<h2>&lt;script&gt;alert(1)&lt;/script&gt;</h2>');
  });

  it('isoDay keeps the UTC calendar day', () => {
    expect(isoDay(new Date('2026-03-04T23:59:59Z'))).toBe('2026-03-04');
  });
});
