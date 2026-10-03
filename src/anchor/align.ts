// Mapping a position in rendered text onto the source it came from.
//
// Reading mode knows which source lines each block came from, but not where
// inside them any one character sits. Searching the source for the selected
// words — the first approach — fails whenever the screen and the file disagree
// about a single character, and they disagree constantly: markup, HTML,
// entities, list numbers, the newlines a browser invents between blocks.
//
// Aligning the two instead cannot fail that way. The rendered text of a block
// is, give or take those differences, a subsequence of its source; a diff
// pairs up every character they share, and whatever doesn't pair is simply
// skipped. A position on screen then has a position in the file, found by
// walking to the nearest paired character, with no search to come up empty.
//
// The source is projected first (markup stripped, offsets kept), which leaves
// the diff only the differences the projection doesn't know about — few, so
// the diff stays cheap.

import { project } from './plainText';

/** Give up past this many edits; the block is not the text it claims to be. */
const MAX_EDITS = 2000;

export interface Alignment {
  /** Source offset where rendered offset `at` starts, scanning forward. */
  start(at: number): number;
  /** Source offset where rendered offset `at` ends, scanning backward. */
  end(at: number): number;
}

/**
 * Align a block's rendered text with its source, or null if they are too
 * different to trust: more than `MAX_EDITS` apart, or with less than half the
 * rendered text found in the source — which is what line numbers recorded
 * before an edit look like, and a mark placed from them would land elsewhere.
 *
 * Offsets returned are relative to `source`.
 */
export function align(rendered: string, source: string): Alignment | null {
  const plain = project(source);
  const pairs = diffPairs(rendered, plain.text);
  if (!pairs) return null;
  if (pairs.filter(j => j >= 0).length * 2 < rendered.length) return null;

  const toSource = (j: number) => plain.map[j];
  return {
    start(at) {
      for (let i = Math.max(0, at); i < rendered.length; i++) {
        if (pairs[i] >= 0) return toSource(pairs[i]);
      }
      return source.length;
    },
    end(at) {
      for (let i = Math.min(at, rendered.length) - 1; i >= 0; i--) {
        if (pairs[i] >= 0) return toSource(pairs[i]) + 1;
      }
      return 0;
    },
  };
}

/**
 * For each character of `a`, the index of the character of `b` it pairs
 * with in a longest common subsequence, or -1. Myers' O((N+M)D) diff.
 */
export function diffPairs(a: string, b: string): Int32Array | null {
  const n = a.length;
  const m = b.length;
  const pairs = new Int32Array(n).fill(-1);
  const max = Math.min(n + m, MAX_EDITS);
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] holds v[-d-1 .. d+1] as it stood before round d.
  const trace: Int32Array[] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
        ? v[offset + k + 1]
        : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        backtrack(trace, n, m, pairs);
        return pairs;
      }
    }
  }
  return null;
}

function backtrack(trace: Int32Array[], n: number, m: number, pairs: Int32Array): void {
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const at = (k: number) => trace[d][k + d + 1];
    const k = x - y;
    const prevK = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--; y--;
      pairs[x] = y;
    }
    x = prevX;
    y = prevY;
  }
}
