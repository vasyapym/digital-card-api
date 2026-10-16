// src/second-brain/views/layout.ts
import { Injectable } from '@nestjs/common';
import { escapeHtml } from '../../common/html.util';

@Injectable()
export class BrainLayoutView {
  // The caller supplies trusted body markup; only the title is escaped here.
  render(title: string, bodyHtml: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
:root{
  --bg:#121212;--fg:#e6e6e6;--fg-2:#a3a3a3;--line:#2c2c2c;
  --accent:#7ab8ff;--ok:#5fcf8f;--err:#ff8a80;
  --s1:.25rem;--s2:.5rem;--s3:.75rem;--s4:1rem;--s6:1.5rem;--s8:2rem;--s12:3rem;
  --t-sm:.8125rem;--t-md:1rem;--t-lg:1.125rem;--t-xl:1.75rem;
  --r:4px;--rail:8rem;
  color-scheme:light dark;
}
@media (prefers-color-scheme:light){
  :root{
    --bg:#ffffff;--fg:#1b1b1b;--fg-2:#5c5c5c;--line:#e4e4e4;
    --accent:#0b5cad;--ok:#1a7f37;--err:#b3261e;
  }
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:var(--t-md)/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
main{max-width:42rem;margin:0 auto;padding:var(--s4);overflow-wrap:anywhere}
@media (min-width:48rem){main{padding:var(--s8) var(--s6)}}
h1,h2,h3,p{margin:0 0 var(--s4)}
h1{font-size:var(--t-xl);font-weight:600;line-height:1.2}
h2{font-size:var(--t-lg);font-weight:600}
h3{font-size:var(--t-md);font-weight:600}
small,.meta{color:var(--fg-2);font-size:var(--t-sm)}
.err{color:var(--err)}
.warn{color:var(--err)}
label{display:block;margin:0 0 var(--s2);font-weight:600}
a,button,input,select,textarea{min-height:44px}
a{display:inline-block;padding:var(--s2) 0;color:var(--accent);text-underline-offset:.15em}
button,input,select,textarea{max-width:100%;padding:var(--s2) var(--s3);border:1px solid var(--line);border-radius:var(--r);background:var(--bg);color:var(--fg);font:inherit}
button{border-color:var(--accent);background:var(--accent);color:var(--bg);cursor:pointer}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
::selection{background:var(--accent);color:var(--bg)}
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
  }
}
