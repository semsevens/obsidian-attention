import { Annotation, isComment } from '../model';

/**
 * Wrap occurrences of a quote inside an already-rendered element.
 *
 * Shared by the hosts that paint over DOM someone else produced — reading mode
 * and the transcript panel. Both work on rendered text rather than offsets,
 * because in neither case does the DOM correspond character-for-character to
 * what the anchor was measured against.
 *
 * A quote is matched across the container's text as one string and then wrapped
 * piece by piece, so a mark running from plain text through a **bold** run and
 * out the other side is painted in full. Matching within single text nodes —
 * the obvious approach — silently skipped exactly those marks, which in a real
 * note is a great many of them.
 *
 * Idempotent: text already inside a highlight is skipped, so re-running after
 * the host rebuilds costs nothing and never nests.
 */
export function paintQuote(
  root: HTMLElement,
  annotation: Annotation,
  quote = annotation.anchor.quote,
): void {
  if (!quote) return;

  const nodes = textNodesIn(root);
  if (nodes.length === 0) return;

  // One flat string, with each node's offset into it, so a quote spanning
  // several nodes is still just an indexOf.
  const starts: number[] = [];
  let full = '';
  for (const n of nodes) {
    starts.push(full.length);
    full += n.data;
  }

  const spans: { node: Text; from: number; to: number }[] = [];
  for (let at = full.indexOf(quote); at >= 0; at = full.indexOf(quote, at + quote.length)) {
    const end = at + quote.length;
    for (let i = 0; i < nodes.length; i++) {
      const nodeStart = starts[i];
      const nodeEnd = nodeStart + nodes[i].data.length;
      if (nodeEnd <= at || nodeStart >= end) continue;
      spans.push({
        node: nodes[i],
        from: Math.max(at, nodeStart) - nodeStart,
        to: Math.min(end, nodeEnd) - nodeStart,
      });
    }
  }

  // Back to front: wrapping splits nodes, which would invalidate the offsets
  // of anything still to its right.
  for (const s of spans.reverse()) wrap(s.node, s.from, s.to, annotation);
}

/** Text nodes worth painting: skips anything already inside a mark. */
function textNodesIn(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (text.data.length > 0 && !isInsideHighlight(text)) out.push(text);
  }
  return out;
}

function wrap(node: Text, from: number, to: number, annotation: Annotation): void {
  if (to <= from) return;
  const tail = from > 0 ? node.splitText(from) : node;
  if (to - from < tail.data.length) tail.splitText(to - from);

  const span = document.createElement('span');
  span.className = isComment(annotation) ? 'at-hl at-hl-comment' : 'at-hl';
  span.dataset.atId = annotation.id;
  tail.replaceWith(span);
  span.appendChild(tail);
}

/** Don't nest one highlight inside another when two annotations overlap. */
function isInsideHighlight(node: Node): boolean {
  return node.parentElement?.closest('.at-hl') != null;
}
