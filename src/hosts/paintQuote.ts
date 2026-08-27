import { Annotation, isComment } from '../model';

/**
 * Wrap occurrences of a quote inside an already-rendered element.
 *
 * Shared by the hosts that paint over DOM someone else produced — reading mode
 * and the transcript panel. Both work on rendered text rather than offsets,
 * because in neither case does the DOM correspond character-for-character to
 * what the anchor was measured against.
 *
 * Idempotent: text already inside a highlight is skipped, so re-running after
 * the host rebuilds costs nothing and never nests.
 */
export function paintQuote(root: HTMLElement, annotation: Annotation, quote = annotation.anchor.quote): void {
  if (!quote) return;

  // Collect first — wrapping mutates the tree the walker is traversing.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (text.data.includes(quote) && !isInsideHighlight(text)) targets.push(text);
  }

  for (const node of targets) {
    const at = node.data.indexOf(quote);
    if (at < 0) continue;
    const tail = node.splitText(at);
    tail.splitText(quote.length);

    const span = document.createElement('span');
    span.className = isComment(annotation) ? 'at-hl at-hl-comment' : 'at-hl';
    span.dataset.atId = annotation.id;
    tail.replaceWith(span);
    span.appendChild(tail);
  }
}

/** Don't nest one highlight inside another when two annotations overlap. */
function isInsideHighlight(node: Node): boolean {
  return node.parentElement?.closest('.at-hl') != null;
}
