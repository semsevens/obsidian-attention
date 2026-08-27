import { Plugin, TFile, TAbstractFile, WorkspaceLeaf, Notice } from 'obsidian';
import { AttentionSettings, DEFAULT_SETTINGS, AttentionSettingTab } from './settings';
import { AttentionIndex } from './store/attentionIndex';
import { IndexEntry } from './store/review';
import { ReviewView, VIEW_TYPE_REVIEW } from './views/ReviewView';
import {
  loadSidecar,
  saveSidecar,
  sidecarPathFor,
  isSidecarPath,
} from './store/sidecar';

export default class AttentionPlugin extends Plugin {
  settings!: AttentionSettings;
  index!: AttentionIndex;

  async onload() {
    await this.loadSettings();
    this.index = new AttentionIndex(this.app);

    this.registerView(VIEW_TYPE_REVIEW, leaf => new ReviewView(leaf, this));

    // Scanning every sidecar touches the whole file list, so wait until the
    // vault has finished indexing rather than fighting it during startup.
    this.app.workspace.onLayoutReady(() => { void this.rebuildIndex(); });

    this.addRibbonIcon('highlighter', 'Attention', () => { void this.openReview(); });

    this.addCommand({
      id: 'open-review',
      name: 'Open attention review',
      callback: () => { void this.openReview(); },
    });

    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      void this.handleRename(file, oldPath);
    }));

    this.registerEvent(this.app.vault.on('delete', file => {
      void this.handleDelete(file);
    }));

    this.addSettingTab(new AttentionSettingTab(this.app, this));
  }

  async rebuildIndex(): Promise<void> {
    await this.index.rebuild();
    this.refreshReviewViews();
  }

  /** Record that an annotation resurfaced, so future picks can prefer others. */
  async markReviewed(entry: IndexEntry): Promise<void> {
    const data = await loadSidecar(this.app, entry.targetPath);
    const target = data.annotations.find(a => a.id === entry.annotation.id);
    if (!target) return;
    target.reviewed.push(new Date().toISOString());
    await saveSidecar(this.app, data);
    this.index.replaceFile(entry.targetPath, data.annotations);
  }

  private async openReview(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf: WorkspaceLeaf | null = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_REVIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  private refreshReviewViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_REVIEW)) {
      if (leaf.view instanceof ReviewView) leaf.view.render();
    }
  }

  /**
   * Keep the sidecar beside its target. Folder moves need no work — the sidecar
   * is a sibling, so it travels with the folder — only a file's own rename does.
   */
  private async handleRename(file: TAbstractFile, oldPath: string): Promise<void> {
    if (!(file instanceof TFile) || isSidecarPath(file.path)) return;

    const old = this.app.vault.getAbstractFileByPath(sidecarPathFor(oldPath));
    if (!(old instanceof TFile)) return;

    const nextPath = sidecarPathFor(file.path);
    if (old.path === nextPath) return;

    try {
      await this.app.fileManager.renameFile(old, nextPath);
      // Re-stamp `target` inside the file so it doesn't disagree with its name.
      const data = await loadSidecar(this.app, file.path);
      await saveSidecar(this.app, data);
      this.index.renameFile(oldPath, file.path);
      this.refreshReviewViews();
    } catch (e) {
      new Notice(`Attention: could not move annotations for ${file.name}`);
      console.error(e);
    }
  }

  private async handleDelete(file: TAbstractFile): Promise<void> {
    if (!(file instanceof TFile) || isSidecarPath(file.path)) return;
    if (this.settings.keepOrphanedSidecars) return;

    const sidecar = this.app.vault.getAbstractFileByPath(sidecarPathFor(file.path));
    if (sidecar instanceof TFile) await this.app.fileManager.trashFile(sidecar);
    this.index.replaceFile(file.path, []);
    this.refreshReviewViews();
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<AttentionSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
