import { App, Editor, Menu, MarkdownView, MarkdownFileInfo, Notice, Plugin, TFile } from 'obsidian';
import { MarkdownAnchor } from '../../model';
import { describe, nthOccurrence, countOccurrences } from '../../anchor/textQuote';
import { project, toSource } from '../../anchor/plainText';
import {
  findImageEmbeds, imageMatches, embedBySurroundings, srcHint, ImageEmbed,
} from '../../anchor/imageAnchor';
import { AnnotationStore } from '../../store/annotationStore';
import { SelectionPopover } from '../../ui/SelectionPopover';
import { CommentBubble } from '../../ui/CommentBubble';
import { CommentModal } from '../../ui/CommentModal';
import { AttentionSettings } from '../../settings';
import { asEl, asImg, elementOf } from '../../dom';
import { belongsTo, ownerOf } from './ownerView';

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
  private bubble: CommentBubble;
  /** The element right-clicked, captured before any menu is built. */
  private lastTarget: HTMLElement | null = null;
  /** Set while re-issuing a click we intercepted, so we don't catch our own. */
  private passingThrough = false;

  constructor(
    private app: App,
    private plugin: Plugin,
    private store: AnnotationStore,
    private settings: AttentionSettings,
  ) {
    this.popover = new SelectionPopover();
    this.bubble = new CommentBubble(settings.timeFormat);
  }

  register(): void {
    // Capture phase, so this runs before Obsidian builds its own menu below.
    this.plugin.registerDomEvent(
      document,
      'contextmenu',
      e => { this.lastTarget = asEl(e.target); },
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
      if (asEl(e.target)?.closest('.at-hl, .at-popover, .at-bubble')) return;
      // Defer so the selection is final by the time we read it.
      window.setTimeout(() => { void this.onSelectionMade(); }, 0);
    });

    // Clicking a picture: offer marking as well as the zoom that would have
    // happened. Capture phase, because Obsidian's own handler is what opens
    // the image and it has to be headed off before it runs.
    this.plugin.registerDomEvent(document, 'click', e => {
      if (this.passingThrough) return;
      const img = asImg(asEl(e.target)?.closest('img'));
      if (!img) return;
      const view = this.viewContaining(img);
      if (!view?.file) return;
      if ((window.getSelection()?.toString().trim().length ?? 0) > 0) return;

      e.preventDefault();
      e.stopPropagation();
      void this.showImagePopover(this.embeddedFileAt(img, view.file) ?? view.file, img);
    }, true);

    // Left-click a highlight to read its comment. Guarded on an empty
    // selection so click-dragging across a highlight still just selects text.
    this.plugin.registerDomEvent(document, 'click', e => {
      // Text only. Clicking a picture is Obsidian's own zoom gesture, and
      // stealing it to show a bubble makes marked images behave unlike every
      // other image in the vault. Their comment is on hover, and the full menu
      // is on right-click.
      const hit = asEl(asEl(e.target)?.closest('.at-hl'));
      if (!hit) return;
      if ((window.getSelection()?.toString().trim().length ?? 0) > 0) return;
      // A mark inside a transclusion belongs to the note it came from, so
      // that is where to look it up — the host has never heard of it.
      const view = this.viewContaining(hit);
      const file = view && (this.embeddedFileAt(hit, view.file!) ?? view.file);
      if (file) void this.showBubble(file, hit);
    });

    // Reading mode fires no editor-menu, so it needs its own handler. Only
    // intercept when there is actually something to offer.
    this.plugin.registerDomEvent(document, 'contextmenu', e => {
      // The note that was clicked in — not whichever one is active. A
      // right-click in a background split does not activate it first, so
      // taking the active view's file files the mark under a note that does
      // not contain what was clicked, where it can never resolve.
      const view =
        this.viewContaining(this.lastTarget) ??
        this.app.workspace.getActiveViewOfType(MarkdownView);
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

  /** The choice a click on a picture now offers, zoom included. */
  private async showImagePopover(file: TFile, img: HTMLImageElement): Promise<void> {
    const rect = img.getBoundingClientRect();
    const id = img.dataset.atId;
    const zoom = () => {
      // Re-issue the click we swallowed. Obsidian's viewer is bound to the
      // event, not to an API, so replaying it is the only way to hand the
      // gesture back.
      this.passingThrough = true;
      img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      window.setTimeout(() => { this.passingThrough = false; }, 0);
    };

    if (!id) {
      this.popover.showAt(rect, {
        onMark: () => { void this.markImage(file, img, null); },
        onComment: () => {
          new CommentModal(this.app, '🖼 ' + (img.getAttribute('alt') || 'image'), '', body => {
            void this.markImage(file, img, body || null);
          }).open();
        },
        onZoom: zoom,
      });
      return;
    }

    this.popover.showAt(rect, {
      onMarkAgain: () => { void this.markAgain(file.path, id); },
      onComment: () => { void this.editComment(file, id); },
      onRemove: () => { void this.store.remove(file.path, id); },
      onZoom: zoom,
    });
  }

  private async showBubble(file: TFile, el: HTMLElement): Promise<void> {
    const id = el.dataset.atId;
    if (!id) return;
    const data = await this.store.get(file.path);
    const annotation = data.annotations.find(a => a.id === id);
    if (!annotation) return;

    this.bubble.showFor(el.getBoundingClientRect(), annotation, {
      onEdit: () => { void this.editComment(file, id); },
      onMarkAgain: () => { void this.markAgain(file.path, id); },
      onRemove: () => { void this.store.remove(file.path, id); },
    });
  }

  private hasSomethingToOffer(view: MarkdownView): boolean {
    // Guarded on containment for the same reason the view is looked up by
    // element: a target from another pane is not this note's to offer.
    if (belongsTo(view.contentEl, this.lastTarget)) {
      if (this.lastTarget?.closest('.at-hl')) return true;
      if (this.lastTarget?.closest('img')) return true;
    }
    const selection = window.getSelection();
    return (
      (selection?.toString().trim().length ?? 0) > 0 &&
      view.contentEl.contains(selection?.anchorNode ?? null)
    );
  }

  /**
   * Anchor whatever is selected, and say which file it belongs to.
   *
   * Usually the note on screen — but a transcluded note is someone else's
   * text, and a mark on it belongs to that file. Anchoring it to the host
   * would put the mark in a note that doesn't contain the words, where it
   * would never resolve and would vanish the moment the transclusion moved.
   */
  private async capture(view: MarkdownView): Promise<{ anchor: MarkdownAnchor; file: TFile } | null> {
    const host = view.file;
    if (!host) return null;

    const embedded = this.embeddedFileAt(this.selectionElement(), host);
    if (embedded) {
      const anchor = await this.captureInFile(embedded);
      return anchor ? { anchor, file: embedded } : null;
    }

    if (view.getMode() === 'source') {
      const anchor = this.captureEditor(view.editor);
      return anchor ? { anchor, file: host } : null;
    }
    const anchor = await this.captureInFile(host);
    return anchor ? { anchor, file: host } : null;
  }

  /** The markdown view whose content contains `el`. */
  private viewContaining(el: Node | null): MarkdownView | null {
    const views = this.app.workspace
      .getLeavesOfType('markdown')
      .map(leaf => leaf.view)
      .filter((v): v is MarkdownView => v instanceof MarkdownView);
    return ownerOf(views.map(v => ({ v, contains: (n: Node | null) => v.contentEl.contains(n) })), el)?.v ?? null;
  }

  /** The element the selection starts in. */
  private selectionElement(): HTMLElement | null {
    const node = window.getSelection()?.anchorNode ?? null;
    if (!node) return null;
    return elementOf(node);
  }

  /**
   * The note transcluded around `el`, if any.
   *
   * Obsidian renders `![[a note]]` into a container carrying the link it came
   * from, which is enough to resolve the real file.
   */
  private embeddedFileAt(el: HTMLElement | null, host: TFile): TFile | null {
    const container = asEl(el?.closest('.internal-embed, .markdown-embed'));
    if (!container) return null;
    const link = container.getAttribute('src') ?? container.getAttribute('data-href') ?? '';
    if (!link) return null;
    const target = this.app.metadataCache.getFirstLinkpathDest(link.split('#')[0], host.path);
    // Only notes: an embedded picture has no text to anchor into.
    return target && target.extension === 'md' ? target : null;
  }

  private captureEditor(editor: Editor): MarkdownAnchor | null {
    const from = editor.posToOffset(editor.getCursor('from'));
    const to = editor.posToOffset(editor.getCursor('to'));
    if (from === to) return null;
    return { kind: 'markdown', ...describe(editor.getValue(), from, to) };
  }

  /** Selection finished: offer the swatches straight away, if asked to. */
  private async onSelectionMade(): Promise<void> {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) return;

    // Find the note the selection is physically in, rather than whichever view
    // happens to be active — the sidebar can hold focus, and a split pane you
    // selected in need not be the active one.
    const view = this.viewContaining(this.selectionElement());
    if (!view?.file) return;

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const captured = await this.capture(view);
    if (!captured) return;

    this.popover.showAt(rect, {
      onMark: () => { void this.mark(captured.file, captured.anchor, null); },
      onComment: () => this.promptComment(captured.file, captured.anchor, ''),
    });
  }

  // ── Editing modes ──────────────────────────────────────────────────────────

  private onEditorMenu(menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo): void {
    const file = info.file;
    if (!file) return;

    const existing = asEl(this.lastTarget?.closest('.at-hl'));
    if (existing) {
      this.addExistingItems(menu, this.embeddedFileAt(existing, file) ?? file, existing);
      return;
    }

    // A picture can't be selected, so right-clicking one is the way in.
    const img = asImg(this.lastTarget?.closest('img'));
    if (img) {
      this.addImageItems(menu, this.embeddedFileAt(img, file) ?? file, img);
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

    const existing = asEl(this.lastTarget?.closest('.at-hl'));
    const img = asImg(this.lastTarget?.closest('img'));
    if (existing) {
      this.addExistingItems(menu, this.embeddedFileAt(existing, file) ?? file, existing);
    } else if (img) {
      // A picture inside a transclusion belongs to the note it came from, the
      // same as a highlight does — the host's text has no embed for it.
      this.addImageItems(menu, this.embeddedFileAt(img, file) ?? file, img);
    } else {
      const captured = await this.capture(view);
      if (!captured) return;
      this.addCreateItems(menu, captured.file, captured.anchor);
    }
    menu.showAtMouseEvent(e);
  }

  /** Locate a rendered selection in a file's source by ordinal. */
  private async captureInFile(file: TFile): Promise<MarkdownAnchor | null> {
    const selection = window.getSelection();
    const selected = selection?.toString() ?? '';
    if (!selection || selected.trim().length === 0) return null;

    const source = await this.app.vault.cachedRead(file);
    // Search a projection of the source with inline markup stripped — that is
    // what the reader actually selected. Searching the raw source instead would
    // refuse any selection containing emphasis, a link or a highlight, which in
    // a real note is most of them.
    const plain = project(source);
    const at = nthOccurrence(plain.text, selected, this.renderedOrdinal(selection, selected));
    if (at < 0) {
      new Notice('Attention: could not find that selection in the note.');
      return null;
    }
    const range = toSource(plain, at, at + selected.length);
    if (!range) return null;
    return { kind: 'markdown', ...describe(source, range.from, range.to) };
  }

  /**
   * How many identical strings precede this selection on screen.
   *
   * Counted within the reading container the selection is actually in, not the
   * whole view: `contentEl` holds the source layer *and* the reading layer at
   * once — only one visible — so counting across it sees the document twice and
   * asks for an occurrence that doesn't exist.
   */
  private renderedOrdinal(selection: Selection, selected: string): number {
    const sel = selection.getRangeAt(0);
    const node = sel.startContainer;
    const el = elementOf(node);
    // Count within the transclusion when inside one: its text is a file of its
    // own, and occurrences elsewhere on the page are not part of it.
    const container =
      el?.closest('.markdown-embed-content') ??
      el?.closest('.markdown-preview-view') ??
      el?.closest('.cm-content');
    if (!container) return 0;

    const before = sel.cloneRange();
    before.selectNodeContents(container);
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

  /** Menu for a rendered image: mark the picture itself. */
  private addImageItems(menu: Menu, file: TFile, img: HTMLImageElement): void {
    const id = img.dataset.atId;
    if (id) {
      menu.addItem(i => i.setTitle('Edit comment…').setIcon('message-square')
        .onClick(() => { void this.editComment(file, id); }));
      menu.addItem(i => i.setTitle('Mark again').setIcon('plus')
        .onClick(() => { void this.markAgain(file.path, id); }));
      menu.addItem(i => i.setTitle('Remove mark').setIcon('trash').setWarning(true)
        .onClick(() => { void this.store.remove(file.path, id); }));
      return;
    }

    menu.addItem(i => i.setTitle('Mark image').setIcon('highlighter')
      .onClick(() => { void this.markImage(file, img, null); }));
    menu.addItem(i => i.setTitle('Comment on image…').setIcon('message-square')
      .onClick(() => {
        new CommentModal(this.app, '🖼 ' + (img.getAttribute('alt') || 'image'), '', body => {
          void this.markImage(file, img, body || null);
        }).open();
      }));
  }

  /**
   * Anchor a picture by the embed that produced it.
   *
   * Matched on what the image points at rather than by counting images: Live
   * Preview only renders the widgets near the viewport, so a positional count
   * would be wrong exactly when the note is long enough for it to matter. The
   * same picture used twice is told apart by order among its own duplicates.
   */
  private async markImage(file: TFile, img: HTMLImageElement, body: string | null): Promise<void> {
    const source = await this.app.vault.cachedRead(file);
    const embeds = findImageEmbeds(source);
    if (embeds.length === 0) {
      new Notice('Attention: could not find that image in the note.');
      return;
    }

    // First try what the picture points at. When that works it is exact.
    const src = img.getAttribute('src') ?? '';
    const byTarget = embeds.filter(e => imageMatches(src, e.target));
    let embed: ImageEmbed | null = byTarget[0] ?? null;
    if (byTarget.length > 1) {
      const same = Array.from(document.querySelectorAll('img'))
        .filter(other => other.getAttribute('src') === src);
      embed = byTarget[Math.min(Math.max(same.indexOf(img), 0), byTarget.length - 1)];
    }

    // Otherwise fall back to where it sits. The rendered src is often nothing
    // like the source — a vault that caches remote pictures locally serves an
    // app:// path, a drawing plugin serves a blob — but the words around a
    // picture are the same on screen as in the file.
    if (!embed) {
      const plain = project(source);
      embed = embedBySurroundings(
        source, embeds,
        this.textAround(img, 'before'),
        this.textAround(img, 'after'),
        i => plain.map[i] ?? 0,
        plain.text,
      );
    }

    if (!embed) {
      new Notice('Attention: could not tell which image in the note that is.');
      return;
    }
    await this.mark(file, {
      kind: 'markdown',
      ...describe(source, embed.from, embed.to),
      imageHint: srcHint(src),
    }, body);
  }

  /** A little of the rendered text immediately before or after an image. */
  private textAround(img: HTMLImageElement, side: 'before' | 'after'): string {
    const block = img.closest('p, li, blockquote, div') ?? img.parentElement;
    if (!block) return '';
    const range = document.createRange();
    if (side === 'after') {
      range.setStartAfter(img);
      range.setEnd(block, block.childNodes.length);
    } else {
      range.setStart(block, 0);
      range.setEndBefore(img);
    }
    const text = range.toString();
    return side === 'after' ? text.slice(0, 40) : text.slice(-40);
  }

  private promptComment(file: TFile, anchor: MarkdownAnchor, initial: string): void {
    new CommentModal(this.app, anchor.quote, initial, body => {
      void this.mark(file, anchor, body || null);
    }).open();
  }

  private async markAgain(targetPath: string, id: string): Promise<void> {
    const updated = await this.store.markAgain(targetPath, id);
    if (updated) new Notice(`Marked ${updated.hits.length}× now`);
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

