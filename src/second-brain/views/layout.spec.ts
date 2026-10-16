// src/second-brain/views/layout.spec.ts
import { BrainLayoutView } from './layout';

describe('BrainLayoutView', () => {
  const view = new BrainLayoutView();

  it('starts with the doctype followed by an English html element', () => {
    const html = view.render('Brain', '');

    expect(html).toMatch(/^<!DOCTYPE html>\s*<html lang="en">/);
    expect(html).toMatch(/<\/body>\s*<\/html>$/);
  });

  it('contains exactly one style block with theme and system font rules', () => {
    const html = view.render('Brain', '');
    const styles = html.match(/<style>[\s\S]*?<\/style>/g) ?? [];

    expect(styles).toHaveLength(1);
    expect(styles[0]).toContain('prefers-color-scheme');
    expect(styles[0]).toContain('-apple-system');
  });

  it('contains the charset, robots and viewport metadata', () => {
    const html = view.render('Brain', '');

    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
  });

  it('escapes the title instead of emitting raw markup', () => {
    const html = view.render('<x>', '');

    expect(html).toContain('<title>&lt;x&gt;</title>');
    expect(html).not.toContain('<x>');
  });

  it('writes the body HTML through unchanged', () => {
    const bodyHtml = '<p>kept</p>';
    const html = view.render('Brain', bodyHtml);

    expect(html).toContain(`<body>${bodyHtml}</body>`);
    expect(html).not.toContain('&lt;p&gt;kept&lt;/p&gt;');
  });

  it('emits no scripts in shell, title or script-free body cases', () => {
    expect(view.render('', '')).not.toContain('<script');
    expect(view.render('</title><script></script>', '')).not.toContain(
      '<script',
    );
    expect(view.render('Brain', '<p>kept</p>')).not.toContain('<script');
  });

  it('keeps color-scheme support and the light preference override', () => {
    const html = view.render('Brain', '');

    expect(html).toContain('color-scheme');
    expect(html).toContain('prefers-color-scheme:light');
  });
});
