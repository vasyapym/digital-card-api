import { Injectable } from '@nestjs/common';
import { escapeHtml, formatDate } from '../common/html.util';
import { Experience, Link, Profile, Project, Skill } from './models/profile.models';

const e = escapeHtml;

const SELF_PROJECT_NAME = 'Digital Card API';

const CSS = `
:root{
  --bg:#ffffff;--fg:#1b1b1b;--fg-2:#5c5c5c;--line:#e4e4e4;
  --accent:#0b5cad;--ok:#1a7f37;--err:#b3261e;
  --s1:.25rem;--s2:.5rem;--s3:.75rem;--s4:1rem;--s6:1.5rem;--s8:2rem;--s12:3rem;
  --t-sm:.8125rem;--t-md:1rem;--t-lg:1.125rem;--t-xl:1.75rem;
  --r:4px;--rail:8rem;
  color-scheme:light dark;
}
@media (prefers-color-scheme:dark){
  :root{--bg:#121212;--fg:#e6e6e6;--fg-2:#a3a3a3;--line:#2c2c2c;--accent:#7ab8ff;--ok:#5fcf8f;--err:#ff8a80}
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:var(--t-md)/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:46rem;margin:0 auto;padding:var(--s12) var(--s4);overflow-wrap:anywhere}
h1,h2,h3,p,ul{margin:0}
ul{padding:0;list-style:none}
a{color:var(--accent);text-decoration:underline;text-decoration-thickness:1px;text-decoration-color:var(--line);text-underline-offset:.18em}
a:hover{text-decoration-color:currentColor}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
::selection{background:var(--accent);color:var(--bg)}

.sec{display:grid;row-gap:var(--s4)}
.sec+.sec{margin-top:var(--s8);padding-top:var(--s8);border-top:1px solid var(--line)}
.sec>h2{font-size:var(--t-sm);font-weight:500;line-height:1.5;letter-spacing:.01em;color:var(--fg-2)}
@media (min-width:48rem){
  .sec{grid-template-columns:var(--rail) minmax(0,1fr);column-gap:var(--s6)}
  .sec>.body{grid-column:2}
}

h1{font-size:var(--t-xl);font-weight:600;line-height:1.2;letter-spacing:-.01em}
.title{margin-top:var(--s2)}
.meta{font-size:var(--t-sm);line-height:1.5;color:var(--fg-2)}
.meta a{color:inherit}
.self{margin-top:var(--s2)}
.lede{margin-top:var(--s6);font-size:var(--t-lg);line-height:1.55;max-width:60ch;white-space:pre-line}

.row{display:flex;flex-wrap:wrap;gap:var(--s2) var(--s6)}
.pills{display:flex;flex-wrap:wrap;gap:var(--s2)}
.pills li{max-width:100%;padding:var(--s1) var(--s3);border:1px solid var(--line);border-radius:999px;font-size:var(--t-sm);line-height:1.4}

.stack>*+*{margin-top:var(--s6)}
h3{font-size:var(--t-md);font-weight:600;line-height:1.4}
h3 .org{font-weight:400}
.desc{margin-top:var(--s1)}
.ach{margin-top:var(--s2);padding-left:var(--s4);font-size:var(--t-sm);line-height:1.45;color:var(--fg-2)}
.ach li{position:relative}
.ach li+li{margin-top:var(--s1)}
.ach li::before{content:"\\2013";position:absolute;left:calc(-1 * var(--s4))}

form{display:grid;gap:var(--s4);max-width:34rem}
label{display:grid;gap:var(--s1);font-size:var(--t-sm);color:var(--fg-2)}
input,textarea,button{font:inherit;margin:0;border-radius:var(--r);appearance:none;-webkit-appearance:none}
input,textarea{width:100%;padding:var(--s2) var(--s3);color:var(--fg);background:var(--bg);border:1px solid var(--line)}
input:hover,textarea:hover{border-color:var(--fg-2)}
::placeholder{color:var(--fg-2);opacity:1}
textarea{resize:vertical;line-height:1.5}
.hp{display:none !important}
.actions{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s3) var(--s4)}
button{padding:var(--s2) var(--s4);border:1px solid var(--accent);background:var(--accent);color:var(--bg);font-weight:500;cursor:pointer}
button:hover{opacity:.85}
.note{min-height:1.5em;font-size:var(--t-sm);line-height:1.5}
.note.sent{color:var(--ok)}
.note.error{color:var(--err)}

@media (any-pointer:coarse){input,textarea{font-size:16px}}

@media (prefers-reduced-motion:no-preference){
  a,button,input,textarea{transition:color .15s,background-color .15s,border-color .15s,text-decoration-color .15s,opacity .15s}
}
`;

