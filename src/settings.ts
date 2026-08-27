import { App, PluginSettingTab, Setting } from 'obsidian';
import type AttentionPlugin from './main';

export interface AttentionSettings {
  /** Highlight colours offered in the capture popover. */
  colors: string[];
  defaultColor: string;

  /**
   * How a mark is drawn. Underline by default: marks are meant to be many, a
   * page full of filled blocks is unreadable, and a background fill looks
   * exactly like Obsidian's own ==highlight== — the one thing that most needs
   * telling apart, since that syntax lives in the note and these don't.
   */
  markStyle: 'underline' | 'background';

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
  colors: ['#f5c542', '#7ec96b', '#63b3ed', '#e879a6', '#b794f4'],
  defaultColor: '#f5c542',
  markStyle: 'underline',
  popoverOnSelection: true,
  enableMarkdownHost: true,
  enableTranscriptHost: true,
  trackReplays: false,
  autoRevealPanel: true,
  resurfaceCount: 10,
  keepOrphanedSidecars: true,
};

export class AttentionSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AttentionPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

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
