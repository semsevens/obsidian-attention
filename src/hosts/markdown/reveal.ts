import { App, FileView, MarkdownView, TFile } from 'obsidian';
import { childOf } from '../pdf/pdfPlus';
import type { ViewModeTarget } from '../../viewMode';
import { Annotation, pdfPage } from '../../model';
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
 * moved, which is the whole point of marking one; a PDF needs its page.
 */
export async function reveal(
  app: App,
  file: TFile,
  annotation: Annotation,
  openAs: ViewModeTarget | null = null,
): Promise<void> {
  if (annotation.anchor.kind === 'transcript') {
    await revealInTranscript(app, file, annotation);
    return;
  }
  if (annotation.anchor.kind === 'pdf') {
    await revealInPdf(app, file, annotation);
    return;
  }
  await revealInMarkdown(app, file, annotation, openAs);
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

  await showMark(document.body, annotation.id, '.mt-transcript', '.mt-transcript', () => {});
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
  openAs: ViewModeTarget | null,
): Promise<void> {
  const line = await lineOfMark(app, file, annotation);
  const view = await showNote(app, file, line, openAs);
  if (!view) return;

  if (view.getMode() === 'source') {
    if (annotation.anchor.kind !== 'markdown') return;
    const editor = view.editor;
    const at = resolveMarkdown(editor.getValue(), annotation.anchor);
    if (!at) return;
    const from = editor.offsetToPos(at.from);
    const to = editor.offsetToPos(at.to);
    editor.setSelection(from, to);
    // The selection is the feedback here, but a mark should announce itself the
    // same way wherever it is found — otherwise whether a jump "flashes"
    // depends on which mode the note happened to be in.
    await showMark(view.contentEl, annotation.id, '.cm-content', '.cm-scroller',
      () => editor.scrollIntoView({ from, to }, true));
    return;
  }

  // Reading mode renders lazily, so the mark's paragraph may not be in the
  // document at all until Obsidian has been asked to scroll to its line.
  await showMark(view.contentEl, annotation.id, '.markdown-preview-view', '.markdown-preview-view',
    () => { if (line !== null) view.setEphemeralState({ scroll: line }); });
}

/**
 * Put the note in front of the reader, without moving it if it already is.
 *
 * A note already open in a tab is switched to, not opened again: opening it
 * scrolls the view to the mark's line whether or not the mark was already in
 * sight, which is what made a second click on the same record jolt the page.
 *
 * A note that has to be opened is told the line, and the mode it is going to be
 * in, as part of the open. Scrolling
 * afterwards is too late: the view restores its own position while it sets
 * itself up, and overwrites ours. `scroll`, not `line`: both take the view
 * there, but `line` also flashes the whole block — next to a mark on three
 * words, that reads as the mark itself.
 */
async function showNote(
  app: App,
  file: TFile,
  line: number | null,
  openAs: ViewModeTarget | null,
): Promise<MarkdownView | null> {
  const open = app.workspace.getLeavesOfType('markdown')
    .find(leaf => leaf.view instanceof MarkdownView && leaf.view.file === file);
  if (open) {
    app.workspace.setActiveLeaf(open, { focus: true });
    return open.view instanceof MarkdownView ? open.view : null;
  }
  // In the mode it will be switched to anyway, if it will be: a note opened in
  // one mode and put in another a moment later replaces the view this has
  // just scrolled and flashed, and the mark ends up wherever the new view lands.
  const leaf = app.workspace.getLeaf(false);
  await leaf.openFile(file, {
    ...(openAs ? { state: { mode: openAs.mode, source: openAs.source } } : {}),
    ...(line === null ? {} : { eState: { scroll: line } }),
  });
  return leaf.view instanceof MarkdownView ? leaf.view : null;
}

/**
 * Turn to the page and show the mark there, the same way as in a note: the PDF
 * already open is switched to, and the page moves only if the mark is out of
 * sight. Pages are drawn as they come near, so an unseen mark is brought near
 * by turning to its page first.
 */
async function revealInPdf(app: App, file: TFile, annotation: Annotation): Promise<void> {
  if (annotation.anchor.kind !== 'pdf') return;
  const page = pdfPage(annotation.anchor);

  let leaf = app.workspace.getLeavesOfType('pdf').find(l => (l.view as FileView).file === file);
  if (leaf) {
    app.workspace.setActiveLeaf(leaf, { focus: true });
  } else {
    leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file, { eState: { subpath: `#page=${page}` } });
  }
  const view = leaf.view;
  // Up to five seconds, where a note gets one and a half: a page is drawn a
  // canvas at a time, and a long PDF at a large zoom in a busy vault can take
  // well over a second to put its text down. Giving up sooner left the page
  // turned and the mark somewhere below it.
  await showMark(view.containerEl, annotation.id, '.page', '.pdf-viewer-container', () => {
    childOf(view)?.pdfViewer.pdfViewer?.scrollPageIntoView({ pageNumber: page });
  }, 100);
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
 * Wait for the mark to be drawn in the layer the reader is looking at, bring it
 * into sight if it is not already, and flash it.
 *
 * Only a mark out of sight is scrolled to. One already on screen stays where
 * the reader put it — they asked where it is, and it is right there.
 *
 * A mark not drawn yet is usually just off screen: reading mode and the editor
 * both draw only what is near the view. `bringNear` asks the view to go to it,
 * once, if a short wait doesn't turn it up.
 *
 * The layer has to be named. A note open in reading mode still has the
 * editor's copy of it underneath, hidden, and in document order the hidden one
 * comes first — so "the mark with this id" flashed something invisible
 * whenever both layers had drawn it, and the flash seemed to come and go at
 * random. Asking which is visible is no good either: an unfocused window has
 * laid nothing out, and every answer is "no".
 */
async function showMark(
  root: HTMLElement,
  id: string,
  layer: string,
  scroller: string,
  bringNear: () => void,
  tries = 30,
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (i === 5) bringNear();
    // Anything carrying the id, not only text spans: a marked picture is an
    // `<img>` with the same attribute, and looking for `.at-hl` meant image
    // marks never flashed at all.
    const marks = Array.from(root.querySelectorAll(`${layer} [data-at-id="${id}"]`))
      .map(asEl)
      .filter((el): el is HTMLElement => el !== null);
    if (marks.length > 0) {
      const view = asEl(marks[0].closest(scroller));
      if (!view || !inSight(marks[0], view)) {
        marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // All of them: a mark across four paragraphs is four spans, and flashing
      // one of the four says less than it should.
      for (const el of marks) flash(el);
      return;
    }
    await new Promise(r => window.setTimeout(r, 50));
  }
}

/** Whether `el` is wholly within the visible part of `view`, and of the window. */
function inSight(el: HTMLElement, view: HTMLElement): boolean {
  const mark = el.getBoundingClientRect();
  const port = view.getBoundingClientRect();
  const win = el.win;
  return mark.height > 0 &&
    mark.top >= Math.max(port.top, 0) &&
    mark.bottom <= Math.min(port.bottom, win.innerHeight);
}

export function flash(el: HTMLElement): void {
  el.addClass('at-flash');
  window.setTimeout(() => el.removeClass('at-flash'), 1300);
}
