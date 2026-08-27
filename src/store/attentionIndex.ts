import { App } from 'obsidian';
import { Annotation } from '../model';
import { isSidecarPath, targetPathFor, loadSidecar } from './sidecar';

/**
 * A flat, time-ordered view over every annotation in the vault.
 *
 * Sidecars are the source of truth, but they are organised by *file* and review
 * asks questions organised by *time* ("what did I mark this week?"). Rather
 * than distort the storage format for the query, we keep a derived index.
 *
 * It is deliberately disposable: it lives in the plugin's own data folder, is
 * never synced, and can be thrown away and rebuilt by rescanning the vault.
 */
export interface IndexEntry {
  targetPath: string;
  annotation: Annotation;
}

export type Bucket = 'today' | 'week' | 'month' | 'older';

export class AttentionIndex {
  private entries: IndexEntry[] = [];

  constructor(private app: App) {}

  /** Rescan every sidecar in the vault. Cheap enough to run on load. */
  async rebuild(): Promise<void> {
    const next: IndexEntry[] = [];
    for (const file of this.app.vault.getFiles()) {
      if (!isSidecarPath(file.path)) continue;
      const targetPath = targetPathFor(file.path);
      if (!targetPath) continue;
      const data = await loadSidecar(this.app, targetPath);
      for (const annotation of data.annotations) {
        next.push({ targetPath, annotation });
      }
    }
    next.sort((a, b) => b.annotation.created.localeCompare(a.annotation.created));
    this.entries = next;
  }

  /** Replace one file's entries in place (after an edit, without a full scan). */
  replaceFile(targetPath: string, annotations: Annotation[]): void {
    this.entries = this.entries.filter(e => e.targetPath !== targetPath);
    for (const annotation of annotations) this.entries.push({ targetPath, annotation });
    this.entries.sort((a, b) => b.annotation.created.localeCompare(a.annotation.created));
  }

  /** Follow a rename so the index doesn't point at a path that's gone. */
  renameFile(oldPath: string, newPath: string): void {
    for (const e of this.entries) {
      if (e.targetPath === oldPath) e.targetPath = newPath;
    }
  }

  all(): readonly IndexEntry[] {
    return this.entries;
  }

  /**
   * Group by age. Deliberately *not* a spaced-repetition schedule: the goal is
   * to run into these again, not to memorise them, so there's nothing to grade
   * and no interval to compute.
   */
  buckets(now = Date.now()): Record<Bucket, IndexEntry[]> {
    const DAY = 86_400_000;
    const out: Record<Bucket, IndexEntry[]> = { today: [], week: [], month: [], older: [] };
    for (const e of this.entries) {
      const age = now - Date.parse(e.annotation.created);
      if (age < DAY) out.today.push(e);
      else if (age < 7 * DAY) out.week.push(e);
      else if (age < 30 * DAY) out.month.push(e);
      else out.older.push(e);
    }
    return out;
  }

  /**
   * `n` entries to resurface, biased towards things you haven't seen since you
   * marked them. Caller supplies the randomness so this stays testable.
   */
  resurface(n: number, rand: () => number): IndexEntry[] {
    const pool = [...this.entries].sort((a, b) => {
      const seen = a.annotation.reviewed.length - b.annotation.reviewed.length;
      if (seen !== 0) return seen;
      return rand() - 0.5;
    });
    return pool.slice(0, n);
  }
}
