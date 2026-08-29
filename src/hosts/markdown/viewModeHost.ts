import { App, MarkdownView, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { resolveViewMode, ViewModeSettings, ViewModeTarget } from '../../viewMode';

/**
 * Opens notes in the mode the settings ask for.
 *
 * Applied once per note per leaf, not on every activation. Forcing on every
 * `file-open` would mean pressing Ctrl+E to fix a typo, glancing at another
 * tab, and coming back to find the edit mode taken away again — the behaviour
 * the separate view-mode plugins need an "ignore open files" switch to escape.
 * Remembering what each leaf was already given is the same guarantee without
 * the setting: the mode is chosen when a note arrives, and after that the
 * reader is in charge.
 */
export class ViewModeHost {
  /** The path this leaf was last opened *at*, whether or not we changed it. */
  private applied = new WeakMap<WorkspaceLeaf, string>();

  constructor(
    private app: App,
    private plugin: Plugin,
    private settings: ViewModeSettings,
  ) {}

  register(): void {
    this.plugin.registerEvent(
      this.app.workspace.on('file-open', file => {
        if (file) this.apply(file);
      }),
    );
  }

  /**
   * Re-apply to every open note.
   *
   * For turning the feature on, or changing the rules, without having to
   * reopen anything to see what the change did.
   */
  applyToOpenNotes(): void {
    this.applied = new WeakMap();
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const file = leaf.view instanceof MarkdownView ? leaf.view.file : null;
      if (file) this.apply(file, leaf);
    }
  }

  /**
   * Obsidian finishes opening the file *after* this handler returns, and the
   * state it settles on overwrites anything set from inside the event. Waiting
   * a tick is not enough on its own either — the leaf can still be mid-open —
   * so the mode is set and then checked, and set again if the open undid it.
   */
  private apply(file: TFile, into?: WorkspaceLeaf): void {
    let attempts = 0;
    const attempt = () => {
      const leaves = into ? [into] : this.leavesShowing(file);
      for (const leaf of leaves) {
        if (this.applied.get(leaf) === file.path) continue;

        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const target = resolveViewMode(file.path, frontmatter, this.settings);
        if (!target) {
          // Nothing to force, but the leaf has still had its say for this note:
          // remember it so a later activation doesn't reconsider.
          this.applied.set(leaf, file.path);
          continue;
        }
        if (this.matches(leaf, target)) {
          this.applied.set(leaf, file.path);
          continue;
        }
        void this.setMode(leaf, target);
      }
      if (++attempts < 8) window.setTimeout(attempt, 40);
    };
    window.setTimeout(attempt, 0);
  }

  /** Every leaf showing this note — the same note can be open in two panes. */
  private leavesShowing(file: TFile): WorkspaceLeaf[] {
    return this.app.workspace
      .getLeavesOfType('markdown')
      .filter(leaf => leaf.view instanceof MarkdownView && leaf.view.file?.path === file.path);
  }

  private matches(leaf: WorkspaceLeaf, target: ViewModeTarget): boolean {
    const state = leaf.getViewState().state;
    return state?.mode === target.mode && state?.source === target.source;
  }

  /** `setViewState` rebuilds the view, so callers check `matches` first. */
  private async setMode(leaf: WorkspaceLeaf, target: ViewModeTarget): Promise<void> {
    const state = leaf.getViewState();
    const current = state.state;
    if (!current) return;

    current.mode = target.mode;
    current.source = target.source;
    await leaf.setViewState(state);
  }
}
