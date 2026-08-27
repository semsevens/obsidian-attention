import { ItemView, Menu, WorkspaceLeaf, TFile } from 'obsidian';
import type AttentionPlugin from '../main';
import { IndexEntry, Bucket, BUCKET_ORDER } from '../store/review';
import { Annotation, isComment, lastMarked } from '../model';
import { Sort, SORT_LABELS, sortsFor, resolveSort, sortAnnotations } from '../store/sorting';
import { inDocumentOrder } from '../store/documentOrder';
import { reveal } from '../hosts/markdown/reveal';
import { formatWhen } from '../ui/time';
import { CommentModal } from '../ui/CommentModal';

export const VIEW_TYPE_REVIEW = 'attention-review';

const BUCKET_LABELS: Record<Bucket, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  older: 'Earlier',
};

/**
 * Two ways of looking at the same annotations.
 *
 *   This note — what you marked here, in document order by default.
 *   All — across the vault, grouped by how long ago, for running into things
 *     again.
 *
 * They share a panel rather than taking two slots in the sidebar, because the
 * rendering is identical and only the question differs.
 */
// Named 'lens' rather than 'scope': View already has a `scope` (the keyboard
// scope), and shadowing it with a different type breaks the base class.
type Lens = 'file' | 'all';

export class ReviewView extends ItemView {
  private lens: Lens = 'file';
  private sort: Sort = 'document';
  /**
   * Bumped on every render. Rendering empties the panel, then awaits a file
   * read before appending; two overlapping calls would each empty and then each
   * append, listing everything twice. A render whose generation has been
   * superseded stops instead of drawing.
   */
  private generation = 0;
  private resurfaced: IndexEntry[] | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: AttentionPlugin) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE_REVIEW; }
  getDisplayText() { return 'Attention'; }
  getIcon() { return 'highlighter'; }

  async onOpen() {
    this.registerEvent(this.app.workspace.on('file-open', () => { void this.render(); }));
    await this.render();
  }

  async render(): Promise<void> {
    // Painting a view Obsidian hasn't finished mounting is wasted work; onOpen
    // renders once we're attached.
    const seq = ++this.generation;
    const root = this.contentEl;
    root.empty();
    root.addClass('at-review');

    this.renderHeader(root);

    if (this.resurfaced) {
      for (const e of this.resurfaced) this.renderEntry(root, e.annotation, e.targetPath);
      return;
    }

    if (this.lens === 'file') await this.renderFile(root, seq);
    else this.renderAll(root);
  }

  private renderHeader(root: HTMLElement): void {
    const header = root.createDiv('at-review-header');

    const tabs = header.createDiv('at-tabs');
    const tab = (label: string, lens: Lens) => {
      const el = tabs.createEl('button', { text: label, cls: 'at-tab' });
      if (this.lens === lens && !this.resurfaced) el.addClass('is-active');
      el.addEventListener('click', () => {
        this.lens = lens;
        // Document order means nothing across files; fall back rather than
        // showing an arbitrary order under a label that promises one.
        this.sort = resolveSort(this.sort, lens);
        this.resurfaced = null;
        void this.render();
      });
    };
    tab('This note', 'file');
    tab('All', 'all');

    const resurface = header.createEl('button', { text: 'Resurface', cls: 'at-btn' });
    if (this.resurfaced) resurface.addClass('is-active');
    resurface.addEventListener('click', () => {
      this.resurfaced = this.resurfaced
        ? null
        : this.plugin.index.resurface(this.plugin.settings.resurfaceCount, () => Math.random());
      void this.render();
    });

    if (!this.resurfaced) this.renderSortControl(root);
  }

  private renderSortControl(root: HTMLElement): void {
    const bar = root.createDiv('at-sortbar');
    const select = bar.createEl('select', { cls: 'at-sort dropdown' });
    for (const s of sortsFor(this.lens)) {
      select.createEl('option', { text: SORT_LABELS[s], attr: { value: s } });
    }
    select.value = this.sort;
    select.addEventListener('change', () => {
      this.sort = select.value as Sort;
      void this.render();
    });
  }

  // ── This note ──────────────────────────────────────────────────────────────

  private async renderFile(root: HTMLElement, seq: number): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      this.empty(root, 'No note open.');
      return;
    }

    const data = await this.plugin.store.get(file.path);
    if (seq !== this.generation) return;
    if (data.annotations.length === 0) {
      this.empty(root, `Nothing marked in “${file.basename}”.`);
      return;
    }

    const ordered = this.sort === 'document'
      ? await inDocumentOrder(this.app, file, data.annotations)
      : sortAnnotations(data.annotations.map(annotation => ({ annotation })), this.sort)
          .map(x => x.annotation);
    if (seq !== this.generation) return;

    root.createDiv('at-bucket-title').setText(`${ordered.length} in this note`);
    for (const a of ordered) this.renderEntry(root, a, file.path);
  }

  // ── All ────────────────────────────────────────────────────────────────────

  private renderAll(root: HTMLElement): void {
    const all = this.plugin.index.all();
    if (all.length === 0) {
      this.empty(root, 'Nothing marked yet. Select text in a note to mark it.');
      return;
    }

    // Only the default ordering is grouped by age; asking for another order
    // and still getting time headings would be answering a different question.
    if (this.sort !== 'recent') {
      const sorted = sortAnnotations(all, this.sort);
      root.createDiv('at-bucket-title').setText(`${sorted.length} marked`);
      for (const e of sorted) this.renderEntry(root, e.annotation, e.targetPath);
      return;
    }

    const buckets = this.plugin.index.buckets();
    for (const key of BUCKET_ORDER) {
      const entries = buckets[key];
      if (entries.length === 0) continue;
      root.createDiv('at-bucket-title').setText(`${BUCKET_LABELS[key]} · ${entries.length}`);
      for (const e of entries) this.renderEntry(root, e.annotation, e.targetPath);
    }
  }

  // ── Shared ─────────────────────────────────────────────────────────────────

  private empty(root: HTMLElement, message: string): void {
    root.createDiv('at-empty').setText(message);
  }

  private renderEntry(root: HTMLElement, annotation: Annotation, targetPath: string): void {
    const el = root.createDiv('at-entry');

    el.createDiv('at-quote').setText(annotation.anchor.quote);
    if (isComment(annotation)) {
      el.createDiv('at-body').setText(annotation.body ?? '');
    }

    const meta = el.createDiv('at-meta');
    // In the per-note outline the filename is noise — it's the same every time.
    if (this.lens === 'all' || this.resurfaced) {
      meta.createSpan({ text: targetPath.split('/').pop() ?? targetPath, cls: 'at-source' });
    }
    if (annotation.anchor.kind === 'transcript') {
      meta.createSpan({ text: fmtTime(annotation.anchor.start), cls: 'at-time' });
    }
    meta.createSpan({ text: formatWhen(lastMarked(annotation), this.plugin.settings.timeFormat), cls: 'at-when' });
    // A passage that caught you more than once is the point; say so.
    if (annotation.hits.length > 1) {
      meta.createSpan({ text: `${annotation.hits.length}×`, cls: 'at-hits' });
    }

    // Acting on a mark from the list, rather than having to find it in the note
    // first. Revealed on hover so a long list stays quiet.
    const actions = el.createDiv('at-entry-actions');
    const act = (label: string, title: string, fn: () => void, warn = false) => {
      const b = actions.createEl('button', { cls: 'at-icon-btn', text: label });
      b.setAttribute('aria-label', title);
      b.setAttribute('title', title);
      if (warn) b.addClass('mod-warning');
      b.addEventListener('click', e => {
        e.stopPropagation();   // the entry itself jumps to the passage
        fn();
      });
    };
    act('💬', isComment(annotation) ? 'Edit comment' : 'Add a comment',
        () => this.editComment(targetPath, annotation));
    act('✕', 'Remove this mark',
        () => { void this.plugin.store.remove(targetPath, annotation.id); }, true);

    el.addEventListener('click', () => { void this.jumpTo(annotation, targetPath); });
    el.addEventListener('contextmenu', e => this.entryMenu(e, annotation, targetPath));
  }

  private entryMenu(e: MouseEvent, annotation: Annotation, targetPath: string): void {
    e.preventDefault();
    const menu = new Menu();
    menu.addItem(i => i.setTitle('Go to').setIcon('arrow-right')
      .onClick(() => { void this.jumpTo(annotation, targetPath); }));
    menu.addItem(i => i.setTitle(isComment(annotation) ? 'Edit comment…' : 'Add a comment…')
      .setIcon('message-square').onClick(() => this.editComment(targetPath, annotation)));
    menu.addItem(i => i.setTitle('Copy text').setIcon('copy')
      .onClick(() => { void navigator.clipboard.writeText(annotation.anchor.quote); }));
    menu.addItem(i => i.setTitle('Remove mark').setIcon('trash').setWarning(true)
      .onClick(() => { void this.plugin.store.remove(targetPath, annotation.id); }));
    menu.showAtMouseEvent(e);
  }

  private editComment(targetPath: string, annotation: Annotation): void {
    new CommentModal(this.app, annotation.anchor.quote, annotation.body ?? '', body => {
      void this.plugin.store.update(targetPath, annotation.id, { body: body || null });
    }).open();
  }

  private async jumpTo(annotation: Annotation, targetPath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof TFile)) return;

    await reveal(this.app, file, annotation);
    // Marking it seen is what makes "prefer things you haven't revisited" work.
    await this.plugin.markReviewed({ targetPath, annotation });
  }
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
