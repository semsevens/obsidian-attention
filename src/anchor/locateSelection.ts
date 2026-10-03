// Finding a reading-mode selection in the projected source.
//
// The projection is the source with its markup stripped, so most selections
// appear in it verbatim. Two things still come between them, and neither is
// the reader's doing:
//
// Whitespace. A drag that ends past the last character of a paragraph takes
// the paragraph break with it — `…时间。\n\n` — and a selection across two
// blocks is joined by however many newlines the browser decides on, which is
// rarely the number in the file. So whitespace matches whitespace, any amount
// of it, and the ends are trimmed.
//
// Where to look. The paragraph the reader pointed at is the right place, but
// it is only known from line numbers Obsidian recorded when it last rendered
// that paragraph, and a selection can run out of it. Finding the words a few
// paragraphs away is a far better answer than finding nothing, so when the
// paragraph doesn't hold them, the nearest occurrence wins.

export interface SearchWindow {
  from: number;
  to: number;
  /** Which match inside the window, counting from zero. */
  ordinal: number;
}

/** The selected text as it will be looked for: no whitespace at either end. */
export function needleOf(selected: string): string {
  return selected.trim();
}

/** Where `selected` sits in `text`, preferring the window, or null. */
export function locateSelection(
  text: string,
  selected: string,
  window: SearchWindow,
): { from: number; to: number } | null {
  const needle = needleOf(selected);
  if (needle.length === 0) return null;

  const hits = matches(text, needle);
  if (hits.length === 0) return null;

  const inside = hits.filter(h => h.from >= window.from && h.to <= window.to);
  if (inside.length > 0) return inside[Math.min(Math.max(window.ordinal, 0), inside.length - 1)];

  let best = hits[0];
  for (const hit of hits) {
    if (distance(hit, window) < distance(best, window)) best = hit;
  }
  return best;
}

/** Every non-overlapping match, whitespace in the needle matching any whitespace. */
function matches(text: string, needle: string): { from: number; to: number }[] {
  const pattern = new RegExp(needle.split(/\s+/).map(escape).join('\\s*'), 'gu');
  const out: { from: number; to: number }[] = [];
  for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
    out.push({ from: m.index, to: m.index + m[0].length });
  }
  return out;
}

function distance(hit: { from: number; to: number }, window: SearchWindow): number {
  if (hit.to <= window.from) return window.from - hit.to;
  if (hit.from >= window.to) return hit.from - window.to;
  return 0;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
