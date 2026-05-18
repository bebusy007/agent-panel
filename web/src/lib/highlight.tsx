import { createElement } from "react";
import { highlightSegments } from "@/lib/highlight-shared";
import type { ReactNode } from "react";

const MARK_BASE = "search-mark bg-amber-300/40 text-fg rounded px-0.5";

/**
 * Render text with query matches wrapped in <mark class="search-mark"> elements.
 * All marks carry the `search-mark` class so the detail view can query & navigate.
 */
export function HighlightText({
  text,
  q,
  className,
}: {
  text: string;
  q?: string;
  className?: string;
}): ReactNode {
  if (!q || !q.trim() || !text) return text;
  const segs = highlightSegments(text, q);
  if (segs.length === 1 && segs[0]!.type === "text") return text;
  return segs.map((seg, i) =>
    seg.type === "mark"
      ? createElement("mark", { key: i, className: className ?? MARK_BASE }, seg.value)
      : seg.value
  );
}

export function highlightJsx(text: string, q?: string): ReactNode {
  return HighlightText({ text, q });
}

export interface HighlightDomResult {
  /** Total match count, computed from DOM walk */
  count: number;
  /** Remove all marks and restore original DOM */
  cleanup: () => void;
}

/**
 * Apply DOM-level text highlighting on an already-rendered container element.
 * Walks all TEXT_NODE descendants, wraps matching substrings in <mark> elements
 * with class `search-mark` so the parent can query them later for navigation.
 *
 * Does NOT manage active/focused state — that's the caller's job, so it can
 * coordinate focus across multiple messages in a virtualized list.
 */
export function highlightDom(container: HTMLElement, q: string): HighlightDomResult {
  const empty: HighlightDomResult = { count: 0, cleanup: () => {} };
  if (!q || !q.trim() || !container) return empty;
  const ql = q.toLowerCase();
  const marks: HTMLElement[] = [];

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const textNodes: Text[] = [];
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
  }

  for (const node of textNodes) {
    const text = node.textContent ?? "";
    const tl = text.toLowerCase();
    let searchFrom = 0;
    const ranges: Array<{ start: number; end: number }> = [];
    while (searchFrom < tl.length) {
      const idx = tl.indexOf(ql, searchFrom);
      if (idx < 0) break;
      ranges.push({ start: idx, end: idx + ql.length });
      searchFrom = idx + ql.length;
    }
    if (ranges.length === 0) continue;

    for (let i = ranges.length - 1; i >= 0; i--) {
      const { start, end } = ranges[i]!;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const mark = document.createElement("mark");
      mark.className = MARK_BASE;
      try {
        range.surroundContents(mark);
        marks.push(mark);
      } catch {
        // surroundContents can fail if range crosses element boundaries; skip.
      }
    }
  }

  const cleanup = () => {
    for (const mark of marks) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
    }
    container.normalize();
  };

  return { count: marks.length, cleanup };
}

/**
 * Scroll a given mark element into the center of its nearest scrollable ancestor
 * without triggering whole-page scrolls (which break inside Drawers).
 */
export function centerMarkInScroller(mark: HTMLElement): void {
  let node: HTMLElement | null = mark.parentElement;
  let scroller: HTMLElement | null = null;
  while (node) {
    const style = getComputedStyle(node);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      scroller = node;
      break;
    }
    node = node.parentElement;
  }
  if (!scroller) return;
  const markRect = mark.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const desiredScrollTop =
    scroller.scrollTop +
    (markRect.top - scrollerRect.top) -
    scrollerRect.height / 2 +
    markRect.height / 2;
  scroller.scrollTo({ top: desiredScrollTop, behavior: "smooth" });
}
