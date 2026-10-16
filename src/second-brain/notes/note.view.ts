// src/second-brain/notes/note.view.ts
import { Injectable } from '@nestjs/common';
import { escapeHtml } from '../../common/html.util';
import type { Backlink, NotePage } from './notes.repository';

// UTC calendar day, e.g. 2026-03-04.
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function updatedPart(updatedAt: Date | null): string {
  if (updatedAt === null || Number.isNaN(updatedAt.getTime())) return 'unknown date';
  return 'updated ' + isoDay(updatedAt);
}

function metaLine(note: NotePage): string {
  const parts: string[] = [];
  if (note.folderPath !== '') parts.push(escapeHtml(note.folderPath));
  parts.push(escapeHtml(updatedPart(note.updatedAt)));
  return '<p class="meta">' + parts.join(' &middot; ') + '</p>';
}

function tagsLine(tags: string[]): string {
  const chips = tags.map((tag) => '<span class="dim">' + escapeHtml('#' + tag) + '</span>');
  return '<p class="meta">tags: ' + chips.join(' ') + '</p>';
}

function backlinksBlock(backlinks: Backlink[]): string {
  if (backlinks.length === 0) return '<p class="meta">no backlinks</p>';
  const items = backlinks.map(
    (link) =>
      '<li><a href="/brain/n/' + escapeHtml(link.id) + '">' + escapeHtml(link.title) + '</a></li>',
  );
  return (
    '<p class="meta">linked from:</p>\n<ul>' +
    items.join('') +
    '</ul>'
  );
}

@Injectable()
export class NoteView {
  render(note: NotePage): string {
    const lines = [
      '<p class="meta"><a href="/brain">Back to search</a></p>',
      '<h2>' + escapeHtml(note.title) + '</h2>',
      metaLine(note),
      note.bodyHtml,
    ];
    if (note.tags.length > 0) lines.push(tagsLine(note.tags));
    lines.push(backlinksBlock(note.backlinks));
    return lines.join('\n');
  }
}
