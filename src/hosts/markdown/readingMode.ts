import { App, MarkdownPostProcessorContext, MarkdownView } from 'obsidian';
import { Provider } from './decorations';
import { paintQuote } from '../paintQuote';
import { strip } from '../../anchor/plainText';
import { paintImages } from '../paintImage';

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
/**
 * Paint the reading views that are already on screen.
 *
 * Post-processors only run when Obsidian renders a block, and switching into
 * reading mode can reuse a render made before a mark existed — leaving the mark
 * invisible until something forces a rebuild. Both painters are idempotent, so
 * running them over what's already drawn is cheap and safe.
 */
export function repaintReadingViews(app: App, provider: Provider): void {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || !view.file) continue;
    const container = view.contentEl.querySelector('.markdown-preview-view');
    if (!(container instanceof HTMLElement)) continue;

    const annotations = provider(view.file.path);
    if (annotations.length === 0) continue;
    paintImages(container, annotations);
    for (const a of annotations) {
      if (a.anchor.kind !== 'markdown') continue;
      paintQuote(container, a, strip(a.anchor.quote));
    }
  }
}

export function readingModeHighlighter(provider: Provider) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const annotations = provider(ctx.sourcePath);
    if (annotations.length === 0) return;
    paintImages(el, annotations);
    for (const a of annotations) {
      if (a.anchor.kind !== 'markdown') continue;
      // The stored quote is source text; what's on screen has no markup in it.
      paintQuote(el, a, strip(a.anchor.quote));
    }
  };
}
