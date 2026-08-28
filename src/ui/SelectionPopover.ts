/**
 * The little bar that appears over a selection.
 *
 * Two actions, no palette. Picking a colour every time turns marking into a
 * decision, and what this plugin actually cares about — how often a passage
 * caught you — isn't something a swatch can say.
 */
export interface PopoverActions {
  onMark?(): void;
  onComment(): void;
  onMarkAgain?(): void;
  onRemove?(): void;
  /** Offered for pictures, where clicking would otherwise have zoomed. */
  onZoom?(): void;
}

export class SelectionPopover {
  private el: HTMLElement | null = null;
  private dismiss = () => this.hide();

  showAt(rect: DOMRect, actions: PopoverActions): void {
    this.hide();

    const el = document.createElement('div');
    el.className = 'at-popover';

    const add = (label: string, title: string, fn: () => void, cls = 'at-pop-btn') => {
      const b = el.createEl('button', { cls, text: label });
      b.setAttribute('aria-label', title);
      b.setAttribute('title', title);
      // mousedown, not click: clicking would clear the selection first.
      b.addEventListener('mousedown', e => {
        e.preventDefault();
        fn();
        this.hide();
      });
    };

    if (actions.onMark) add('Mark', 'Mark this', actions.onMark, 'at-pop-btn at-pop-mark');
    if (actions.onMarkAgain) add('＋', 'Mark again — it caught you once more', actions.onMarkAgain);
    add('💬', 'Add or edit a comment', actions.onComment);
    if (actions.onRemove) add('✕', 'Remove mark', actions.onRemove);
    if (actions.onZoom) add('🔍', 'Open the picture', actions.onZoom);

    document.body.appendChild(el);
    this.el = el;

    // Centre above the selection, kept inside the window.
    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    const above = rect.top - height - 8;
    el.setCssStyles({
      left: `${left}px`,
      top: `${above < 8 ? rect.bottom + 8 : above}px`,
    });

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
