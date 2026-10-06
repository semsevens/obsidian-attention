import { App, Component, Events, FileView, Menu, Notice, Plugin, TFile } from 'obsidian';
import { Annotation, isComment, PdfAnchor, PdfSpan } from '../../model';
import { AnnotationStore } from '../../store/annotationStore';
import { AttentionSettings } from '../../settings';
import { SelectionPopover } from '../../ui/SelectionPopover';
import { CommentBubble } from '../../ui/CommentBubble';
import { CommentModal } from '../../ui/CommentModal';
import { asEl, elementOf } from '../../dom';
import { describePdf, resolveSpan, spanText } from '../../anchor/pdfText';
import { readable } from '../../anchor/cjk';
import { childOf, PageView, PdfChild, pdfPlus, textLayerOf, TextLayerInfo } from './pdfPlus';

/**
 * Marks on PDFs, drawn and selected through PDF++.
 *
 * Dormant without PDF++: every entry point asks for it first and does nothing
 * when it isn't there, the way the transcript host waits for Media Transcript.
 */
export class PdfHost {
  /** One per open PDF viewer: what it shows, and what to unload to stop painting it. */
  private painters = new Map<PdfChild, { path: string; owner: Component }>();
  private popover = new SelectionPopover();
  private bubble = new CommentBubble();
  /** Where the last right-click in a PDF was, for the menu PDF++ opens after it. */
  private contextAt: { x: number; y: number } | null = null;

  constructor(
    private app: App,
    private plugin: Plugin,
    private store: AnnotationStore,
    private settings: AttentionSettings,
  ) {}

  register(): void {
    const attach = () => this.attachAll();
    this.app.workspace.onLayoutReady(attach);
    this.plugin.registerEvent(this.app.workspace.on('layout-change', attach));
    this.plugin.registerEvent(this.app.workspace.on('file-open', attach));
    this.plugin.register(this.store.onChange(path => this.repaint(path)));
    this.plugin.register(() => this.detachAll());

    this.plugin.registerDomEvent(document, 'mouseup', e => {
      if (e.button !== 0 || !this.settings.popoverOnSelection) return;
      if (!this.inPdf(e.target)) return;
      if (asEl(e.target)?.closest('.at-popover, .at-bubble')) return;
      window.setTimeout(() => { void this.onSelectionMade(); }, 0);
    });

    // A mark is drawn in a layer the pointer passes through — so the text under
    // it still selects — and is found by position instead.
    this.plugin.registerDomEvent(document, 'click', e => {
      if (!this.inPdf(e.target)) return;
      if ((window.getSelection()?.toString().trim().length ?? 0) > 0) return;
      const hit = this.markAt(e.clientX, e.clientY);
      if (hit) void this.showBubble(hit);
    });

    // PDF++ opens its own menu on a right-click and announces it as `pdf-menu`,
    // for other plugins to add to. It doesn't say where the click was, so that
    // is noted on the way past.
    this.plugin.registerDomEvent(document, 'contextmenu', e => {
      this.contextAt = this.inPdf(e.target) ? { x: e.clientX, y: e.clientY } : null;
    }, { capture: true });
    // Not one of Obsidian's own events, so not in its typings for Workspace.
    const events: Events = this.app.workspace;
    this.plugin.registerEvent(events.on('pdf-menu', (menu: unknown) => {
      if (menu instanceof Menu) this.addMenuItems(menu);
    }));
  }

  detach(): void {
    this.popover.hide();
    this.bubble.hide();
  }

  // ── Painting ───────────────────────────────────────────────────────────────

  /** Start painting every open PDF not painted yet; stop for those closed. */
  private attachAll(): void {
    const lib = pdfPlus(this.app);
    const open = new Map<PdfChild, string>();
    for (const leaf of this.app.workspace.getLeavesOfType('pdf')) {
      const file = (leaf.view as FileView).file;
      const child = childOf(leaf.view);
      if (file && child) open.set(child, file.path);
    }

    for (const [child, painter] of this.painters) {
      if (open.get(child) !== painter.path) {
        painter.owner.unload();
        this.painters.delete(child);
      }
    }
    if (!lib) return;

    for (const [child, path] of open) {
      if (this.painters.has(child)) continue;
      const owner = new Component();
      owner.load();
      this.painters.set(child, { path, owner });
      // Painting reads the cache synchronously, so load the file's marks first —
      // with get(), not warm(): warm() announces a change, a change repaints,
      // and repainting comes back here, round and round without end.
      void this.store.get(path).then(() => {
        if (this.painters.get(child)?.owner !== owner) return;
        lib.onTextLayerReady(child, owner, (page, view) => this.paintPage(path, page, view));
      });
    }
  }

  /** Paint a file's PDFs afresh: every page already drawn is called back again. */
  private repaint(path: string): void {
    for (const [child, painter] of this.painters) {
      if (painter.path !== path) continue;
      painter.owner.unload();
      this.painters.delete(child);
    }
    this.attachAll();
  }

