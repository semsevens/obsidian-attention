// Re-finding a passage in a file that has since been edited.
//
// This is the one piece of the plugin that can silently lose someone's work: if
// resolution is wrong, a highlight lands on the wrong words; if it gives up too
// easily, the highlight vanishes. So it lives here as pure functions over
// strings, with no `obsidian` import, and is tested directly.
//
// The model is the W3C Web Annotation one: a quote plus a little context on
// each side, backed up by the offsets it had when it was made. Offsets are only
// ever a *hint* — the quote is the identity.

export interface TextAnchor {
  quote: string;
  prefix: string;
  suffix: string;
  from: number;
  to: number;
}

/** How much context to keep on each side. Enough to disambiguate a repeated line. */
export const CONTEXT_LEN = 32;

export function describe(text: string, from: number, to: number): TextAnchor {
  return {
    quote: text.slice(from, to),
    prefix: text.slice(Math.max(0, from - CONTEXT_LEN), from),
    suffix: text.slice(to, to + CONTEXT_LEN),
    from,
    to,
  };
}

export interface ResolvedRange {
  from: number;
  to: number;
  /** How the range was found — useful for showing "moved" vs "exact" in the UI. */
  how: 'exact' | 'context' | 'unique' | 'nearest';
}

/** Length of the common suffix of `a` and `b`. */
function commonSuffixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

/** Length of the common prefix of `a` and `b`. */
function commonPrefixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

function allOccurrences(text: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const out: number[] = [];
  let at = text.indexOf(needle);
  while (at >= 0) {
    out.push(at);
    at = text.indexOf(needle, at + 1);
  }
  return out;
}

/**
 * Find where `anchor` points in `text` now, or null if it's been lost.
 *
 * Tried in order:
 *   1. the stored offsets still hold the quote          → 'exact'
 *   2. one occurrence matches the surrounding context best → 'context'
 *   3. the quote appears exactly once                    → 'unique'
 *   4. several matches, no context signal — take the one nearest
 *      the original position                            → 'nearest'
 */
export function resolve(text: string, anchor: TextAnchor): ResolvedRange | null {
  const { quote } = anchor;
  if (quote.length === 0) return null;

  // 1. The overwhelmingly common case: nothing moved.
  if (text.slice(anchor.from, anchor.to) === quote) {
    return { from: anchor.from, to: anchor.to, how: 'exact' };
  }

  const hits = allOccurrences(text, quote);
  if (hits.length === 0) return null;

  if (hits.length === 1) {
    return { from: hits[0], to: hits[0] + quote.length, how: 'unique' };
  }

  // 2. Several candidates — let the context pick. Scoring by how much of the
  // remembered prefix/suffix still surrounds each one handles the usual case
  // of a repeated phrase where only one occurrence sits in the right place.
  let best = -1;
  let bestScore = -1;
  for (const at of hits) {
    const score =
      commonSuffixLen(text.slice(0, at), anchor.prefix) +
      commonPrefixLen(text.slice(at + quote.length), anchor.suffix);
    if (score > bestScore) {
      bestScore = score;
      best = at;
    }
  }

  if (bestScore > 0) {
    return { from: best, to: best + quote.length, how: 'context' };
  }

  // 3. No context survived either (the passage was moved wholesale, or the
  // quote is short and generic). Position is the last signal left.
  let nearest = hits[0];
  for (const at of hits) {
    if (Math.abs(at - anchor.from) < Math.abs(nearest - anchor.from)) nearest = at;
  }
  return { from: nearest, to: nearest + quote.length, how: 'nearest' };
}

/**
 * Index of the `n`-th (0-based) occurrence of `needle`, or -1.
 *
 * Used to map a selection made in reading mode back onto the source: the
 * rendered HTML has no source offsets, but body text keeps its order, so "the
 * third time this phrase appears on screen" is also the third time it appears
 * in the file.
 */
export function nthOccurrence(text: string, needle: string, n: number): number {
  if (needle.length === 0 || n < 0) return -1;
  let at = text.indexOf(needle);
  for (let i = 0; i < n && at >= 0; i++) at = text.indexOf(needle, at + 1);
  return at;
}

/** How many complete occurrences of `needle` appear in `before`. */
export function countOccurrences(before: string, needle: string): number {
  if (needle.length === 0) return 0;
  let n = 0;
  let at = before.indexOf(needle);
  while (at >= 0) {
    n++;
    at = before.indexOf(needle, at + 1);
  }
  return n;
}
