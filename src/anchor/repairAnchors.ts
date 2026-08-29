/**
 * Tidy up anchors that were stored before their edges were checked.
 *
 * `snapRange` keeps new marks from starting inside a `---` fence or stopping
 * halfway along an image URL, but marks made before it existed are still on
 * disk, and a mark that is half an image address renders as a wall of text
 * instead of the picture it was made on. Fixing them where they are read means
 * they come right by themselves rather than having to be remade.
 */

import { MarkdownAnchor } from '../model';
import { describe } from './textQuote';
import { snapRange } from './snapRange';

/**
 * A repaired version of this anchor, or null if it needs no repair.
 *
 * Only anchors whose offsets still describe their own quote are touched. Once
 * the file has moved on underneath one, the stored offsets mean nothing and
 * re-cutting the source at them would replace a findable mark with a wrong
 * one — that case belongs to the resolver, which searches by quote instead.
 */
export function repairAnchor(source: string, anchor: MarkdownAnchor): MarkdownAnchor | null {
  if (source.slice(anchor.from, anchor.to) !== anchor.quote) return null;

  const snapped = snapRange(source, anchor.from, anchor.to);
  if (!snapped) return null;
  if (snapped.from === anchor.from && snapped.to === anchor.to) return null;

  return { ...anchor, ...describe(source, snapped.from, snapped.to) };
}
