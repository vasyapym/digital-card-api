// src/second-brain/views/login.view.ts
import { Injectable } from '@nestjs/common';
import { escapeHtml } from '../../common/html.util';

@Injectable()
export class LoginView {
  // Fragment only: the shell view adds the page chrome.
  public render(
    next: string,
    message?: { kind: 'error'; text: string } | { kind: 'lockout'; text: string },
  ): string {
    const parts: string[] = [];

    // Feedback line sits above the form; .err and .warn are shell classes.
    if (message) {
      const cls = message.kind === 'error' ? 'err' : 'warn';
      parts.push(`<p class="${cls}">${escapeHtml(message.text)}</p>`);
    }

    parts.push(
      '<form method="post" action="/brain/login">',
      `<input type="hidden" name="next" value="${escapeHtml(next)}">`,
      '<label for="passphrase">Passphrase</label>',
      '<input type="password" id="passphrase" name="passphrase" autocomplete="current-password">',
      '<button type="submit">Sign in</button>',
      '</form>',
    );

    return parts.join('\n');
  }
}