@Injectable()
export class ProfileCardView {
  public render(p: Profile, status?: 'sent' | 'error' | null): string {
    const body = [
      this.renderHeader(p),
      this.renderLinks(p.links),
      this.renderSkills(p.skills),
      this.renderExperience(p.experience),
      this.renderProjects(p.projects),
      this.renderContact(status ?? null),
    ]
      .filter(Boolean)
      .join('\n');

    const docTitle = [p.name, p.title].filter(Boolean).map(e).join(' — ');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${docTitle}</title>
<meta name="description" content="${e(p.description)}">
<style>${CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`;
  }

  private renderHeader(p: Profile): string {
    const self = [
      p.location ? `<span>${e(p.location)}</span>` : '',
      p.email ? `<a href="mailto:${e(p.email)}">${e(p.email)}</a>` : '',
    ]
      .filter(Boolean)
      .join(' · ');

    return `<header class="sec"><div class="body">
<h1>${e(p.name)}</h1>
${p.title ? `<p class="title">${e(p.title)}</p>` : ''}
${self ? `<p class="meta self">${self}</p>` : ''}
${p.description ? `<p class="lede">${e(p.description)}</p>` : ''}
</div></header>`;
  }

  private renderLinks(links: Link[] | null | undefined): string {
    if (!links?.length) return '';
    const items = links
      .map((l) => {
        const url = this.safeUrl(l.url);
        const inner = url
          ? `<a href="${e(url)}" rel="noopener noreferrer">${e(l.label)}</a>`
          : e(l.label);
        return `<li>${inner}</li>`;
      })
      .join('');
    return this.section('links', 'Links', `<ul class="row">${items}</ul>`);
  }

  private renderSkills(skills: Skill[] | null | undefined): string {
    if (!skills?.length) return '';
    const items = skills.map((s) => `<li>${e(s.name)}</li>`).join('');
    return this.section('skills', 'Skills', `<ul class="pills">${items}</ul>`);
  }

  private renderExperience(items: Experience[] | null | undefined): string {
    if (!items?.length) return '';
    const body = items
      .map((x) => {
        const end = x.isCurrent || !x.endDate ? 'Present' : formatDate(x.endDate);
        const meta = [`${formatDate(x.startDate)} — ${end}`, this.formatDuration(x.durationInMonths)]
          .filter(Boolean)
          .join(' · ');
        const ach = x.achievements?.length
          ? `<ul class="ach">${x.achievements.map((a) => `<li>${e(a)}</li>`).join('')}</ul>`
          : '';
        return `<article>
<h3>${e(x.company)}<span class="org"> · ${e(x.position)}</span></h3>
<p class="meta">${e(meta)}</p>
${x.description ? `<p class="desc">${e(x.description)}</p>` : ''}
${ach}
</article>`;
      })
      .join('');
    return this.section('experience', 'Work', `<div class="stack">${body}</div>`);
  }

  private renderProjects(items: Project[] | null | undefined): string {
    if (!items?.length) return '';
    const body = items
      .map((x) => {
        const url = this.isSelf(x) ? null : this.safeUrl(x.url);
        const repo = this.safeUrl(x.repositoryUrl);
        const name = url ? `<a href="${e(url)}" rel="noopener noreferrer">${e(x.name)}</a>` : e(x.name);
        const tail = [
          ...(x.technologies ?? []).map((t) => e(t)),
          repo ? `<a href="${e(repo)}" rel="noopener noreferrer">repo</a>` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return `<article>
<h3>${name}</h3>
${x.description ? `<p class="desc">${e(x.description)}</p>` : ''}
${tail ? `<p class="meta">${tail}</p>` : ''}
</article>`;
      })
      .join('');
    return this.section('projects', 'Projects', `<div class="stack">${body}</div>`);
  }

  private renderContact(status: 'sent' | 'error' | null): string {
    const text =
      status === 'sent'
        ? 'Sent — thank you, I’ll reply by email.'
        : status === 'error'
          ? 'Couldn’t send. Please try again, or copy my email from the top of the card.'
          : '';
    const cls = status ? ` ${status}` : '';
    const form = `<form action="/api/messages" method="post">
<label>Your email (optional)
<input type="email" name="email" placeholder="you@company.com" autocomplete="email"></label>
<label>Message
<textarea name="message" required rows="2" placeholder="A line or two about what&#39;s on your mind."></textarea></label>
<div class="hp" aria-hidden="true"><label>Company<input type="text" name="company" tabindex="-1" autocomplete="off"></label></div>
<div class="actions">
<button type="submit">Send message</button>
<p class="note${cls}" role="status" aria-live="polite">${text}</p>
</div>
</form>`;
    return this.section('contact', 'Contact', form);
  }

  private section(id: string, heading: string, body: string): string {
    return `<section class="sec" id="${id}" aria-labelledby="${id}-h">
<h2 id="${id}-h">${heading}</h2>
<div class="body">${body}</div>
</section>`;
  }

  private formatDuration(months: number): string {
    if (!Number.isFinite(months) || months <= 0) return '';
    const y = Math.floor(months / 12);
    const m = months % 12;
    return [y ? `${y} yr` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ');
  }

  private safeUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const u = url.trim();
    return /^https?:\/\/\S+$/i.test(u) ? u : null;
  }

  private isSelf(x: Project): boolean {
    return x.name === SELF_PROJECT_NAME;
  }
}
