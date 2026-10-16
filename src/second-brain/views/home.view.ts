// src/second-brain/views/home.view.ts
import { Injectable } from '@nestjs/common';
import type { BrainFreshness } from '../web/meta.service';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Coarse age label; a future atMs is clamped so the count is never negative.
export function relativeTime(nowMs: number, atMs: number): string {
  const diff = Math.max(0, nowMs - atMs);
  if (diff < MINUTE_MS) {
    return 'just now';
  }
  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)} min ago`;
  }
  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)} h ago`;
  }
  return `${Math.floor(diff / DAY_MS)} d ago`;
}

@Injectable()
export class HomeView {
  // Fragment only: freshness line plus the logout form. Search arrives with its route.
  public render(f: BrainFreshness): string {
    return [
      this.freshnessLine(f),
      '<form method="post" action="/brain/logout">',
      '<button type="submit">Log out</button>',
      '</form>',
    ].join('\n');
  }

  private freshnessLine(f: BrainFreshness): string {
    if (f.lastIndexedAt === null || f.noteCount === null) {
      return '<p class="meta">not indexed yet</p>';
    }
    const age = relativeTime(Date.now(), f.lastIndexedAt.getTime());
    return `<p class="meta">${age} &middot; ${f.noteCount} notes</p>`;
  }
}
