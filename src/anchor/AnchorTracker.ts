import { MarkdownAnchor } from '../model';
import { AnnotationStore } from '../store/annotationStore';
import { Change, mapRange, reanchor, anchorsDiffer } from './repair';
import { resolve } from './textQuote';

/** Wait this long after typing stops before writing anchors back. */
const SETTLE_MS = 800;

/**
 * Keeps anchors pointing at the right words as a note is edited.
 *
 * While a note is open, CodeMirror reports exactly what changed, so anchors are
 * *carried* through the edit rather than searched for afterwards. That is the
 * difference between adapting and guessing: mapping survives edits inside the
 * marked passage itself, where the stored text no longer exists to search for.
 *
 * Writes are debounced — an anchor moves on every keystroke, and the sidecar
 * should not.
 */
export class AnchorTracker {
  private pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private store: AnnotationStore) {}

  /** A note changed in the editor. */
  onEdit(path: string, changes: readonly Change[], text: string): void {
    if (changes.length === 0) return;

    const annotations = this.store.peek(path);
    if (annotations.length === 0) return;

    const next = new Map<string, MarkdownAnchor>();
    for (const a of annotations) {
      if (a.anchor.kind !== 'markdown') continue;
      const at = mapRange(a.anchor.from, a.anchor.to, changes);
      // Gone: leave the anchor as it was so a later search can still try. An
      // orphan that kept its last known text can be re-found; one we overwrote
      // cannot.
      if (!at) continue;
      const updated = reanchor(a.anchor, text, at);
      if (anchorsDiffer(a.anchor, updated)) next.set(a.id, updated);
    }

    if (next.size > 0) this.schedule(path, next);
  }

  /**
   * A render found an anchor somewhere other than where it was stored.
   *
   * Writing that back means the next read takes the exact-offset path instead
   * of searching the document again, every time, forever.
   */
  noteResolved(path: string, id: string, anchor: MarkdownAnchor, text: string, at: { from: number; to: number }): void {
    const updated = reanchor(anchor, text, at);
    if (anchorsDiffer(anchor, updated)) this.schedule(path, new Map([[id, updated]]));
  }

  private schedule(path: string, updates: Map<string, MarkdownAnchor>): void {
    const existing = this.pending.get(path);
    if (existing) clearTimeout(existing);
    this.pending.set(path, setTimeout(() => {
      this.pending.delete(path);
      void this.flush(path, updates);
    }, SETTLE_MS));
  }

  private async flush(path: string, updates: Map<string, MarkdownAnchor>): Promise<void> {
    for (const [id, anchor] of updates) {
      await this.store.update(path, id, { anchor });
    }
  }

  dispose(): void {
    for (const t of this.pending.values()) clearTimeout(t);
    this.pending.clear();
  }
}

export { resolve };
