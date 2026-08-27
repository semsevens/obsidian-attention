import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type AttentionPlugin from '../main';
import { IndexEntry, Bucket, BUCKET_ORDER } from '../store/review';
import { Annotation, isComment } from '../model';
import { inDocumentOrder } from '../store/documentOrder';
import { revealInMarkdown } from '../hosts/markdown/reveal';

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
 *   This note — an outline, in *document* order, for finding your way around
 *     what you marked here.
 *   All — the review surface, in *time* order across the vault, for running
 *     into things again.
 *
 * They share a panel rather than taking two slots in the sidebar, because the
 * rendering is identical and only the question differs.
 */
// Named 'lens' rather than 'scope': View already has a `scope` (the keyboard
// scope), and shadowing it with a different type breaks the base class.
type Lens = 'file' | 'all';

export class ReviewView extends ItemView {
  private lens: Lens = 'file';
  private resurfaced: IndexEntry[] | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: AttentionPlugin) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE_REVIEW; }
  getDisplayText() { return 'Attention'; }
  getIcon() { return 'highlighter'; }

  async onOpen() {
    console.log('[attention] panel opened');
    this.registerEvent(this.app.workspace.on('file-open', () => { void this.render(); }));
    await this.render();
  }

  /** Re-render. Safe to call from anywhere; it reads current state itself. */
  async render(): Promise<void> {
    const root = this.contentEl;
    console.log('[attention] panel render, lens =', this.lens);
    root.empty();
    root.addClass('at-review');

    this.renderHeader(root);

    if (this.resurfaced) {
      for (const e of this.resurfaced) this.renderEntry(root, e.annotation, e.targetPath);
      return;
    }

    if (this.lens === 'file') await this.renderFile(root);
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
  }

  // ── This note ──────────────────────────────────────────────────────────────

  private async renderFile(root: HTMLElement): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      this.empty(root, 'No note open.');
      return;
    }

    const data = await this.plugin.store.get(file.path);
    if (data.annotations.length === 0) {
      this.empty(root, `Nothing marked in “${file.basename}”.`);
      return;
    }

    // An outline follows the document, not the order things were made in.
    const ordered = await inDocumentOrder(this.app, file, data.annotations);
    root.createDiv('at-bucket-title').setText(`${ordered.length} in this note`);
    for (const a of ordered) this.renderEntry(root, a, file.path);
  }

  // ── All ────────────────────────────────────────────────────────────────────

  private renderAll(root: HTMLElement): void {
    const buckets = this.plugin.index.buckets();
    const total = this.plugin.index.all().length;

    if (total === 0) {
      this.empty(root, 'Nothing marked yet. Select text in a note to highlight it.');
      return;
    }

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
    el.setCssProps({ '--at-color': annotation.color });

    el.createDiv('at-quote').setText(annotation.anchor.quote);
    if (isComment(annotation)) {
      el.createDiv('at-body').setText(annotation.body ?? '');
    }

    // In the per-note outline the filename is noise — it's the same every time.
    if (this.lens === 'all' || this.resurfaced) {
      const meta = el.createDiv('at-meta');
      meta.createSpan({ text: targetPath.split('/').pop() ?? targetPath, cls: 'at-source' });
      if (annotation.anchor.kind === 'transcript') {
        meta.createSpan({ text: fmtTime(annotation.anchor.start), cls: 'at-time' });
      }
    }

    el.addEventListener('click', () => { void this.open(annotation, targetPath); });
  }

  private async open(annotation: Annotation, targetPath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof TFile)) return;

    await revealInMarkdown(this.app, file, annotation);
    // Marking it seen is what makes "prefer things you haven't revisited" work.
    await this.plugin.markReviewed({ targetPath, annotation });
  }
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
