/**
 * Find a quote that spans more than one block.
 *
 * Rendered text has no separators between blocks: two paragraphs become
 * `</p><p>`, and flattening the text nodes runs them together. A quote cut from
 * the source keeps the blank line between them, so it can never be found as one
 * string — a mark across four paragraphs stored perfectly well and then drew
 * nothing.
 *
 * So the quote is looked for a block at a time, each piece after the last. All
 * of them have to be there, in order: finding three of four somewhere in the
 * note is not the passage that was marked, and painting it would be worse than
 * painting nothing.
 */

/** The quote's blocks, blank lines and indentation dropped. */
export function blocksOf(quote: string): string[] {
  return quote.split(/\n+/).map(line => line.trim()).filter(line => line.length > 0);
}

/**
 * Where each block sits in the flattened text, or null if they aren't all
 * there in order.
 *
 * `from` says where to start looking, so successive runs of the same quote can
 * be found by calling again past the end of the last.
 */
export function locateRun(full: string, blocks: readonly string[], from = 0): number[] | null {
  if (blocks.length === 0) return null;

  const at: number[] = [];
  let cursor = from;
  for (const block of blocks) {
    const found = full.indexOf(block, cursor);
    if (found < 0) return null;
    at.push(found);
    cursor = found + block.length;
  }
  return at;
}
