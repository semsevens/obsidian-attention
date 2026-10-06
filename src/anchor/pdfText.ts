// The text of a PDF page, and where a passage sits in it.
//
// pdf.js hands a page over as a list of text items — a run of characters each,
// usually a line or part of one — and Obsidian names a passage by the item and
// offset at each end: `selection=beginIndex,beginOffset,endIndex,endOffset`.
// PDF++ uses the same terms, so a mark in them is a link PDF++ can open.
//
// Pure functions over the items' strings: no pdf.js, no DOM, tested directly.

import type { PdfSpan } from '../model';
import { CONTEXT_LEN, resolve } from './textQuote';

type Selection = PdfSpan['selection'];

/** Character offset in the page's text where each item starts. */
function starts(items: readonly string[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const item of items) {
    out.push(at);
    at += item.length;
  }
  return out;
}

/** The page's text, items end to end — what the text layer draws. */
export function pageText(items: readonly string[]): string {
  return items.join('');
}

/**
 * A selection as character offsets in the page's text.
 *
 * An end offset of 0 means the end of the item before, as pdf.js and PDF++
 * both read it — a selection ending exactly at an item boundary.
 */
export function toOffsets(items: readonly string[], [bi, bo, ei, eo]: Selection): { from: number; to: number } | null {
  if (bi < 0 || ei >= items.length || bi > ei) return null;
  const at = starts(items);
  const from = at[bi] + Math.min(bo, items[bi].length);
  const to = at[ei] + Math.min(eo, items[ei].length);
  return to > from ? { from, to } : null;
}

/** Character offsets back into items: the inverse of `toOffsets`. */
export function toSelection(items: readonly string[], from: number, to: number): Selection | null {
  const at = starts(items);
  const total = pageText(items).length;
  if (from < 0 || to > total || to <= from) return null;
  // The begin sits in the item that contains `from`; the end in the item that
  // contains the last character, so it never lands at offset 0 of the next.
  const begin = itemAt(at, items, from);
  const end = itemAt(at, items, to - 1);
  return [begin, from - at[begin], end, to - at[end]];
}

/** Index of the item holding character `offset` (skipping empty items). */
function itemAt(at: number[], items: readonly string[], offset: number): number {
  let i = at.length - 1;
  while (i > 0 && (at[i] > offset || items[i].length === 0)) i--;
  return i;
}

/** What a selection reads, or null if it doesn't fit these items. */
export function spanText(items: readonly string[], selection: Selection): string | null {
  const range = toOffsets(items, selection);
  return range && pageText(items).slice(range.from, range.to);
}

/**
 * The quote and its context for a passage across pages.
 *
 * `pages` gives, for each span, the items of its page. The quote is the spans'
 * text joined by newlines; the prefix comes from before the first span and the
 * suffix from after the last, each from its own page only.
 */
export function describePdf(
  spans: readonly PdfSpan[],
  pages: ReadonlyMap<number, readonly string[]>,
): { quote: string; prefix: string; suffix: string } | null {
  const parts: string[] = [];
  for (const span of spans) {
    const items = pages.get(span.page);
    const text = items && spanText(items, span.selection);
    if (text === null || text === undefined) return null;
    parts.push(text);
  }
  const first = spans[0], last = spans[spans.length - 1];
  if (!first || !last) return null;
  const head = pageText(pages.get(first.page) ?? []);
  const tail = pageText(pages.get(last.page) ?? []);
  const from = toOffsets(pages.get(first.page) ?? [], first.selection)!.from;
  const to = toOffsets(pages.get(last.page) ?? [], last.selection)!.to;
  return {
    quote: parts.join('\n'),
    prefix: head.slice(Math.max(0, from - CONTEXT_LEN), from),
    suffix: tail.slice(to, to + CONTEXT_LEN),
  };
}

/**
 * Where a single-page span's words are now, or null.
 *
 * A PDF isn't edited, so the stored selection is almost always still right;
 * this checks it reads the quote, and otherwise looks for the quote on the same
 * page by its context — a file replaced by a re-export, say, where items split
 * differently but the words are the same.
 */
export function resolveSpan(
  items: readonly string[],
  span: PdfSpan,
  quote: string,
  prefix: string,
  suffix: string,
): Selection | null {
  if (spanText(items, span.selection) === quote) return span.selection;
  const text = pageText(items);
  const hint = toOffsets(items, span.selection);
  const found = resolve(text, {
    quote, prefix, suffix,
    from: hint?.from ?? 0,
    to: hint?.to ?? quote.length,
  });
  return found ? toSelection(items, found.from, found.to) : null;
}

/** A text item as pdf.js gives it: where it sits, as well as what it says. */
export interface PlacedItem {
  str: string;
  /** [a, b, c, d, e, f]: e and f are where the item's baseline starts. */
  transform?: number[];
  width?: number;
  height?: number;
}

/**
 * The text lying inside a rectangle of the page, in reading order.
 *
 * An item counts when its middle is inside — a line clipped by the edge of a
 * drag belongs to the side most of it is on. Rect and items share the page's
 * coordinates: PDF units, origin bottom left.
 */
export function textInRect(items: readonly PlacedItem[], [x1, y1, x2, y2]: readonly number[]): string {
  const inside = items.filter(item => {
    const t = item.transform;
    if (!item.str.trim() || !t || t.length < 6) return false;
    const x = t[4] + (item.width ?? 0) / 2;
    const y = t[5] + (item.height ?? 0) / 2;
    return x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && y >= Math.min(y1, y2) && y <= Math.max(y1, y2);
  });
  return inside.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
}
