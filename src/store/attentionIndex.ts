import { App } from 'obsidian';
import { Annotation } from '../model';
import { isSidecarPath, targetPathFor } from './paths';
import { loadSidecar } from './sidecar';
import { IndexEntry, Bucket, bucketize, pickResurface, byNewest } from './review';

export type { IndexEntry, Bucket };

/**
 * A flat, time-ordered view over every annotation in the vault.
 *
 * Sidecars are the source of truth, but they are organised by *file* and review
 * asks questions organised by *time* ("what did I mark this week?"). Rather
 * than distort the storage format for the query, we keep a derived index.
 *
 * It is deliberately disposable: it is never synced, and can be thrown away and
 * rebuilt by rescanning the vault.
 */
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
    next.sort(byNewest);
    this.entries = next;
  }

  /** Replace one file's entries in place (after an edit, without a full scan). */
  replaceFile(targetPath: string, annotations: Annotation[]): void {
    this.entries = this.entries.filter(e => e.targetPath !== targetPath);
    for (const annotation of annotations) this.entries.push({ targetPath, annotation });
    this.entries.sort(byNewest);
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

  buckets(now = Date.now()): Record<Bucket, IndexEntry[]> {
    return bucketize(this.entries, now);
  }

  resurface(n: number, rand: () => number): IndexEntry[] {
    return pickResurface(this.entries, n, rand);
  }
}
