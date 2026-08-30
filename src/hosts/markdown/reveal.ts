import { App, MarkdownView, TFile } from 'obsidian';
import { Annotation } from '../../model';
import { resolveMarkdown } from '../../anchor/resolveAnchor';
import { asEl, asMedia } from '../../dom';
import { endOfSegment, PLAY_ON } from '../transcript/segmentEnd';
import { lineOf, lineStarts } from '../../anchor/lines';

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
  const anchor = annotation.anchor;
  if (anchor.kind !== 'transcript') return;
  await app.workspace.getLeaf(false).openFile(file);

  const media = await waitFor(() => asMedia(document.querySelector('.mt-view video, .mt-view audio')));
  if (!media) return;

  // The transcript is another plugin's to render and arrives when it arrives;
  // without it there is no end to stop at, only a start to seek to.
  const starts = (await waitFor(() => nonEmpty(segmentStarts(file.path)))) ?? [];
  const at = anchor.start;

  const seek = () => { media.currentTime = at; };
  if (media.readyState > 0) seek();
  else media.addEventListener('loadedmetadata', seek, { once: true });
  playUntilEndOfSegment(media, starts, at, media.duration);
  void media.play();

  await flashWhenPainted(document.body, annotation.id);
}

function nonEmpty<T>(items: T[]): T[] | null {
  return items.length > 0 ? items : null;
}

/** Poll for something another plugin is still putting on screen. */
async function waitFor<T>(look: () => T | null, tries = 40): Promise<T | null> {
  for (let i = 0; i < tries; i++) {
    const found = look();
    if (found) return found;
    await new Promise(r => window.setTimeout(r, 50));
  }
  return null;
}

/**
 * Stop at the end of the segment that was marked.
 *
 * Clicking a mark asks to hear that passage, not to start a session — so
 * playback stops where the segment does instead of running on into the rest of
 * the recording. Anything the listener does afterwards is theirs: pressing
 * play again, or seeking, clears the stop rather than fighting it.
 *
 * The segment is the unit because it is the only one the file actually has:
 * these transcripts time a whole paragraph and nothing inside it, so anything
 * finer would be guessed rather than known.
 */
function playUntilEndOfSegment(
  media: HTMLMediaElement,
  starts: readonly number[],
  start: number,
  duration: number,
): void {
  cancelStop?.();

  const until = endOfSegment(starts, start, duration);
  if (until === PLAY_ON) return;

  const check = () => {
    if (media.currentTime < until) return;
    media.pause();
    stop();
  };
  // Seeking or hitting play again means the listener has taken over.
  const release = () => { if (media.currentTime < start || media.currentTime > until) stop(); };
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
    .map(raw => Number(asEl(raw)?.dataset.mtStart))
    .filter(n => Number.isFinite(n));
}

async function revealInMarkdown(
  app: App,
  file: TFile,
  annotation: Annotation,
): Promise<void> {
  // Work out where to land *before* opening, and let Obsidian do the scrolling
  // as part of the open. Scrolling afterwards is too late: the view restores
  // its own position while it sets itself up, and overwrites ours. That is why
  // jumping to a mark took two clicks — the first opened the note, and only
  // the second, with the view already settled, could move it.
  const line = await lineOfMark(app, file, annotation);

  const leaf = app.workspace.getLeaf(false);
  // `scroll`, not `line`: both take the view to that line, but `line` also
  // flashes the whole block yellow — Obsidian's way of saying "here is what you
  // followed a link to". Next to a mark on three words, a highlight over the
  // entire paragraph reads as the mark itself, and the mark already flashes on
  // its own once it is painted.
  await leaf.openFile(file, line === null ? undefined : { eState: { scroll: line } });

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
    // The selection is the feedback here, but a mark should announce itself the
    // same way wherever it is found — otherwise whether a jump "flashes"
    // depends on which mode the note happened to be in.
    await flashWhenPainted(view.contentEl, annotation.id);
    return;
  }

  // Reading mode renders lazily, so the mark's paragraph may not be in the
  // document at all — there is no painted span to wait for until the scroll
  // above has made Obsidian render that part of the note.
  await flashWhenPainted(view.contentEl, annotation.id);
}

/** The line the mark sits on now, or null if it cannot be placed. */
async function lineOfMark(app: App, file: TFile, annotation: Annotation): Promise<number | null> {
  if (annotation.anchor.kind !== 'markdown') return null;
  try {
    const source = await app.vault.cachedRead(file);
    const at = resolveMarkdown(source, annotation.anchor);
    return at ? lineOf(lineStarts(source), at.from) : null;
  } catch {
    return null;
  }
}

/**
 * Wait for the highlight to appear, then scroll to it.
 *
 * Reading mode re-renders on its own schedule; rather than guess at a delay,
 * poll briefly and give up quietly if the annotation turns out to be orphaned
 * (in which case nothing was painted and there is nothing to scroll to).
 */
async function flashWhenPainted(root: HTMLElement, id: string, tries = 20): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const el = asEl(root.querySelector(`.at-hl[data-at-id="${id}"]`));
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
