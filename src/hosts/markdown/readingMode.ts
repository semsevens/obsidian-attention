import { App, MarkdownPostProcessorContext, MarkdownView } from 'obsidian';
import { Annotation } from '../../model';
import { Provider } from './decorations';
import { paintQuote } from '../paintQuote';
import { strip } from '../../anchor/plainText';
import { paintImages } from '../paintImage';
import { transcludedNotes } from '../../store/transclusions';
import { asEl } from '../../dom';
import { resolveMarkdown } from '../../anchor/resolveAnchor';
import { Range, intersect, lineStarts, rangeOfLines } from '../../anchor/lines';

/**
 * Highlights for reading mode.
 *
 * Reading mode renders markdown to HTML, and a mark is not in the file, so
 * there is nothing for Obsidian to render — the words have to be wrapped after
 * the fact. What matters is how the right words are found.
 *
 * Not by looking for them. Searching the rendered text for a quote and taking
 * the nth match makes the answer depend on everything else Obsidian happens to
 * draw: the editor layer behind the reading layer, the properties table, the
 * frontmatter block, whichever paragraphs have been rendered so far. Each of
 * those has, at some point, made a mark land in the wrong place or nowhere.
 *
 * Instead Obsidian is asked directly. A post-processor is told which lines of
 * the file the block it is handed came from, which is the one fact that ties
 * the two together, and it does not change with scrolling or settings. A mark
 * knows its own range in the source; the block that holds it paints the part
 * that falls inside it. A mark spanning four paragraphs is simply four blocks
 * each painting their own slice, with nothing to coordinate.
 *
 * The line range is remembered on the element, because only the post-processor
 * is told it — everything that repaints later reads it back from there.
 */

const LINES = 'atLines';

export function readingModeHighlighter(provider: Provider) {
  return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
    const info = ctx.getSectionInfo(el);
    if (info) el.dataset[LINES] = `${info.lineStart},${info.lineEnd}`;

    const annotations = provider(ctx.sourcePath);
    if (annotations.length === 0) return;
    paintImages(el, annotations);
    if (info) paintBlock(el, info.text, annotations);
  };
}

/**
 * Paint the blocks of every reading view on screen.
 *
 * For repaints that happen outside rendering — a mark added, the layout
 * settling, a section scrolled back into view — where there is no context to
 * ask, only what the post-processor left behind.
 */
export function repaintReadingViews(app: App, provider: Provider): void {
  for (const leaf of app.workspace.getLeavesOfType('markdown')) {
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || !view.file) continue;
    const container = asEl(view.contentEl.querySelector('.markdown-preview-view'));
    if (!container) continue;

    const source = view.data;
    const annotations = provider(view.file.path);
    if (annotations.length > 0) {
      paintImages(container, annotations);
      // Resolve once for the whole view, not once per block: resolving searches
      // the note, and a long note has many blocks. Fifty blocks and ten marks
      // was five hundred searches for one repaint, and repaints happen on
      // every scroll.
      const placed = place(source, annotations);
      const starts = lineStarts(source);
      for (const block of blocksOf(container)) paintPlaced(block, source, starts, placed);
    }

    // Marks belonging to notes transcluded into this one, painted inside the
    // transclusion they came from. The host's line numbers say nothing about
    // the embedded file, so those are still matched by their words — within
    // the embed, which is a small enough window for that to be safe.
    for (const note of transcludedNotes(app, view.file)) {
      const theirs = provider(note.path);
      if (theirs.length === 0) continue;
      for (const raw of Array.from(container.querySelectorAll('.internal-embed, .markdown-embed'))) {
        const box = asEl(raw);
        if (!box) continue;
        paintImages(box, theirs);
        for (const a of theirs) {
          if (a.anchor.kind !== 'markdown') continue;
          paintQuote(box, a, strip(a.anchor.quote));
        }
      }
    }
  }
}

/** Every rendered block that knows where it came from. */
function blocksOf(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll(`[data-${dashed(LINES)}]`))
    .map(asEl)
    .filter((el): el is HTMLElement => el !== null);
}

interface Placed {
  annotation: Annotation;
  at: Range;
}

/** Where each mark currently sits in the source, dropping the ones that don't. */
function place(source: string, annotations: readonly Annotation[]): Placed[] {
  const placed: Placed[] = [];
  for (const a of annotations) {
    if (a.anchor.kind !== 'markdown') continue;
    const at = resolveMarkdown(source, a.anchor);
    if (at) placed.push({ annotation: a, at });
  }
  return placed;
}

/**
 * Paint the part of each mark that falls inside this block.
 *
 * The text handed to the painter is cut from the source and stripped of
 * markup, so what it looks for is what the block actually shows.
 */
function paintPlaced(
  el: HTMLElement,
  source: string,
  starts: readonly number[],
  placed: readonly Placed[],
): void {
  const lines = el.dataset[LINES]?.split(',').map(Number);
  if (!lines || lines.length !== 2 || lines.some(n => !Number.isFinite(n))) return;

  const block = rangeOfLines(source, starts, lines[0], lines[1]);
  for (const { annotation, at } of placed) {
    const piece = intersect(at, block);
    if (!piece) continue;
    paintQuote(el, annotation, strip(source.slice(piece.from, piece.to)));
  }
}

/** One block, from the post-processor, where there is nothing yet to reuse. */
function paintBlock(el: HTMLElement, source: string, annotations: readonly Annotation[]): void {
  paintPlaced(el, source, lineStarts(source), place(source, annotations));
}

/** `atLines` → `at-lines`, for the attribute selector. */
function dashed(name: string): string {
  return name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
}
