import { Injectable } from '@nestjs/common';
import { escapeHtml, formatDate } from '../common/html.util';
import { Profile } from './models/profile.models';

@Injectable()
export class ProfileCardView {
  render(p: Profile): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(p.name)} — ${escapeHtml(p.title)}</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 42rem;
      margin: 0 auto;
      padding: 2rem 1.25rem;
      line-height: 1.6;
    }
    header h1 { margin: 0 0 .25rem; font-size: 1.75rem; }
    header .title { color: #666; margin: 0; }
    section { margin-top: 1.75rem; }
    h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .05em; color: #888; margin-bottom: .5rem; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { margin-bottom: .5rem; }
    .meta { color: #666; font-size: .9rem; }
    .skills span {
      display: inline-block;
      background: rgba(128,128,128,.15);
      border-radius: 999px;
      padding: .1rem .7rem;
      margin: 0 .35rem .35rem 0;
      font-size: .85rem;
    }
    a { color: inherit; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(p.name)}</h1>
    <p class="title">${escapeHtml(p.title)}</p>
    ${this.renderContact(p)}
  </header>

  <section>
    <p>${escapeHtml(p.description)}</p>
  </section>

  ${this.renderLinks(p)}
  ${this.renderSkills(p)}
  ${this.renderExperience(p)}
  ${this.renderProjects(p)}
</body>
</html>`;
  }

  private renderContact(p: Profile): string {
    const parts: string[] = [];
    if (p.location) parts.push(escapeHtml(p.location));
    if (p.email) parts.push(`<a href="mailto:${escapeHtml(p.email)}">${escapeHtml(p.email)}</a>`);
    return parts.length ? `<p class="meta">${parts.join(' · ')}</p>` : '';
  }

  private renderLinks(p: Profile): string {
    if (!p.links?.length) return '';
    const items = p.links
      .map((l) => `<a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>`)
      .join(' · ');
    return `<section><h2>Links</h2><p>${items}</p></section>`;
  }

  private renderSkills(p: Profile): string {
    if (!p.skills?.length) return '';
    const items = p.skills.map((s) => `<span>${escapeHtml(s.name)}</span>`).join('');
    return `<section><h2>Skills</h2><div class="skills">${items}</div></section>`;
  }

  private renderExperience(p: Profile): string {
    if (!p.experience?.length) return '';
    const items = p.experience
      .map((e) => {
        const period = e.isCurrent
          ? `${formatDate(e.startDate)} — Present`
          : `${formatDate(e.startDate)} — ${formatDate(e.endDate)}`;
        return `<li>
          <strong>${escapeHtml(e.position)}</strong> at ${escapeHtml(e.company)}
          <div class="meta">${escapeHtml(period)}</div>
        </li>`;
      })
      .join('');
    return `<section><h2>Experience</h2><ul>${items}</ul></section>`;
  }

  private renderProjects(p: Profile): string {
    if (!p.projects?.length) return '';
    const items = p.projects
      .map(
        (pr) =>
          `<li><a href="${escapeHtml(pr.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(pr.name)}</a></li>`,
      )
      .join('');
    return `<section><h2>Projects</h2><ul>${items}</ul></section>`;
  }
}
