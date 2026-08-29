import { App, MarkdownView, TFile } from 'obsidian';
import { Annotation } from '../../model';
import { resolveMarkdown } from '../../anchor/resolveAnchor';
import { asEl, asMedia } from '../../dom';
import { endOfSegment, PLAY_ON } from '../transcript/segmentEnd';

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
    const media = asMedia(document.querySelector('.mt-view video, .mt-view audio'));
    if (media) {
      const seek = () => { media.currentTime = at; };
      if (media.readyState > 0) seek();
      else media.addEventListener('loadedmetadata', seek, { once: true });
      void playUntilEndOfLine(media, file.path, at);
      void media.play();

      const painted = asEl(document.querySelector(`.at-hl[data-at-id="${annotation.id}"]`));
      if (painted) {
        painted.scrollIntoView({ behavior: 'smooth', block: 'center' });
        flash(painted);
      }
      return;
    }
    await new Promise(r => window.setTimeout(r, 50));
  }
}

/**
 * Stop at the end of the line that was marked.
 *
 * Clicking a mark asks to hear *that*, not to start a session — so playback
 * stops where the segment does instead of running on into the rest of the
 * recording. Anything the listener does afterwards is theirs: pressing play
 * again, or seeking, clears the stop rather than fighting it.
 *
 * The segment's end is not stored — an anchor keeps only its start, being the
 * one thing that survives re-anchoring — so it is read back from the transcript
 * the other plugin rendered.
 */
async function playUntilEndOfLine(
  media: HTMLMediaElement,
  mediaPath: string,
  at: number,
): Promise<void> {
  cancelStop?.();

  // The transcript is another plugin's to render and may not be on screen yet;
  // without it there are no segment boundaries to stop at, so it is worth a
  // short wait rather than silently playing on.
  let starts: number[] = [];
  for (let i = 0; i < 20 && starts.length === 0; i++) {
    starts = segmentStarts(mediaPath);
    if (starts.length === 0) await new Promise(r => window.setTimeout(r, 50));
  }

  const until = endOfSegment(starts, at, media.duration);
  if (until === PLAY_ON) return;

  const check = () => {
    if (media.currentTime < until) return;
    media.pause();
    stop();
  };
  // Seeking or hitting play again means the listener has taken over.
  const release = () => { if (media.currentTime < at || media.currentTime > until) stop(); };
  const stop = () => {
    media.removeEventListener('timeupdate', check);
    media.removeEventListener('seeked', release);
    cancelStop = null;
  };

  media.addEventListener('timeupdate', check);
  media.addEventListener('seeked', release);
  cancelStop = stop;
}

/** Cancels the stop set by the last reveal, so two clicks don't both fire. */
let cancelStop: (() => void) | null = null;

/**
 * Every segment start in the transcript this mark belongs to.
 *
 * Marks are filed under the track, so that is what usually matches; a player
 * showing a transcript it made itself is named by its recording instead.
 */
function segmentStarts(owner: string): number[] {
  const panels = Array.from(document.querySelectorAll('.mt-transcript')).map(asEl);
  const panel =
    panels.find(p => p?.dataset.mtTrack === owner) ??
    panels.find(p => p?.dataset.mtMedia === owner) ??
    panels[0];
  if (!panel) return [];
  return Array.from(panel.querySelectorAll('.mt-segment'))
    .map(el => Number(asEl(el)?.dataset.mtStart))
    .filter(n => Number.isFinite(n));
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
    const el = asEl(view.contentEl.querySelector(`.at-hl[data-at-id="${id}"]`));
    if (el) {
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
