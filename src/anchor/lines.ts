/**
 * Source positions by line.
 *
 * Obsidian tells a post-processor which lines of the file a rendered block came
 * from. That is the only honest bridge between the two: everything else — how
 * many times a phrase appears on screen, what else is drawn around it — is a
 * property of the rendering, and changes with settings, plugins and how far
 * the reader has scrolled.
 *
 * With it, a mark is placed by asking which block holds its source range,
 * rather than by looking for its words among whatever else is on the page.
 */

export interface Range {
  from: number;
  to: number;
}

/** Character offset where each line begins, line 0 first. */
export function lineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/** The character range lines `from`..`to` cover, both inclusive. */
export function rangeOfLines(source: string, starts: readonly number[], from: number, to: number): Range {
  const first = starts[Math.max(0, Math.min(from, starts.length - 1))] ?? 0;
  const after = starts[to + 1];
  return { from: first, to: after === undefined ? source.length : after };
}

/** Which line an offset falls on, counting from zero. */
export function lineOf(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** The part of `a` that also lies in `b`, or null if they don't meet. */
export function intersect(a: Range, b: Range): Range | null {
  const from = Math.max(a.from, b.from);
  const to = Math.min(a.to, b.to);
  return to > from ? { from, to } : null;
}
