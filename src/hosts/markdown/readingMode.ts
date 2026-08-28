import { MarkdownPostProcessorContext } from 'obsidian';
import { Provider } from './decorations';
import { paintQuote } from '../paintQuote';
import { strip } from '../../anchor/plainText';

/**
 * Highlights for reading mode.
 *
 * Reading mode renders markdown to HTML, so the source offsets an annotation
 * stores don't map onto anything here — `**bold**` is four characters shorter
 * once rendered. Matching is therefore done on the quote text itself.
 *
 * The stored quote is source text, so it is stripped of markup before being
 * looked for here — otherwise a mark covering `**bold**` would search the
 * rendered DOM for asterisks that were never drawn.
 *
 * Known limit: a quote straddling inline markup lands in two separate text
 * nodes, and only the run containing the whole stripped quote gets painted.
 * Live Preview, which works against the real document, shows it fully.
 */
export function readingModeHighlighter(provider: Provider) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const annotations = provider(ctx.sourcePath);
    if (annotations.length === 0) return;
    for (const a of annotations) {
      if (a.anchor.kind !== 'markdown') continue;
      // The stored quote is source text; what's on screen has no markup in it.
      paintQuote(el, a, strip(a.anchor.quote));
    }
  };
}
