import { App, Modal, Setting } from 'obsidian';

/** Prompt for an annotation's comment. Pre-filled when editing an existing one. */
export class CommentModal extends Modal {
  private value: string;

  constructor(
    app: App,
    private quote: string,
    initial: string,
    private onSubmit: (body: string) => void,
  ) {
    super(app);
    this.value = initial;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('at-comment-modal');
    contentEl.createDiv('at-comment-quote').setText(this.quote);

    const input = contentEl.createEl('textarea', { cls: 'at-comment-input' });
    input.value = this.value;
    input.placeholder = 'What caught your attention?';
    input.addEventListener('input', () => { this.value = input.value; });
    input.addEventListener('keydown', e => {
      // Cmd/Ctrl+Enter submits; plain Enter stays a newline.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.submit();
      }
    });

    new Setting(contentEl).addButton(b =>
      b.setButtonText('Save').setCta().onClick(() => this.submit()),
    );

    window.setTimeout(() => input.focus(), 0);
  }

  private submit(): void {
    this.onSubmit(this.value.trim());
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