  private detachAll(): void {
    for (const { owner } of this.painters.values()) owner.unload();
    this.painters.clear();
    document.querySelectorAll('.at-pdf-hl').forEach(el => el.remove());
  }

  /** Draw this page's marks, replacing whatever was drawn for it before. */
  private paintPage(path: string, page: number, view: PageView): void {
    const lib = pdfPlus(this.app);
    view.div.querySelectorAll('.at-pdf-hl').forEach(el => el.remove());
    const info = textLayerOf(view);
    if (!lib || !info) return;
    const items = info.textContentItems.map(i => i.str);

    for (const a of this.store.peek(path)) {
      if (a.anchor.kind !== 'pdf') continue;
      const anchor = a.anchor;
      anchor.spans.forEach((span, k) => {
        if (span.page !== page) return;
        const selection = this.locate(items, anchor, k);
        if (!selection) return;
        for (const rect of lib.rects(info, selection)) {
          const el = lib.place(rect, view);
          // Not PDF++'s classes: those carry its own hover and click handling,
          // which looks for a backlink a mark doesn't have.
          el.className = isComment(a) ? 'at-hl at-pdf-hl at-hl-comment' : 'at-hl at-pdf-hl';
          el.dataset.atId = a.id;
        }
      });
    }
  }

  /** Where span `k` of an anchor sits among these items now, if anywhere. */
  private locate(items: string[], anchor: PdfAnchor, k: number): PdfSpan['selection'] | null {
    const span = anchor.spans[k];
    const parts = anchor.quote.split('\n');
    // One line per span is how the quote was made; anything else is a quote
    // with newlines of its own, and the stored selection is all there is.
    if (parts.length !== anchor.spans.length) {
      return spanText(items, span.selection) ? span.selection : null;
    }
    const last = anchor.spans.length - 1;
    return resolveSpan(items, span, parts[k], k === 0 ? anchor.prefix : '', k === last ? anchor.suffix : '');
  }

  // ── Selecting ──────────────────────────────────────────────────────────────

  private inPdf(target: EventTarget | null): boolean {
    return !!elementOf(target as Node | null)?.closest('.pdf-container, .pdf-viewer-container');
  }

  /** The open PDF whose view holds `node`. */
  private viewOf(node: Node): { file: TFile; child: PdfChild } | null {
    for (const leaf of this.app.workspace.getLeavesOfType('pdf')) {
      const view = leaf.view as FileView;
      const child = childOf(view);
      if (view.file && child && view.containerEl.contains(node)) return { file: view.file, child };
    }
    return null;
  }

  /**
   * The selection as an anchor: one span for each page it touches.
   *
   * PDF++ reads a selection one page at a time, so a selection across pages is
   * cut at each page boundary and each piece read on its own page.
   */
  private capture(): { file: TFile; anchor: PdfAnchor } | null {
    const lib = pdfPlus(this.app);
    const selection = window.getSelection();
    if (!lib || !selection || selection.rangeCount === 0 || !selection.toString().trim()) return null;
    const range = selection.getRangeAt(0);
    const found = this.viewOf(range.startContainer);
    if (!found) return null;

    const pageOf = (n: Node) => Number(asEl(elementOf(n)?.closest('.page'))?.dataset.pageNumber);
    const first = pageOf(range.startContainer);
    const last = pageOf(range.endContainer);
    if (!Number.isFinite(first) || !Number.isFinite(last)) return null;

    const spans: PdfSpan[] = [];
    const pages = new Map<number, string[]>();
    for (let page = first; page <= last; page++) {
      const view = found.child.getPage(page);
      const info = view && textLayerOf(view);
      if (!info || info.textDivs.length === 0) continue;
      const part = this.partOn(info, range, page === first, page === last);
      const at = part && lib.selectionIn(view.div, part);
      if (!at) continue;
      const items = info.textContentItems.map(i => i.str);
      if (!spanText(items, at)?.trim()) continue;
      pages.set(page, items);
      spans.push({ page, selection: at });
    }
    const described = spans.length > 0 && describePdf(spans, pages);
    if (!described) return null;
    return { file: found.file, anchor: { kind: 'pdf', spans, ...described } };
  }

