import { App, Editor, Menu, MarkdownView, MarkdownFileInfo, Notice, Plugin, TFile } from 'obsidian';
import { MarkdownAnchor } from '../../model';
import { describe, nthOccurrence, countOccurrences } from '../../anchor/textQuote';
import { AnnotationStore } from '../../store/annotationStore';
import { SelectionPopover } from '../../ui/SelectionPopover';
import { CommentBubble } from '../../ui/CommentBubble';
import { CommentModal } from '../../ui/CommentModal';
import { AttentionSettings } from '../../settings';

/**
 * Turns a selection in a markdown note into an annotation, via the right-click
 * menu.
 *
 * Capture works differently in the two modes, because only one of them has the
 * source in front of it:
 *
 *   Live Preview / source — the editor *is* the document, so `posToOffset`
 *     gives exact source offsets, synchronously.
 *   Reading mode — the DOM is rendered HTML with no source offsets at all.
 *     We take the selected text and find the matching occurrence in the file by
 *     counting how many identical strings precede it on screen; rendering drops
 *     markup but preserves the order of body text.
 */
export class MarkdownHost {
  private popover: SelectionPopover;
  private bubble = new CommentBubble();
  /** The element right-clicked, captured before any menu is built. */
  private lastTarget: HTMLElement | null = null;

  constructor(
    private app: App,
    private plugin: Plugin,
    private store: AnnotationStore,
    private settings: AttentionSettings,
  ) {
    this.popover = new SelectionPopover();
  }

