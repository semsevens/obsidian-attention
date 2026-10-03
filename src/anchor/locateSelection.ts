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
// This is the fallback. A selection is placed by position first (see
// `placeSelection`); words are searched for only where that can't be done, and
// only inside a window — the blocks the selection touches. A match elsewhere
// in the note is a guess, and short selections match everywhere: a lone `]`
// in a terminal recording once found one in the frontmatter.

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

/** Where `selected` sits in `text`, inside the window, or null. */
export function locateSelection(
  text: string,
  selected: string,
  window: SearchWindow,
): { from: number; to: number } | null {
  const needle = needleOf(selected);
  if (needle.length === 0) return null;

  const inside = matches(text, needle).filter(h => h.from >= window.from && h.to <= window.to);
  if (inside.length === 0) return null;
  return inside[Math.min(Math.max(window.ordinal, 0), inside.length - 1)];
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

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
