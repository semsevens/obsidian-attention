import { App, MarkdownView, TFile } from 'obsidian';
import { Annotation } from '../../model';
import { resolve } from '../../anchor/textQuote';

/**
 * Jump to an annotation inside an open note and flash it.
 *
 * The two modes need different treatment: the editor can be told to select a
 * character range, while reading mode has no offsets and must be found by the
 * `data-at-id` the highlighter stamped on the span.
 */
export async function revealInMarkdown(
  app: App,
  file: TFile,
  annotation: Annotation,
): Promise<void> {
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file);

  const view = leaf.view;
  if (!(view instanceof MarkdownView)) return;

  if (view.getMode() === 'source') {
    if (annotation.anchor.kind !== 'markdown') return;
    const editor = view.editor;
    const at = resolve(editor.getValue(), annotation.anchor);
    if (!at) return;
    const from = editor.offsetToPos(at.from);
    const to = editor.offsetToPos(at.to);
    editor.setSelection(from, to);
    editor.scrollIntoView({ from, to }, true);
    return;
  }

  // Reading mode renders asynchronously, so the span may not exist yet.
  await flashWhenPainted(view, annotation.id);
}

/**
 * Wait for the highlight to appear, then scroll to it.
 *
 * Reading mode re-renders on its own schedule; rather than guess at a delay,
 * poll briefly and give up quietly if the annotation turns out to be orphaned
 * (in which case nothing was painted and there is nothing to scroll to).
 */
async function flashWhenPainted(view: MarkdownView, id: string, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const el = view.contentEl.querySelector(`.at-hl[data-at-id="${id}"]`);
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      flash(el);
      return;
    }
    await new Promise(r => window.setTimeout(r, 50));
  }
}

export function flash(el: HTMLElement): void {
  el.addClass('at-flash');
  window.setTimeout(() => el.removeClass('at-flash'), 1300);
}
