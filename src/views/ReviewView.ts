import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import type AttentionPlugin from '../main';
import { IndexEntry, Bucket } from '../store/attentionIndex';
import { isComment } from '../model';

export const VIEW_TYPE_REVIEW = 'attention-review';

const BUCKET_LABELS: Record<Bucket, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  older: 'Earlier',
};

/** The review surface: everything you marked, grouped by how long ago. */
export class ReviewView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: AttentionPlugin) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE_REVIEW; }
  getDisplayText() { return 'Attention'; }
  getIcon() { return 'highlighter'; }

  async onOpen() {
    this.render();
  }

  render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('at-review');

    const buckets = this.plugin.index.buckets();
    const total = this.plugin.index.all().length;

    const header = root.createDiv('at-review-header');
    header.createSpan({ text: `${total} marked`, cls: 'at-review-total' });
    const resurface = header.createEl('button', { text: 'Resurface', cls: 'at-btn' });
    resurface.addEventListener('click', () => this.renderResurfaced());

    if (total === 0) {
      root.createDiv('at-empty').setText(
        'Nothing marked yet. Select text in a note or a transcript to highlight it.',
      );
      return;
    }

    for (const key of ['today', 'week', 'month', 'older'] as Bucket[]) {
      const entries = buckets[key];
      if (entries.length === 0) continue;
      root.createDiv('at-bucket-title').setText(`${BUCKET_LABELS[key]} · ${entries.length}`);
      for (const entry of entries) this.renderEntry(root, entry);
    }
  }

  private renderResurfaced(): void {
    const n = this.plugin.settings.resurfaceCount;
    const picked = this.plugin.index.resurface(n, () => Math.random());
    const root = this.contentEl;
    root.empty();
    root.addClass('at-review');

    const header = root.createDiv('at-review-header');
    header.createSpan({ text: `${picked.length} resurfaced`, cls: 'at-review-total' });
    const back = header.createEl('button', { text: 'All', cls: 'at-btn' });
    back.addEventListener('click', () => this.render());

    for (const entry of picked) this.renderEntry(root, entry);
  }

  private renderEntry(root: HTMLElement, entry: IndexEntry): void {
    const { annotation, targetPath } = entry;
    const el = root.createDiv('at-entry');
    el.setCssProps({ '--at-color': annotation.color });

    el.createDiv('at-quote').setText(annotation.anchor.quote);
    if (isComment(annotation)) {
      el.createDiv('at-body').setText(annotation.body ?? '');
    }

    const meta = el.createDiv('at-meta');
    meta.createSpan({ text: targetPath.split('/').pop() ?? targetPath, cls: 'at-source' });
    if (annotation.anchor.kind === 'transcript') {
      meta.createSpan({ text: fmtTime(annotation.anchor.start), cls: 'at-time' });
    }

    el.addEventListener('click', () => { void this.open(entry); });
  }

  private async open(entry: IndexEntry): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(entry.targetPath);
    if (!(file instanceof TFile)) return;
    await this.app.workspace.getLeaf(false).openFile(file);
    // Marking it seen is what makes "prefer things you haven't revisited" work.
    await this.plugin.markReviewed(entry);
  }
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
