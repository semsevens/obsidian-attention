import { MarkdownPostProcessorContext } from 'obsidian';
import { Provider } from './decorations';
import { paintQuote } from '../paintQuote';

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
      paintQuote(el, a);
    }
  };
}