  /**
   * The piece of `range` on one page, with both ends inside its text.
   *
   * A drag rarely ends exactly on a character: between lines, or past the end
   * of one, the browser puts the end in the layer itself or in pdf.js's
   * end-of-content filler — where no text item is, and PDF++ finds nothing.
   * Such an end moves to the nearest edge of text on its side.
   */
  private partOn(info: TextLayerInfo, range: Range, first: boolean, last: boolean): Range | null {
    const divs = info.textDivs.filter(d => d.textContent);
    if (divs.length === 0) return null;
    const doc = divs[0].doc;
    const part = doc.createRange();
    const inText = (n: Node) => divs.some(d => d.contains(n));

    if (first && inText(range.startContainer)) {
      part.setStart(range.startContainer, range.startOffset);
    } else {
      // The first text that begins after the start point.
      const d = first ? divs.find(x => range.comparePoint(x, 0) >= 0) : divs[0];
      if (!d) return null;
      const t = firstText(d);
      if (!t) return null;
      part.setStart(t, 0);
    }

    if (last && inText(range.endContainer)) {
      part.setEnd(range.endContainer, range.endOffset);
    } else {
      // The last text that ends before the end point.
      const d = last ? [...divs].reverse().find(x => range.comparePoint(x, x.childNodes.length) <= 0) : divs[divs.length - 1];
      if (!d) return null;
      const t = lastText(d);
      if (!t) return null;
      part.setEnd(t, t.length);
    }
    return part.collapsed ? null : part;
  }

  private async onSelectionMade(): Promise<void> {
    const captured = this.capture();
    if (!captured) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    this.popover.showAt(selection.getRangeAt(0).getBoundingClientRect(), {
      onMark: () => { void this.mark(captured.file, captured.anchor, null); },
      onComment: () => this.comment(captured.file, captured.anchor),
    });
  }

  /** Attention's items in PDF++'s menu: for a selection, or for a mark clicked on. */
  private addMenuItems(menu: Menu): void {
    const hit = this.contextAt && this.markAt(this.contextAt.x, this.contextAt.y);
    if (hit) {
      menu.addItem(i => i.setSection('attention').setTitle('Edit comment…').setIcon('message-square')
        .onClick(() => { void this.editComment(hit.path, hit.id); }));
      menu.addItem(i => i.setSection('attention').setTitle('Mark again').setIcon('highlighter')
        .onClick(() => { void this.markAgain(hit.path, hit.id); }));
      menu.addItem(i => i.setSection('attention').setTitle('Remove mark').setIcon('trash').setWarning(true)
        .onClick(() => { void this.store.remove(hit.path, hit.id); }));
      return;
    }
    const captured = this.capture();
    if (!captured) return;
    menu.addItem(i => i.setSection('attention').setTitle('Mark').setIcon('highlighter')
      .onClick(() => { void this.mark(captured.file, captured.anchor, null); }));
    menu.addItem(i => i.setSection('attention').setTitle('Comment…').setIcon('message-square')
      .onClick(() => this.comment(captured.file, captured.anchor)));
  }

  /** The mark drawn under a point, if any, and the PDF it belongs to. */
  private markAt(x: number, y: number): { path: string; id: string; el: HTMLElement } | null {
    for (const raw of Array.from(document.querySelectorAll('.at-pdf-hl'))) {
      const el = asEl(raw);
      const id = el?.dataset.atId;
      if (!el || !id) continue;
      const r = el.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const path = this.viewOf(el)?.file.path;
      if (path) return { path, id, el };
    }
    return null;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private async showBubble(hit: { path: string; id: string; el: HTMLElement }): Promise<void> {
    const annotation = await this.find(hit.path, hit.id);
    if (!annotation) return;
    this.bubble.showFor(hit.el.getBoundingClientRect(), annotation, {
      onEdit: () => { void this.editComment(hit.path, hit.id); },
      onMarkAgain: () => { void this.markAgain(hit.path, hit.id); },
      onRemove: () => { void this.store.remove(hit.path, hit.id); },
    });
  }

  private comment(file: TFile, anchor: PdfAnchor): void {
    new CommentModal(this.app, readable(anchor.quote), '', body => {
      void this.mark(file, anchor, body || null);
    }).open();
  }

  private async editComment(path: string, id: string): Promise<void> {
    const annotation = await this.find(path, id);
    if (!annotation) return;
    new CommentModal(this.app, readable(annotation.anchor.quote), annotation.body ?? '', body => {
      void this.store.update(path, id, { body: body || null });
    }).open();
  }

  private async markAgain(path: string, id: string): Promise<void> {
    const updated = await this.store.markAgain(path, id);
    if (updated) new Notice(`Marked ${updated.hits.length}× now`);
  }

  private async mark(file: TFile, anchor: PdfAnchor, body: string | null): Promise<void> {
    window.getSelection()?.removeAllRanges();
    const { repeat, annotation } = await this.store.mark(file.path, anchor, body);
    if (repeat) new Notice(`Marked ${annotation.hits.length}× now`);
  }

  private async find(path: string, id: string): Promise<Annotation | undefined> {
    return (await this.store.get(path)).annotations.find(a => a.id === id);
  }
}

function firstText(el: Node): Text | null {
  const walker = el.doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  return walker.nextNode() as Text | null;
}

function lastText(el: Node): Text | null {
  const walker = el.doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let last: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n as Text;
  return last;
}