  register(): void {
    // Capture phase, so this runs before Obsidian builds its own menu below.
    this.plugin.registerDomEvent(
      document,
      'contextmenu',
      e => { this.lastTarget = e.target instanceof HTMLElement ? e.target : null; },
      true,
    );

    // Editing modes: append to Obsidian's native menu rather than replacing it,
    // so cut/copy/paste and everything else stay where people expect.
    this.plugin.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor, info) => {
        this.onEditorMenu(menu, editor, info);
      }),
    );

    // Selection finished — left button only, so right-clicking (which is about
    // to raise a menu) doesn't also throw the swatches up.
    this.plugin.registerDomEvent(document, 'mouseup', e => {
      if (e.button !== 0 || !this.settings.popoverOnSelection) return;
      if (e.target instanceof HTMLElement && e.target.closest('.at-hl, .at-popover, .at-bubble')) return;
      // Defer so the selection is final by the time we read it.
      window.setTimeout(() => { void this.onSelectionMade(); }, 0);
    });

    // Left-click a highlight to read its comment. Guarded on an empty
    // selection so click-dragging across a highlight still just selects text.
    this.plugin.registerDomEvent(document, 'click', e => {
      const hit = e.target instanceof HTMLElement ? e.target.closest('.at-hl') : null;
      if (!(hit instanceof HTMLElement)) return;
      if ((window.getSelection()?.toString().trim().length ?? 0) > 0) return;
      const file = this.app.workspace.getActiveViewOfType(MarkdownView)?.file;
      if (file) void this.showBubble(file, hit);
    });

    // Reading mode fires no editor-menu, so it needs its own handler. Only
    // intercept when there is actually something to offer.
    this.plugin.registerDomEvent(document, 'contextmenu', e => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view?.file || view.getMode() !== 'preview') return;
      if (!this.hasSomethingToOffer(view)) return;
      e.preventDefault();
      void this.showReadingMenu(e, view);
    });
  }

  detach(): void {
    this.popover.hide();
    this.bubble.hide();
  }

  private async showBubble(file: TFile, el: HTMLElement): Promise<void> {
    const id = el.dataset.atId;
    if (!id) return;
    const data = await this.store.get(file.path);
    const annotation = data.annotations.find(a => a.id === id);
    if (!annotation) return;

    this.bubble.showFor(el.getBoundingClientRect(), annotation, {
      onEdit: () => { void this.editComment(file, id); },
      onMarkAgain: () => { void this.mark(file, annotation.anchor as MarkdownAnchor, null); },
      onRemove: () => { void this.store.remove(file.path, id); },
    });
  }

  private hasSomethingToOffer(view: MarkdownView): boolean {
    if (this.lastTarget?.closest('.at-hl')) return true;
    const selection = window.getSelection();
    return (
      (selection?.toString().trim().length ?? 0) > 0 &&
      view.contentEl.contains(selection?.anchorNode ?? null)
    );
  }

  /** Anchor whatever is selected, whichever mode the view is in. */
  private async capture(view: MarkdownView): Promise<MarkdownAnchor | null> {
    if (view.getMode() === 'source') return this.captureEditor(view.editor);
    return view.file ? this.captureRendered(view, view.file) : null;
  }

  private captureEditor(editor: Editor): MarkdownAnchor | null {
    const from = editor.posToOffset(editor.getCursor('from'));
    const to = editor.posToOffset(editor.getCursor('to'));
    if (from === to) return null;
    return { kind: 'markdown', ...describe(editor.getValue(), from, to) };
  }

  /** Selection finished: offer the swatches straight away, if asked to. */
  private async onSelectionMade(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const file = view?.file;
    if (!view || !file) return;

    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) return;
    if (!view.contentEl.contains(selection.anchorNode)) return;

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const anchor = await this.capture(view);
    if (!anchor) return;

    this.popover.showAt(rect, {
      onMark: () => { void this.mark(file, anchor, null); },
      onComment: () => this.promptComment(file, anchor, ''),
    });
  }

  // ── Editing modes ──────────────────────────────────────────────────────────

  private onEditorMenu(menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo): void {
    const file = info.file;
    if (!file) return;

    const existing = this.lastTarget?.closest('.at-hl');
    if (existing instanceof HTMLElement) {
      this.addExistingItems(menu, file, existing);
      return;
    }

    const anchor = this.captureEditor(editor);
    if (anchor) this.addCreateItems(menu, file, anchor);
  }

  // ── Reading mode ───────────────────────────────────────────────────────────

  private async showReadingMenu(e: MouseEvent, view: MarkdownView): Promise<void> {
    const file = view.file;
    if (!file) return;
    const menu = new Menu();

    const existing = this.lastTarget?.closest('.at-hl');
    if (existing instanceof HTMLElement) {
      this.addExistingItems(menu, file, existing);
    } else {
      const anchor = await this.captureRendered(view, file);
      if (!anchor) return;
      this.addCreateItems(menu, file, anchor);
    }
    menu.showAtMouseEvent(e);
  }

  /** Locate a reading-mode selection in the source by ordinal. */
  private async captureRendered(view: MarkdownView, file: TFile): Promise<MarkdownAnchor | null> {
    const selection = window.getSelection();
    const selected = selection?.toString() ?? '';
    if (!selection || selected.trim().length === 0) return null;

    const source = await this.app.vault.cachedRead(file);
    const at = nthOccurrence(source, selected, this.renderedOrdinal(view, selection, selected));
    if (at < 0) {
      // The selection spans rendered markup (e.g. from plain text into bold),
      // so the exact string never appears in the source.
      new Notice('Attention: cannot anchor a selection that crosses formatting.');
      return null;
    }
    return { kind: 'markdown', ...describe(source, at, at + selected.length) };
  }

  /** How many identical strings precede this selection on screen. */
  private renderedOrdinal(view: MarkdownView, selection: Selection, selected: string): number {
    const sel = selection.getRangeAt(0);
    const before = sel.cloneRange();
    before.selectNodeContents(view.contentEl);
    before.setEnd(sel.startContainer, sel.startOffset);
    return countOccurrences(before.toString(), selected);
  }

  // ── Menu items ─────────────────────────────────────────────────────────────

  private addCreateItems(menu: Menu, file: TFile, anchor: MarkdownAnchor): void {
    menu.addItem(item =>
      item
        .setTitle('Mark')
        .setIcon('highlighter')
        .onClick(() => { void this.mark(file, anchor, null); }),
    );

    menu.addItem(item =>
      item
        .setTitle('Comment…')
        .setIcon('message-square')
        .onClick(() => this.promptComment(file, anchor, '')),
    );
  }

  private addExistingItems(menu: Menu, file: TFile, el: HTMLElement): void {
    const id = el.dataset.atId;
    if (!id) return;

    menu.addItem(item =>
      item
        .setTitle('Edit comment…')
        .setIcon('message-square')
        .onClick(() => { void this.editComment(file, id); }),
    );

    menu.addItem(item =>
      item
        .setTitle('Remove highlight')
        .setIcon('trash')
        .setWarning(true)
        .onClick(() => { void this.store.remove(file.path, id); }),
    );
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private promptComment(file: TFile, anchor: MarkdownAnchor, initial: string): void {
    new CommentModal(this.app, anchor.quote, initial, body => {
      void this.mark(file, anchor, body || null);
    }).open();
  }

  private async editComment(file: TFile, id: string): Promise<void> {
    const data = await this.store.get(file.path);
    const annotation = data.annotations.find(a => a.id === id);
    if (!annotation) return;
    new CommentModal(this.app, annotation.anchor.quote, annotation.body ?? '', body => {
      void this.store.update(file.path, id, { body: body || null });
    }).open();
  }

  private async mark(file: TFile, anchor: MarkdownAnchor, body: string | null): Promise<void> {
    const { repeat, annotation } = await this.store.mark(file.path, anchor, body);
    if (repeat) new Notice(`Marked ${annotation.hits.length}× now`);
  }
}

/** A zero-size rect at the pointer, so the popover can position itself. */
function rectOf(e: MouseEvent | KeyboardEvent): DOMRect {
  const x = e instanceof MouseEvent ? e.clientX : window.innerWidth / 2;
  const y = e instanceof MouseEvent ? e.clientY : window.innerHeight / 2;
  return new DOMRect(x, y, 0, 0);
}
