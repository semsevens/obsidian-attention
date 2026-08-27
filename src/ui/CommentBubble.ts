/**
 * What you get when you click a highlight: its comment, and the three things
 * you might want to do to it.
 *
 * Separate from SelectionPopover because it reads rather than creates — the
 * comment body is the point, the buttons are secondary.
 */
export interface BubbleActions {
  onEdit(): void;
  onRecolour(): void;
  onRemove(): void;
}

export class CommentBubble {
  private el: HTMLElement | null = null;
  private dismiss = (e: Event) => {
    // Clicking inside the bubble shouldn't close it.
    if (e.target instanceof Node && this.el?.contains(e.target)) return;
    this.hide();
  };

  showFor(rect: DOMRect, body: string | null, actions: BubbleActions): void {
    this.hide();

    const el = document.createElement('div');
    el.className = 'at-bubble';

    if (body && body.trim().length > 0) {
      el.createDiv('at-bubble-body').setText(body);
    } else {
      el.createDiv('at-bubble-empty').setText('No comment yet.');
    }

    const row = el.createDiv('at-bubble-actions');
    const add = (label: string, fn: () => void, warn = false) => {
      const b = row.createEl('button', { cls: 'at-pop-btn', text: label });
      if (warn) b.addClass('mod-warning');
      b.addEventListener('click', () => {
        fn();
        this.hide();
      });
    };
    add(body ? 'Edit' : 'Comment', actions.onEdit);
    add('Colour', actions.onRecolour);
    add('Remove', actions.onRemove, true);

    document.body.appendChild(el);
    this.el = el;

    const { width, height } = el.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, rect.left + rect.width / 2 - width / 2),
      window.innerWidth - width - 8,
    );
    const above = rect.top - height - 8;
    el.style.left = `${left}px`;
    el.style.top = `${above < 8 ? rect.bottom + 8 : above}px`;

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
