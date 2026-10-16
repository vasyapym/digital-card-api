// src/second-brain/views/home.view.spec.ts
import { HomeView, relativeTime } from './home.view';
import type { BrainFreshness } from '../web/meta.service';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('relativeTime', () => {
  it('buckets elapsed time into coarse labels', () => {
    expect(relativeTime(59_000, 0)).toBe('just now');
    expect(relativeTime(60_000, 0)).toBe('1 min ago');
    expect(relativeTime(59 * MINUTE, 0)).toBe('59 min ago');
    expect(relativeTime(HOUR, 0)).toBe('1 h ago');
    expect(relativeTime(3 * HOUR, 0)).toBe('3 h ago');
    expect(relativeTime(23 * HOUR + 59 * MINUTE, 0)).toBe('23 h ago');
    expect(relativeTime(DAY, 0)).toBe('1 d ago');
    expect(relativeTime(2 * DAY, 0)).toBe('2 d ago');
  });

  it('floors partial units', () => {
    expect(relativeTime(2 * MINUTE + 59_000, 0)).toBe('2 min ago');
    expect(relativeTime(3 * HOUR + 59 * MINUTE, 0)).toBe('3 h ago');
    expect(relativeTime(2 * DAY + 23 * HOUR, 0)).toBe('2 d ago');
  });

  it('treats a future timestamp as just now', () => {
    expect(relativeTime(0, 60_000)).toBe('just now');
    expect(relativeTime(0, 5 * DAY)).toBe('just now');
  });
});

describe('HomeView', () => {
  const view = new HomeView();
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders not indexed yet when freshness data is missing', () => {
    const cases: BrainFreshness[] = [
      { lastIndexedAt: null, noteCount: null },
      { lastIndexedAt: null, noteCount: 12 },
      { lastIndexedAt: new Date(NOW), noteCount: null },
    ];
    for (const f of cases) {
      const html = view.render(f);
      expect(html).toContain('<p class="meta">not indexed yet</p>');
      expect(html).not.toContain('&middot;');
      expect(html).not.toContain('notes');
    }
  });

  it('renders the age and note count for an indexed brain', () => {
    const at = NOW - 3 * HOUR;
    const html = view.render({ lastIndexedAt: new Date(at), noteCount: 410 });
    expect(html).toContain(relativeTime(Date.now(), at));
    expect(html).toContain('<p class="meta">3 h ago &middot; 410 notes</p>');
    expect(html).toContain('&middot;');
    expect(html).toContain('410 notes');
  });

  it('clamps an upcoming index time to just now', () => {
    const at = NOW + 5 * MINUTE;
    const html = view.render({ lastIndexedAt: new Date(at), noteCount: 7 });
    expect(html).toContain(relativeTime(Date.now(), at));
    expect(html).toContain('<p class="meta">just now &middot; 7 notes</p>');
  });

  it('contains the logout form', () => {
    const html = view.render({ lastIndexedAt: null, noteCount: null });
    expect(html).toContain('<form method="post" action="/brain/logout">');
    expect(html).toContain('action="/brain/logout"');
    expect(html).toContain('method="post"');
    expect(html).toContain('<button type="submit">Log out</button>');
  });

  it('renders the search box between the freshness line and the logout form', () => {
    const html = view.render({ lastIndexedAt: new Date(NOW), noteCount: 1 });
    const form =
      '<form method="get" action="/brain/search"><input type="search" name="q" autocomplete="off" autofocus></form>';
    expect(html).toContain(form);
    const searchAt = html.indexOf(form);
    const metaAt = html.indexOf('<p class="meta">');
    const logoutAt = html.indexOf('action="/brain/logout"');
    expect(metaAt).toBeGreaterThanOrEqual(0);
    expect(searchAt).toBeGreaterThan(metaAt);
    expect(logoutAt).toBeGreaterThan(searchAt);
    expect(html).not.toContain('value="');
  });

  it('is a fragment without scripts or a doctype', () => {
    const html = view.render({ lastIndexedAt: new Date(NOW - DAY), noteCount: 3 });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<!DOCTYPE');
  });
});
