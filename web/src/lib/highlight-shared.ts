/**
 * Shared highlight utilities for search results.
 * Works in both server (Node/Bun) and browser (React) contexts.
 */

/**
 * Escape HTML special characters to prevent XSS when building HTML strings.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Return an HTML string with all occurrences of `q` wrapped in <mark>.
 * Case-insensitive. Input text is HTML-escaped first for safety.
 */
export function highlightHtml(text: string, q: string): string {
  if (!q || !q.trim()) return escapeHtml(text);
  const ql = q.toLowerCase();
  const tl = text.toLowerCase();
  const parts: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = tl.indexOf(ql, cursor);
    if (idx < 0) {
      parts.push(escapeHtml(text.slice(cursor)));
      break;
    }
    if (idx > cursor) parts.push(escapeHtml(text.slice(cursor, idx)));
    parts.push(`<mark>${escapeHtml(text.slice(idx, idx + ql.length))}</mark>`);
    cursor = idx + ql.length;
  }
  return parts.join('');
}

/**
 * Extract a snippet of `contextLen` chars around the first match of `q` in `text`,
 * with the match wrapped in <mark> (HTML string). Returns plain escaped text if no match.
 */
export function snippetWithHighlight(text: string, q: string, contextLen = 160): string {
  if (!q || !q.trim()) return escapeHtml(text.slice(0, contextLen));
  const ql = q.toLowerCase();
  const tl = text.toLowerCase();
  const idx = tl.indexOf(ql);
  if (idx < 0) return escapeHtml(text.slice(0, contextLen));

  const start = Math.max(0, idx - Math.floor(contextLen / 3));
  const end = Math.min(text.length, start + contextLen);
  const slice = text.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + highlightHtml(slice, q) + suffix;
}

// ---- Segment helpers (framework-agnostic, used by frontend JSX wrapper) ----

export interface HighlightSegment {
  type: 'text' | 'mark';
  value: string;
}

/**
 * Split text into segments: plain text and marked (matched) portions.
 * Case-insensitive. Returns segments suitable for mapping to React elements.
 */
export function highlightSegments(text: string, q: string): HighlightSegment[] {
  if (!q || !q.trim() || !text) return [{ type: 'text', value: text }];
  const ql = q.toLowerCase();
  const tl = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const idx = tl.indexOf(ql, cursor);
    if (idx < 0) {
      segments.push({ type: 'text', value: text.slice(cursor) });
      break;
    }
    if (idx > cursor) segments.push({ type: 'text', value: text.slice(cursor, idx) });
    segments.push({ type: 'mark', value: text.slice(idx, idx + ql.length) });
    cursor = idx + ql.length;
  }
  return segments;
}
