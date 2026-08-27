import { MarkdownPostProcessorContext } from 'obsidian';
import { Annotation, isComment } from '../../model';
import { Provider } from './decorations';

/**
 * Highlights for reading mode.
 *
 * Reading mode renders markdown to HTML, so the source offsets an annotation
 * stores don't map onto anything here — `**bold**` is four characters shorter
 * once rendered. Matching is therefore done on the quote text itself.
 *
 * Known limit: a quote that straddles inline markup (a highlight running from
 * plain text into a **bold** run) lands in two separate text nodes and won't be
 * painted. Live Preview, which works against the real document, shows it fine.
 * Rather than reassemble the rendered tree, we accept the gap for now.
 */
export function readingModeHighlighter(provider: Provider) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const annotations = provider(ctx.sourcePath);
    if (annotations.length === 0) return;
    for (const a of annotations) {
      if (a.anchor.kind !== 'markdown') continue;
      paint(el, a);
    }
  };
}

function paint(root: HTMLElement, a: Annotation): void {
  const needle = a.anchor.quote;
  if (!needle) return;

  // Collect first: wrapping mutates the tree the walker is traversing.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    if (text.data.includes(needle) && !isInsideHighlight(text)) targets.push(text);
  }

  for (const node of targets) {
    const at = node.data.indexOf(needle);
    if (at < 0) continue;
    const tail = node.splitText(at);
    tail.splitText(needle.length);

    const span = document.createElement('span');
    span.className = isComment(a) ? 'at-hl at-hl-comment' : 'at-hl';
    span.style.setProperty('--at-color', a.color);
    span.dataset.atId = a.id;
    tail.replaceWith(span);
    span.appendChild(tail);
  }
}

/** Don't nest one highlight inside another when two annotations overlap. */
function isInsideHighlight(node: Node): boolean {
  return node.parentElement?.closest('.at-hl') != null;
}
