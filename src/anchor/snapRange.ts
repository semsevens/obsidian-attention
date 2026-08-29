/**
 * Tidy the boundaries of a captured range before it becomes an anchor.
 *
 * What a reader drags across and what makes a usable anchor are not the same
 * thing. Live Preview shows an image as a picture and the frontmatter as a
 * properties table, so a drag that looks like "from above the picture to the
 * picture" lands, in the source underneath, inside the `---` fence at one end
 * and halfway through an image URL at the other. Stored verbatim that gives a
 * quote which is neither text nor an image — a wall of half a URL that can
 * never render, and that no longer looks like the thing that was marked.
 *
 * So the edges are moved outward to the nearest boundary that means something.
 */

import { findImageEmbeds } from './imageAnchor';

export interface Range {
  from: number;
  to: number;
}

/** Where the note's body starts: after the frontmatter, if it has any. */
export function bodyStart(source: string): number {
  if (!source.startsWith('---')) return 0;
  const close = source.indexOf('\n---', 3);
  if (close < 0) return 0;
  // Skip the fence's own newline and any blank lines after it, so clamping to
  // here lands on the first thing the note actually says.
  let at = close + 4;
  while (at < source.length && /\s/.test(source[at])) at++;
  return at;
}

/**
 * Move a range's edges out to boundaries worth anchoring to.
 *
 * Returns null when nothing is left — a selection made entirely inside the
 * frontmatter has no body text to mark.
 */
export function snapRange(source: string, from: number, to: number): Range | null {
  let start = Math.max(0, Math.min(from, to));
  let end = Math.min(source.length, Math.max(from, to));

  // Frontmatter is metadata, not the note. A mark that starts inside it starts
  // in the middle of a `---`.
  const body = bodyStart(source);
  if (end <= body) return null;
  start = Math.max(start, body);

  // An edge inside an image embed is an edge inside a URL. Whichever part of
  // the picture was caught, the picture is what was meant.
  for (const embed of findImageEmbeds(source)) {
    if (start > embed.from && start < embed.to) start = embed.from;
    if (end > embed.from && end < embed.to) end = embed.to;
  }

  // Leading and trailing whitespace carries nothing and makes the quote look
  // wrong in the panel.
  while (start < end && /\s/.test(source[start])) start++;
  while (end > start && /\s/.test(source[end - 1])) end--;

  return end > start ? { from: start, to: end } : null;
}
