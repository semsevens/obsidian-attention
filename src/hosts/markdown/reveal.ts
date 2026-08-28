import { App, MarkdownView, TFile } from 'obsidian';
import { Annotation } from '../../model';
import { resolveMarkdown } from '../../anchor/resolveAnchor';

/**
 * Go to an annotation: open its file and put the passage in front of you.
 *
 * Each host needs different treatment. A markdown editor can be told to select
 * a character range; reading mode has no offsets and must be found by the
 * `data-at-id` stamped on the painted span; a transcript needs the *player*
 * moved, which is the whole point of marking one.
 */
export async function reveal(app: App, file: TFile, annotation: Annotation): Promise<void> {
  if (annotation.anchor.kind === 'transcript') {
    await revealInTranscript(app, file, annotation);
    return;
  }
  await revealInMarkdown(app, file, annotation);
}

/**
 * Open the media and seek to the marked moment.
 *
 * The transcript is rendered by another plugin and arrives when it arrives, so
 * the player is polled for rather than assumed; if that plugin isn't handling
 * this file, nothing is found and we simply leave the file open.
 */
async function revealInTranscript(app: App, file: TFile, annotation: Annotation): Promise<void> {
  if (annotation.anchor.kind !== 'transcript') return;
  const at = annotation.anchor.start;
  await app.workspace.getLeaf(false).openFile(file);

  for (let i = 0; i < 40; i++) {
    const media = document.querySelector('.mt-view video, .mt-view audio');
    if (media instanceof HTMLMediaElement) {
      const seek = () => { media.currentTime = at; };
      if (media.readyState > 0) seek();
      else media.addEventListener('loadedmetadata', seek, { once: true });
      void media.play();

      const painted = document.querySelector(`.at-hl[data-at-id="${annotation.id}"]`);
      if (painted instanceof HTMLElement) {
        painted.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flash(painted);
      }
      return;
    }
    await new Promise(r => window.setTimeout(r, 50));
  }
}

async function revealInMarkdown(
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
    const at = resolveMarkdown(editor.getValue(), annotation.anchor);
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
