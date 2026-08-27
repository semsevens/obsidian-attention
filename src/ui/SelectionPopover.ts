/**
 * The little toolbar that appears over a selection.
 *
 * Deliberately dumb: it knows how to show itself near a rectangle and which
 * callbacks to fire. Deciding what a selection *means* is the host's job.
 */
export interface PopoverActions {
  onHighlight(color: string): void;
  onComment(): void;
  onRemove?(): void;
}

export class SelectionPopover {
  private el: HTMLElement | null = null;
  private dismiss = () => this.hide();

  constructor(private colors: string[]) {}

  showAt(rect: DOMRect, actions: PopoverActions): void {
    this.hide();

    const el = document.createElement('div');
    el.className = 'at-popover';

    for (const color of this.colors) {
      const swatch = el.createEl('button', { cls: 'at-swatch' });
      swatch.style.background = color;
      swatch.setAttribute('aria-label', `Highlight ${color}`);
      swatch.addEventListener('mousedown', e => {
        // mousedown, not click: clicking would clear the selection first.
        e.preventDefault();
        actions.onHighlight(color);
        this.hide();
      });
    }

    const comment = el.createEl('button', { cls: 'at-pop-btn', text: '💬' });
    comment.setAttribute('aria-label', 'Add a comment');
    comment.addEventListener('mousedown', e => {
      e.preventDefault();
      actions.onComment();
      this.hide();
    });

    if (actions.onRemove) {
      const remove = el.createEl('button', { cls: 'at-pop-btn', text: '✕' });
      remove.setAttribute('aria-label', 'Remove highlight');
      remove.addEventListener('mousedown', e => {
        e.preventDefault();
        actions.onRemove?.();
        this.hide();
      });
    }

    document.body.appendChild(el);
    this.el = el;

    // Centre above the selection, kept inside the window.
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    const above = rect.top - height - 8;
    el.style.left = `${left}px`;
    el.style.top = `${above < 8 ? rect.bottom + 8 : above}px`;

    // Defer so the mouseup that opened us doesn't immediately close us.
    window.setTimeout(() => {
      document.addEventListener('mousedown', this.dismiss);
      document.addEventListener('keydown', this.dismiss);
    }, 0);
  }

  hide(): void {
    document.removeEventListener('mousedown', this.dismiss);
    document.removeEventListener('keydown', this.dismiss);
    this.el?.remove();
    this.el = null;
  }
}
