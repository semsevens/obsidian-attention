import { App, Menu, Notice, Plugin } from 'obsidian';
import { Annotation, TranscriptAnchor, newId } from '../../model';
import { Seg, describeTranscript, resolveTranscript } from '../../anchor/transcriptAnchor';
import { AnnotationStore } from '../../store/annotationStore';
import { SelectionPopover } from '../../ui/SelectionPopover';
import { CommentBubble } from '../../ui/CommentBubble';
import { CommentModal } from '../../ui/CommentModal';
import { AttentionSettings } from '../../settings';
import { paintQuote } from '../paintQuote';

/** Announced by obsidian-media-transcript whenever it rebuilds its transcript. */
const TRANSCRIPT_RENDERED = 'mt:transcript-rendered';

/**
 * Annotating the Media Transcript plugin's transcript panel.
 *
 * That plugin announces every rebuild of its DOM and stamps each line with its
 * index and start time; we listen and repaint. The dependency runs one way —
 * it doesn't know this exists, and if it isn't installed the event simply never
 * fires and this host stays dormant.
 *
 * Annotations belong to the *media* file, not the subtitle track, so
 * re-transcribing with a different engine doesn't orphan them.
 */
export class TranscriptHost {
  private popover: SelectionPopover;
  private bubble = new CommentBubble();

  constructor(
    private app: App,
    private plugin: Plugin,
    private store: AnnotationStore,
    private settings: AttentionSettings,
  ) {
    this.popover = new SelectionPopover(settings.colors);
  }

