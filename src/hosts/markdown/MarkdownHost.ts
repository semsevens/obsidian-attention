import { App, MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import { Annotation, MarkdownAnchor, newId, isComment } from '../../model';
import { describe, nthOccurrence, countOccurrences } from '../../anchor/textQuote';
import { AnnotationStore } from '../../store/annotationStore';
import { SelectionPopover } from '../../ui/SelectionPopover';
import { CommentModal } from '../../ui/CommentModal';
import { AttentionSettings } from '../../settings';

/**
 * Turns a selection in a markdown note into an annotation.
 *
 * Capture works differently in the two modes, because only one of them has the
 * source in front of it:
 *
 *   Live Preview / source — the editor *is* the document, so `posToOffset`
 *     gives exact source offsets.
 *   Reading mode — the DOM is rendered HTML with no source offsets at all.
 *     We take the selected text and find the matching occurrence in the file by
 *     counting how many identical strings precede it on screen; rendering drops
 *     markup but preserves the order of body text.
 */
export class MarkdownHost {
  private popover: SelectionPopover;

  constructor(
    private app: App,
    private plugin: Plugin,
    private store: AnnotationStore,
    private settings: AttentionSettings,
  ) {
    this.popover = new SelectionPopover(settings.colors);
  }

  register(): void {
    this.plugin.registerDomEvent(document, 'mouseup', e => {
      // Let the click settle so the selection and any click target are final.
      window.setTimeout(() => { void this.handleMouseUp(e); }, 0);
    });
  }

  detach(): void {
    this.popover.hide();
  }

  private async handleMouseUp(e: MouseEvent): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return;

    // Clicking an existing highlight opens it rather than starting a new one.
    const hit = (e.target as HTMLElement | null)?.closest?.('.at-hl');
    const selection = window.getSelection();
    const selected = selection?.toString() ?? '';

    if (hit instanceof HTMLElement && selected.length === 0) {
      await this.openExisting(view.file, hit);
      return;
    }

    if (selected.trim().length === 0) return;
    if (!selection || !view.contentEl.contains(selection.anchorNode)) return;

    const anchor = await this.capture(view, selection, selected);
    if (!anchor) return;

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    const file = view.file;
    this.popover.showAt(rect, {
      onHighlight: color => { void this.create(file, anchor, color, null); },
      onComment: () => {
        new CommentModal(this.app, anchor.quote, '', body => {
          void this.create(file, anchor, this.settings.defaultColor, body || null);
        }).open();
      },
    });
  }

  /** Build a source-anchored range from whatever the user selected. */
  private async capture(
    view: MarkdownView,
    selection: Selection,
    selected: string,
  ): Promise<MarkdownAnchor | null> {
    if (view.getMode() === 'source') {
      const editor = view.editor;
      const from = editor.posToOffset(editor.getCursor('from'));
      const to = editor.posToOffset(editor.getCursor('to'));
      if (from === to) return null;
      return { kind: 'markdown', ...describe(editor.getValue(), from, to) };
    }

    // Reading mode: no offsets, so locate the selection by ordinal.
    const file = view.file;
    if (!file) return null;
    const source = await this.app.vault.cachedRead(file);

    const ordinal = this.renderedOrdinal(view, selection, selected);
    const at = nthOccurrence(source, selected, ordinal);
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
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(view.contentEl);
    range.setEnd(selection.getRangeAt(0).startContainer, selection.getRangeAt(0).startOffset);
    return countOccurrences(range.toString(), selected);
  }

  private async create(
    file: TFile,
    anchor: MarkdownAnchor,
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
    await this.store.add(file.path, annotation);
  }

  private async openExisting(file: TFile, el: HTMLElement): Promise<void> {
    const id = el.dataset.atId;
    if (!id) return;
    const data = await this.store.get(file.path);
    const annotation = data.annotations.find(a => a.id === id);
    if (!annotation) return;

    const rect = el.getBoundingClientRect();
    this.popover.showAt(rect, {
      onHighlight: color => { void this.store.update(file.path, id, { color }); },
      onComment: () => {
        new CommentModal(this.app, annotation.anchor.quote, annotation.body ?? '', body => {
          void this.store.update(file.path, id, { body: body || null });
        }).open();
      },
      onRemove: () => { void this.store.remove(file.path, id); },
    });
  }
}

export { isComment };
