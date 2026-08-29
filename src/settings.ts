import { App, PluginSettingTab, Setting } from 'obsidian';
import type AttentionPlugin from './main';
import { formatWhen, TIME_FORMAT_EXAMPLES } from './ui/time';
import { ViewModePreference, ViewModeSettings } from './viewMode';

export interface AttentionSettings extends ViewModeSettings {
  /**
   * The one colour marks are drawn in. Per-annotation colours were dropped:
   * choosing between five swatches every time is a decision the act of
   * marking shouldn't require, and how often a passage caught you carries
   * more than which shade you happened to pick.
   */
  markColor: string;

  /**
   * How a mark is drawn. Underline by default: marks are meant to be many, a
   * page full of filled blocks is unreadable, and a background fill looks
   * exactly like Obsidian's own ==highlight== — the one thing that most needs
   * telling apart, since that syntax lives in the note and these don't.
   */
  markStyle: 'underline' | 'background';

  /**
   * How timestamps are shown: a moment format string. Empty falls back to
   * relative ("3 days ago"), which is locale-aware.
   */
  timeFormat: string;

  /**
   * Pop the colour swatches up as soon as a selection is made. The right-click
   * menu works regardless — it only ever appends to Obsidian's own menu — so
   * this is purely about whether capture also happens without asking.
   */
  popoverOnSelection: boolean;

  /** Annotate markdown files (needs the CodeMirror layer). */
  enableMarkdownHost: boolean;
  /** Annotate the Media Transcript plugin's transcript panel. */
  enableTranscriptHost: boolean;

  /**
   * Count how often a transcript segment gets replayed. Implicit attention —
   * denser than highlights but more personal, so it's off unless asked for.
   */
  trackReplays: boolean;

  /** Reveal the panel when opening a note that has annotations. */
  autoRevealPanel: boolean;

  /** How many annotations the review view resurfaces at a time. */
  resurfaceCount: number;

  /** Keep the sidecar when its target file is deleted (recoverable mistakes). */
  keepOrphanedSidecars: boolean;
}

export const DEFAULT_SETTINGS: AttentionSettings = {
  markColor: '#f5c542',
  markStyle: 'underline',
  timeFormat: 'YYYY-MM-DD HH:mm:ss',
  popoverOnSelection: true,
  enableMarkdownHost: true,
  enableTranscriptHost: true,
  trackReplays: false,
  autoRevealPanel: true,
  resurfaceCount: 10,
  keepOrphanedSidecars: true,
  // Off by default: deciding how someone's notes open is not this plugin's
  // business until they ask for it.
  forceViewMode: false,
  defaultViewMode: 'reading',
  folderViewModes: [],
};

const MODE_LABELS: Record<ViewModePreference, string> = {
  reading: 'Reading',
  live: 'Editing (Live Preview)',
  source: 'Editing (source)',
  default: "Leave alone (Obsidian's own default)",
};

