// Projecting markdown source onto the text a reader actually sees.
//
// Reading mode hands us a selection made against rendered output, but an anchor
// has to be expressed in source offsets so the editor can decorate it. Those two
// disagree wherever markup lives: `**bold**` is four characters shorter once
// drawn, `[text](url)` loses everything after the word, an image disappears
// entirely.
//
// Requiring the selection to appear verbatim in the source — the previous
// approach — meant any selection containing emphasis, a link or a highlight
// could not be anchored at all. In a real note that is most of them.
//
// So: strip the markup, remember where every surviving character came from, and
// map the match back.

export interface Projection {
  /** The source with inline markup removed. */
  text: string;
  /** `source[map[i]]` is the character that produced `text[i]`. */
  map: number[];
}

/** Inline constructs that wrap text and should be unwrapped, longest first. */
const WRAPPERS = ['***', '___', '**', '__', '~~', '==', '*', '_', '`'];

/**
 * Build the reader's-eye view of `source`, with an offset for every character.
 *
 * Deliberately shallow: it handles the inline markers that break anchoring in
 * practice and leaves block structure alone. A full markdown parse would be
 * more correct and much more to go wrong; what matters here is that the
 * projection and the map stay in step.
 */
export function project(source: string): Projection {
  let text = '';
  const map: number[] = [];
  let i = 0;

  const take = (n: number) => {
    for (let k = 0; k < n; k++) {
      text += source[i];
      map.push(i);
      i++;
    }
  };

  while (i < source.length) {
    // Images vanish from the rendered text entirely, alt text included.
    if (source.startsWith('![', i)) {
      const close = matchLink(source, i + 1);
      if (close) { i = close.end; continue; }
    }

    // Links keep their label and drop the target.
    if (source[i] === '[') {
      const link = matchLink(source, i);
      if (link) {
        i++;                       // past '['
        take(link.labelEnd - i);   // the label itself
        i = link.end;              // past '](…)'
        continue;
      }
    }

    // Wrappers contribute nothing visible; step over the marker only.
    const wrapper = WRAPPERS.find(w => source.startsWith(w, i));
    if (wrapper) { i += wrapper.length; continue; }

    take(1);
  }

  return { text, map };
}

/** Strip markup, discarding the offsets. */
export function strip(source: string): string {
  return project(source).text;
}

/**
 * Turn a range in the projection back into a range in the source.
 *
 * The end maps to just past the last surviving character, so trailing markup
 * isn't swept into the anchor.
 */
export function toSource(p: Projection, from: number, to: number): { from: number; to: number } | null {
  if (from < 0 || to > p.text.length || to <= from) return null;
  return { from: p.map[from], to: p.map[to - 1] + 1 };
}

/** `[label](target)` starting at `i`, or null if it isn't one. */
function matchLink(source: string, i: number): { labelEnd: number; end: number } | null {
  if (source[i] !== '[') return null;
  let depth = 0;
  for (let k = i; k < source.length; k++) {
    if (source[k] === '[') depth++;
    else if (source[k] === ']') {
      depth--;
      if (depth === 0) {
        if (source[k + 1] !== '(') return null;
        const close = source.indexOf(')', k + 2);
        if (close < 0) return null;
        return { labelEnd: k, end: close + 1 };
      }
    } else if (source[k] === '\n' && depth > 0) {
      return null;   // links don't span blank structure; bail rather than guess
    }
  }
  return null;
}
