// src/second-brain/views/login.view.spec.ts
import { LoginView } from './login.view';

describe('LoginView', () => {
  const view = new LoginView();

  it('renders the passphrase form posting to /brain/login', () => {
    const html = view.render('/brain');
    expect(html).toContain('<form method="post" action="/brain/login">');
    expect(html).toContain('type="password"');
    expect(html).toContain('name="passphrase"');
    expect(html).toContain('autocomplete="current-password"');
    expect(html).toContain('<button type="submit">Sign in</button>');
    expect(html).not.toContain('autofocus');
  });

  it('puts the next path into the hidden input', () => {
    // A plain path has nothing to escape, so it round-trips untouched.
    const html = view.render('/brain/sub?x=1');
    expect(html).toContain('name="next" value="/brain/sub?x=1"');
  });

  it('escapes a hostile next value', () => {
    const html = view.render('/brain"><script>');
    expect(html).toContain('value="/brain&quot;&gt;&lt;script&gt;"');
    expect(html).not.toContain('<script');
  });

  it('renders an error message above the form', () => {
    const html = view.render('/brain', { kind: 'error', text: 'wrong passphrase' });
    expect(html).toContain('class="err"');
    expect(html).toContain('<p class="err">wrong passphrase</p>');
    expect(html.indexOf('class="err"')).toBeLessThan(html.indexOf('<form'));
  });

  it('renders a lockout message with the warn class', () => {
    const html = view.render('/brain', { kind: 'lockout', text: 'too many attempts' });
    expect(html).toContain('class="warn"');
    expect(html).toContain('<p class="warn">too many attempts</p>');
  });

  it('escapes hostile message text', () => {
    const html = view.render('/brain', { kind: 'error', text: '<i>evil</i>' });
    expect(html).toContain('&lt;i&gt;evil&lt;/i&gt;');
    expect(html).not.toContain('<i>');
  });

  it('renders no message block when none is given', () => {
    const html = view.render('/brain');
    expect(html).not.toContain('class="err"');
    expect(html).not.toContain('class="warn"');
  });

  it('is a fragment without scripts or a doctype', () => {
    const html = view.render('/brain', { kind: 'error', text: 'x' });
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<!DOCTYPE');
  });
});