export class AttentionSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AttentionPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Appearance').setHeading();

    new Setting(containerEl)
      .setName('Mark colour')
      .setDesc('Marks share one colour. A passage marked more than once is drawn more strongly.')
      .addColorPicker(c =>
        c.setValue(this.plugin.settings.markColor).onChange(async v => {
          this.plugin.settings.markColor = v;
          await this.plugin.saveSettings();
          this.plugin.applyMarkColor();
        }),
      );

    const sample = new Date().toISOString();
    const timeSetting = new Setting(containerEl)
      .setName('Time format')
      .addText(t =>
        t
          .setPlaceholder('Empty = relative')
          .setValue(this.plugin.settings.timeFormat)
          .onChange(async v => {
            this.plugin.settings.timeFormat = v.trim();
            await this.plugin.saveSettings();
            describeTime();
            this.plugin.refreshPanels();
          }),
      );
    const describeTime = () => {
      const f = this.plugin.settings.timeFormat;
      timeSetting.setDesc(
        `Shown as: ${formatWhen(sample, f)}. ` +
          (f
            ? 'A moment format string — the same vocabulary as daily note filenames. ' +
              'Clear it for relative times ("3 days ago"), in your Obsidian\'s language.'
            : `Relative, and in your Obsidian's language. For an exact time, try ${TIME_FORMAT_EXAMPLES.join(' / ')}.`),
      );
    };
    describeTime();

    new Setting(containerEl).setName('Where to annotate').setHeading();

    new Setting(containerEl)
      .setName('Markdown notes')
      .setDesc('Highlight and comment inside notes. The note itself is never modified.')
      .addToggle(t =>
        t.setValue(this.plugin.settings.enableMarkdownHost).onChange(async v => {
          this.plugin.settings.enableMarkdownHost = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Transcripts')
      .setDesc(
        'Highlight and comment on transcript lines in the Media Transcript plugin. ' +
          'Has no effect if that plugin is not installed.',
      )
      .addToggle(t =>
        t.setValue(this.plugin.settings.enableTranscriptHost).onChange(async v => {
          this.plugin.settings.enableTranscriptHost = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Mark style')
      .setDesc(
        'How highlights are drawn. Underline keeps a heavily-marked note readable and ' +
          "is easy to tell apart from Obsidian's own ==highlight== syntax. Annotations " +
          'carrying a comment always get a little more weight.',
      )
      .addDropdown(d =>
        d
          .addOption('underline', 'Underline')
          .addOption('background', 'Background')
          .setValue(this.plugin.settings.markStyle)
          .onChange(async v => {
            this.plugin.settings.markStyle = v as 'underline' | 'background';
            await this.plugin.saveSettings();
            this.plugin.applyMarkStyle();
          }),
      );

    new Setting(containerEl)
      .setName('Show swatches on selection')
      .setDesc(
        'Pop up the colour swatches as soon as you select text. Turn this off to capture ' +
          'only from the right-click menu, which stays available either way.',
      )
      .addToggle(t =>
        t.setValue(this.plugin.settings.popoverOnSelection).onChange(async v => {
          this.plugin.settings.popoverOnSelection = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName('How notes open').setHeading();

    new Setting(containerEl)
      .setName('Open notes in reading mode')
      .setDesc(
        'Marks live in a sidecar, so reading mode costs nothing — you can highlight and ' +
          'comment without leaving it, and the note stops inviting stray keystrokes. ' +
          'This is not read-only: Ctrl+E still switches to editing, and the mode is only ' +
          'set when a note is opened, so it stays put once you do.',
      )
      .addToggle(t =>
        t.setValue(this.plugin.settings.forceViewMode).onChange(async v => {
          this.plugin.settings.forceViewMode = v;
          await this.plugin.saveSettings();
          this.plugin.applyViewModes();
          this.display();
        }),
      );

    if (this.plugin.settings.forceViewMode) {
      new Setting(containerEl)
        .setName('Everything else opens as')
        .setDesc('Used for any note no exception below covers.')
        .addDropdown(d =>
          d
            .addOptions(MODE_LABELS)
            .setValue(this.plugin.settings.defaultViewMode)
            .onChange(async v => {
              this.plugin.settings.defaultViewMode = v as ViewModePreference;
              await this.plugin.saveSettings();
              this.plugin.applyViewModes();
            }),
        );

      new Setting(containerEl)
        .setName('Exceptions by folder')
        .setDesc(
          'Folders that open differently — somewhere you write rather than read. ' +
            'The deepest matching folder wins. A note can always overrule both with ' +
            'obsidianUIMode: preview (or source) in its frontmatter.',
        )
        .addButton(b =>
          b.setButtonText('Add folder').setCta().onClick(async () => {
            this.plugin.settings.folderViewModes.push({ folder: '', mode: 'live' });
            await this.plugin.saveSettings();
            this.display();
          }),
        );

      this.plugin.settings.folderViewModes.forEach((rule, i) => {
        new Setting(containerEl)
          .setClass('at-folder-rule')
          .addText(t =>
            t
              .setPlaceholder('folder/path')
              .setValue(rule.folder)
              .onChange(async v => {
                rule.folder = v;
                await this.plugin.saveSettings();
              }),
          )
          .addDropdown(d =>
            d
              .addOptions(MODE_LABELS)
              .setValue(rule.mode)
              .onChange(async v => {
                rule.mode = v as ViewModePreference;
                await this.plugin.saveSettings();
                this.plugin.applyViewModes();
              }),
          )
          .addExtraButton(b =>
            b.setIcon('trash-2').setTooltip('Remove').onClick(async () => {
              this.plugin.settings.folderViewModes.splice(i, 1);
              await this.plugin.saveSettings();
              this.display();
            }),
          );
      });
    }

    new Setting(containerEl).setName('Review').setHeading();

    new Setting(containerEl)
      .setName('Open the panel for annotated notes')
      .setDesc(
        'Reveal the Attention panel when you open a note that has annotations, and leave it ' +
          'alone otherwise. Focus stays in the note either way.',
      )
      .addToggle(t =>
        t.setValue(this.plugin.settings.autoRevealPanel).onChange(async v => {
          this.plugin.settings.autoRevealPanel = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Resurface count')
      .setDesc('How many annotations to bring back at a time, preferring ones you have not revisited.')
      .addSlider(s =>
        s.setLimits(3, 50, 1)
          .setValue(this.plugin.settings.resurfaceCount)
          .onChange(async v => {
            this.plugin.settings.resurfaceCount = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName('Advanced').setHeading();

    new Setting(containerEl)
      .setName('Count replays')
      .setDesc(
        'Record how often you replay a transcript segment. A weaker signal than a highlight, ' +
          'but a much denser one — useful for spotting what actually held your attention.',
      )
      .addToggle(t =>
        t.setValue(this.plugin.settings.trackReplays).onChange(async v => {
          this.plugin.settings.trackReplays = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Keep annotations when a file is deleted')
      .setDesc('Leaves the .anno.json behind so annotations survive an accidental delete.')
      .addToggle(t =>
        t.setValue(this.plugin.settings.keepOrphanedSidecars).onChange(async v => {
          this.plugin.settings.keepOrphanedSidecars = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Rebuild index')
      .setDesc('Rescan every sidecar in the vault. Safe to run any time — the index is derived data.')
      .addButton(b =>
        b.setButtonText('Rebuild').onClick(async () => {
          await this.plugin.rebuildIndex();
        }),
      );
  }
}
