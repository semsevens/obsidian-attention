/**
 * Where a reading-mode selection sits in the source, by position.
 *
 * Each rendered block carries the source lines it came from (see `section`).
 * The edges of a selection are offsets into their blocks' rendered text, and
 * aligning that text with those lines turns each offset into a source offset —
 * see `align`. Nothing is searched for, so nothing can fail to be found: a
 * selection spanning paragraphs, or ending in the gap after one, or crossing
 * markup the screen doesn't show, is placed the same way as any other.
 */

import { align } from '../../anchor/align';
import { LINES_ATTR, blockAround, sourceRangeOf } from './section';

/** The selection's source range, or null when its blocks record no lines. */
export function placeByLines(source: string, range: Range): { from: number; to: number } | null {
  const blocks = blocksIn(range);
  if (blocks.length === 0) return null;

  for (const raw of [false, true]) {
    const from = firstOf(blocks, block => edgeOffset(source, block, range, 'start', raw));
    const to = firstOf([...blocks].reverse(), block => edgeOffset(source, block, range, 'end', raw));
    if (from !== null && to !== null && to > from) return { from, to };
  }
  return null;
}

/**
 * The first block, in order, that can say where an edge is.
 *
 * Not every block can: Obsidian gathers a note's footnotes into one section at
 * the end and records it as the last line, while the definitions sit wherever
 * the author wrote them. A selection that runs into such a block stops at the
 * last one that can be measured, rather than failing as a whole.
 */
function firstOf(blocks: Element[], measure: (block: Element) => number | null): number | null {
  for (const block of blocks) {
    const at = measure(block);
    if (at !== null) return at;
  }
  return null;
}

/**
 * The whole source of the one block a selection lies in.
 *
 * For a block another plugin draws — a terminal recording, a chart — whose
 * text on screen is not text in the file at all. There is nothing finer to
 * anchor to; the block itself is what was pointed at.
 */
export function wholeBlock(source: string, range: Range): { from: number; to: number } | null {
  const blocks = blocksIn(range);
  return blocks.length === 1 ? sourceRangeOf(source, blocks[0]) : null;
}

/**
 * The marked blocks a selection touches, in document order.
 *
 * Only those in the same rendering as the selection's start: a transcluded
 * note numbers its lines from its own file, so a block inside one and a block
 * outside it cannot be measured against the same source.
 */
function blocksIn(range: Range): Element[] {
  const start = blockAround(range.startContainer);
  const common = range.commonAncestorContainer;
  const root =
    start?.closest('.markdown-embed-content, .markdown-preview-view') ??
    (common.nodeType === 1 ? (common as Element) : common.parentElement)?.closest('.markdown-preview-view') ??
    null;
  if (!root) return start ? [start] : [];

  const scope = (el: Element) => el.parentElement?.closest('.markdown-embed-content') ?? null;
  const home = start ? scope(start) : null;
  return Array.from(root.querySelectorAll(`[${LINES_ATTR}]`)).filter(el =>
    range.intersectsNode(el) && (start === null || scope(el) === home),
  );
}

/**
 * The source offset of one edge of `range`, measured inside `block`.
 *
 * An edge outside the block — the selection began above it or ended below it
 * — takes in all of it.
 */
function edgeOffset(
  source: string,
  block: Element,
  range: Range,
  edge: 'start' | 'end',
  raw: boolean,
): number | null {
  const lines = sourceRangeOf(source, block);
  if (!lines) return null;
  const alignment = align(block.textContent ?? '', source.slice(lines.from, lines.to), raw);
  if (!alignment) return null;

  const node = edge === 'start' ? range.startContainer : range.endContainer;
  const offset = edge === 'start' ? range.startOffset : range.endOffset;
  const before = block.ownerDocument.createRange();
  before.setStart(block, 0);
  if (block.contains(node)) before.setEnd(node, offset);
  else if (edge === 'end') before.setEnd(block, block.childNodes.length);
  const at = before.toString().length;

  return lines.from + (edge === 'start' ? alignment.start(at) : alignment.end(at));
}
