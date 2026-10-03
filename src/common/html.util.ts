export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDate(date?: Date | null): string {
  if (!date) return '';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' });
}
