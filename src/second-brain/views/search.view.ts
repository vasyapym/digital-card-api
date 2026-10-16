// src/second-brain/views/search.view.ts
import { Injectable } from '@nestjs/common';
import { escapeHtml } from '../../common/html.util';
import type { SearchHit, SearchResults } from '../search/search.service';

// ts_headline private-use markers, written as escapes to keep the file ASCII.
const MARK_OPEN = '\uE000';
const MARK_CLOSE = '\uE001';

export function highlightSnippet(raw: string): string {
  return escapeHtml(raw)
    .split(MARK_OPEN)
    .join('<mark>')
    .split(MARK_CLOSE)
    .join('</mark>');
}

export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

@Injectable()
export class SearchView {
  render(q: string, results: SearchResults): string {
    const form =
      '<form method="get" action="/brain/search">' +
      '<input type="search" name="q" value="' +
      escapeHtml(q) +
      '" autocomplete="off">' +
      '</form>';
    const notices = results.notices
      .map((notice) => '<p class="meta">' + escapeHtml(notice) + '</p>')
      .join('');
    const list =
      results.hits.length === 0
        ? '<p class="meta">no matches</p>'
        : '<ol>' + results.hits.map((hit) => this.renderHit(hit)).join('') + '</ol>';
    return form + notices + list;
  }

  private renderHit(hit: SearchHit): string {
    const href =
      '/brain/n/' + escapeHtml(hit.id) + (hit.anchor === '' ? '' : '#' + escapeHtml(hit.anchor));
    return (
      '<li>' +
      '<p class="hit-title"><a href="' + href + '">' + escapeHtml(hit.title) + '</a></p>' +
      this.renderMeta(folderOf(hit.path), hit.heading) +
      '<p class="snippet">' + highlightSnippet(hit.snippet) + '</p>' +
      '</li>'
    );
  }

  private renderMeta(folder: string, heading: string): string {
    const parts: string[] = [];
    if (folder !== '') {
      parts.push(escapeHtml(folder));
    }
    if (heading !== '') {
      parts.push(escapeHtml(heading));
    }
    return parts.length === 0 ? '' : '<p class="meta">' + parts.join(' &middot; ') + '</p>';
  }
}
