/**
 * The source lines a rendered block came from.
 *
 * Obsidian tells a post-processor this and nothing else tells anyone: it is the
 * one fact tying rendered output back to the file. Reading mode records it on
 * each block as it renders (see `readingMode`), so anything looking at the DOM
 * afterwards can ask which part of the source it is looking at.
 *
 * With it, locating a selection stops being a search of the whole note — "the
 * third time this phrase appears on screen" — and becomes a search of the one
 * paragraph the reader was pointing at. Nothing else Obsidian happens to draw
 * can then move the answer.
 */

import { Range, lineStarts, rangeOfLines } from '../../anchor/lines';

/** Attribute reading mode stamps on each rendered block. */
export const LINES_ATTR = 'data-at-lines';

/** The line range recorded on an element, if it carries one. */
export function linesOf(el: Element | null): { start: number; end: number } | null {
  const raw = el?.getAttribute(LINES_ATTR);
  if (!raw) return null;
  const [start, end] = raw.split(',').map(Number);
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
}

/** The nearest enclosing block that knows where it came from. */
export function blockAround(node: Node | null): Element | null {
  for (let at: Node | null = node; at; at = at.parentNode) {
    const el = at as Partial<Element>;
    if (typeof el.closest === 'function') return (at as Element).closest(`[${LINES_ATTR}]`);
  }
  return null;
}

/** Where that block's text sits in the source, or null if it isn't marked. */
export function sourceRangeOf(source: string, el: Element | null): Range | null {
  const lines = linesOf(el);
  if (!lines) return null;
  return rangeOfLines(source, lineStarts(source), lines.start, lines.end);
}
