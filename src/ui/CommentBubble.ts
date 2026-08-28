import { Annotation } from '../model';
import { formatWhen } from './time';
import { asEl } from '../dom';

/**
 * What you get when you click a mark: its comment, when it caught you, and the
 * things you might do to it.
 *
 * The history is the point. A passage you marked three times over a year says
 * something a single date can't, so every hit is listed rather than collapsed
 * into a count.
 */
export interface BubbleActions {
  onEdit: () => void;
  onMarkAgain: () => void;
  onRemove: () => void;
}

export class CommentBubble {
  private el: HTMLElement | null = null;

  constructor(private timeFormat = '') {}

  private dismiss = (e: Event) => {
    if (this.el?.contains(asEl(e.target))) return;
    this.hide();
  };

  showFor(rect: DOMRect, annotation: Annotation, actions: BubbleActions): void {
    this.hide();

    const el = createDiv({ cls: 'at-bubble' });

    const body = annotation.body;
    if (body && body.trim().length > 0) el.createDiv('at-bubble-body').setText(body);
    else el.createDiv('at-bubble-empty').setText('No comment yet.');

    const hits = annotation.hits;
    const times = el.createDiv('at-bubble-hits');
    times.createSpan({ cls: 'at-hit-count', text: hits.length === 1 ? 'Marked once' : `Marked ${hits.length}×` });
    // Newest first: the most recent time it landed is the one you're asking about.
    for (const at of [...hits].reverse()) {
      times.createDiv('at-hit-time').setText(formatWhen(at, this.timeFormat));
    }

    const row = el.createDiv('at-bubble-actions');
    const add = (label: string, fn: () => void, warn = false) => {
      const b = row.createEl('button', { cls: 'at-pop-btn', text: label });
      if (warn) b.addClass('mod-warning');
      b.addEventListener('click', () => { fn(); this.hide(); });
    };
    add(body ? 'Edit' : 'Comment', actions.onEdit);
    add('Mark again', actions.onMarkAgain);
    add('Remove', actions.onRemove, true);

    document.body.appendChild(el);
    this.el = el;

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