  register(): void {
    // registerDomEvent only types known event names, so this one is wired by
    // hand and handed to the plugin for teardown.
    const onRendered = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mediaPath?: string } | null;
      if (!detail?.mediaPath) return;
      const panel = e.target instanceof HTMLElement
        ? e.target.querySelector('.mt-transcript') ?? e.target
        : null;
      if (panel instanceof HTMLElement) void this.repaint(panel);
    };
    document.addEventListener(TRANSCRIPT_RENDERED, onRendered);
    this.plugin.register(() => document.removeEventListener(TRANSCRIPT_RENDERED, onRendered));

    // Repaint when our own annotations change, not just when they rerender.
    this.plugin.register(this.store.onChange(path => this.repaintOpenPanels(path)));

    this.plugin.registerDomEvent(document, 'mouseup', e => {
      if (e.button !== 0 || !this.settings.popoverOnSelection) return;
      if (!this.inTranscript(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('.at-hl, .at-popover, .at-bubble')) return;
      window.setTimeout(() => { void this.onSelectionMade(); }, 0);
    });

    this.plugin.registerDomEvent(document, 'click', e => {
      const hit = e.target instanceof HTMLElement ? e.target.closest('.at-hl') : null;
      if (!(hit instanceof HTMLElement) || !this.inTranscript(hit)) return;
      if ((window.getSelection()?.toString().trim().length ?? 0) > 0) return;
      void this.showBubble(hit);
    });

    // Right-click, in the capture phase: Media Transcript has its own handler
    // on the segment, and letting both run would open two menus on top of each
    // other. When there is something of ours to offer we claim the event and
    // stop it; otherwise we leave it entirely alone.
    const onContextMenu = (e: MouseEvent) => {
      if (!this.inTranscript(e.target)) return;
      const hit = e.target instanceof HTMLElement ? e.target.closest('.at-hl') : null;
      const selected = window.getSelection()?.toString().trim() ?? '';
      if (!hit && selected.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      void this.showMenu(e, hit instanceof HTMLElement ? hit : null);
    };
    document.addEventListener('contextmenu', onContextMenu, true);
    this.plugin.register(() => document.removeEventListener('contextmenu', onContextMenu, true));
  }

  detach(): void {
    this.popover.hide();
    this.bubble.hide();
  }

  private inTranscript(target: EventTarget | null): boolean {
    return this.panelOf(target) != null;
  }

  /**
   * The transcript panel containing `target`, and what it is showing.
   *
   * Read from the DOM rather than remembered from the announcement: a plugin
   * enabled while a transcript is already open never sees that event, and state
   * kept only in a handler is state you can miss.
   */
  private panelOf(target: EventTarget | null): { panel: HTMLElement; mediaPath: string; trackPath: string } | null {
    if (!(target instanceof HTMLElement)) return null;
    const panel = target.closest('.mt-transcript');
    if (!(panel instanceof HTMLElement)) return null;
    const mediaPath = panel.dataset.mtMedia ?? '';
    if (!mediaPath) return null;
    return { panel, mediaPath, trackPath: panel.dataset.mtTrack ?? '' };
  }

  // ── Painting ───────────────────────────────────────────────────────────────

  /** Read the transcript out of the DOM the other plugin rendered. */
  private readSegments(panel: HTMLElement): { el: HTMLElement; txt: HTMLElement; seg: Seg }[] {
    const out: { el: HTMLElement; txt: HTMLElement; seg: Seg }[] = [];
    for (const el of Array.from(panel.querySelectorAll('.mt-segment'))) {
      if (!(el instanceof HTMLElement)) continue;
      const txt = el.querySelector('.mt-txt');
      const seg = Number(el.dataset.mtSeg);
      const start = Number(el.dataset.mtStart);
      if (!(txt instanceof HTMLElement) || !Number.isFinite(seg)) continue;
      out.push({ el, txt, seg: { seg, start, text: txt.innerText } });
    }
    return out;
  }

  private async repaint(panel: HTMLElement): Promise<void> {
    const mediaPath = panel.dataset.mtMedia;
    if (!mediaPath) return;
    const lines = this.readSegments(panel);
    if (lines.length === 0) return;

    const data = await this.store.get(mediaPath);
    const segs = lines.map(l => l.seg);
    const track = panel.dataset.mtTrack ?? null;

    for (const a of data.annotations) {
      if (a.anchor.kind !== 'transcript') continue;
      const hit = resolveTranscript(segs, a.anchor, track);
      // Orphans are deliberately not drawn — a guess in the wrong place is
      // worse than a mark that shows up in the panel as lost.
      if (!hit) continue;
      const line = lines.find(l => l.seg.seg === hit.seg);
      if (line) paintQuote(line.txt, a, line.seg.text.slice(hit.charStart, hit.charEnd));
    }
  }

  private repaintOpenPanels(mediaPath: string): void {
    for (const panel of Array.from(document.querySelectorAll('.mt-transcript'))) {
      if (panel instanceof HTMLElement && panel.dataset.mtMedia === mediaPath) {
        void this.repaint(panel);
      }
    }
  }

  // ── Capture ────────────────────────────────────────────────────────────────

  /** Turn the current selection into an anchor, if it sits inside one line. */
  private capture(): { anchor: TranscriptAnchor; mediaPath: string } | null {
    const selection = window.getSelection();
    const selected = selection?.toString() ?? '';
    if (!selection || selected.trim().length === 0) return null;

    const node = selection.anchorNode;
    const el = (node instanceof HTMLElement ? node : node?.parentElement) ?? null;
    const where = this.panelOf(el);
    if (!where) return null;
    const segEl = el?.closest('.mt-segment');
    const txt = segEl?.querySelector('.mt-txt');
    if (!(segEl instanceof HTMLElement) || !(txt instanceof HTMLElement)) return null;

    const text = txt.innerText;
    const at = text.indexOf(selected);
    if (at < 0) {
      // The selection runs across two lines; there is no single segment to
      // anchor it to, and splitting it silently would be worse than refusing.
      new Notice('Attention: select within a single transcript line.');
      return null;
    }

    const seg: Seg = {
      seg: Number(segEl.dataset.mtSeg),
      start: Number(segEl.dataset.mtStart),
      text,
    };
    return {
      anchor: describeTranscript(seg, at, at + selected.length, where.trackPath),
      mediaPath: where.mediaPath,
    };
  }

  private async onSelectionMade(): Promise<void> {
    const captured = this.capture();
    if (!captured) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    this.popover.showAt(selection.getRangeAt(0).getBoundingClientRect(), {
      onHighlight: color => { void this.create(captured.mediaPath, captured.anchor, color, null); },
      onComment: () => {
        new CommentModal(this.app, captured.anchor.quote, '', body => {
          void this.create(captured.mediaPath, captured.anchor, this.settings.defaultColor, body || null);
        }).open();
      },
    });
  }

  private async showMenu(e: MouseEvent, hit: HTMLElement | null): Promise<void> {
    const menu = new Menu();

    if (hit) {
      const mediaPath = this.panelOf(hit)?.mediaPath;
      const id = hit.dataset.atId;
      if (!mediaPath || !id) return;
      menu.addItem(i => i.setTitle('Edit comment…').setIcon('message-square')
        .onClick(() => { void this.editComment(mediaPath, id); }));
      menu.addItem(i => i.setTitle('Change colour…').setIcon('palette').onClick(() => {
        this.popover.showAt(hit.getBoundingClientRect(), {
          onHighlight: color => { void this.store.update(mediaPath, id, { color }); },
          onComment: () => { void this.editComment(mediaPath, id); },
        });
      }));
      menu.addItem(i => i.setTitle('Remove highlight').setIcon('trash').setWarning(true)
        .onClick(() => { void this.store.remove(mediaPath, id); }));
    } else {
      const captured = this.capture();
      if (!captured) return;
      menu.addItem(i => i.setTitle('Highlight').setIcon('highlighter')
        .onClick(() => { void this.create(captured.mediaPath, captured.anchor, this.settings.defaultColor, null); }));
      menu.addItem(i => i.setTitle('Comment…').setIcon('message-square').onClick(() => {
        new CommentModal(this.app, captured.anchor.quote, '', body => {
          void this.create(captured.mediaPath, captured.anchor, this.settings.defaultColor, body || null);
        }).open();
      }));
    }
    menu.showAtMouseEvent(e);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async showBubble(el: HTMLElement): Promise<void> {
    const mediaPath = this.panelOf(el)?.mediaPath;
    const id = el.dataset.atId;
    if (!mediaPath || !id) return;
    const data = await this.store.get(mediaPath);
    const annotation = data.annotations.find(a => a.id === id);
    if (!annotation) return;

    this.bubble.showFor(el.getBoundingClientRect(), annotation.body, {
      onEdit: () => { void this.editComment(mediaPath, id); },
      onRecolour: () => {
        this.popover.showAt(el.getBoundingClientRect(), {
          onHighlight: color => { void this.store.update(mediaPath, id, { color }); },
          onComment: () => { void this.editComment(mediaPath, id); },
        });
      },
      onRemove: () => { void this.store.remove(mediaPath, id); },
    });
  }

  private async editComment(mediaPath: string, id: string): Promise<void> {
    const data = await this.store.get(mediaPath);
    const annotation = data.annotations.find(a => a.id === id);
    if (!annotation) return;
    new CommentModal(this.app, annotation.anchor.quote, annotation.body ?? '', body => {
      void this.store.update(mediaPath, id, { body: body || null });
    }).open();
  }

  private async create(
    mediaPath: string,
    anchor: TranscriptAnchor,
    color: string,
    body: string | null,
  ): Promise<void> {
    const annotation: Annotation = {
      id: newId(),
      anchor,
      color,
      body,
      created: new Date().toISOString(),
      reviewed: [],
    };
    await this.store.add(mediaPath, annotation);
  }
}
