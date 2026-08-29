import { App, TFile } from 'obsidian';
import { Annotation, AnnotationFile, Anchor, newId, sameSpot } from '../model';
import { loadSidecar, saveSidecar } from './sidecar';
import { AttentionIndex } from './attentionIndex';
import { repairAnchor } from '../anchor/repairAnchors';

type Listener = (targetPath: string) => void;

/** Thrown when a mark would be filed under a note that does not contain it. */
export class WrongNoteError extends Error {
  constructor(readonly targetPath: string) {
    super(`Attention: that passage is not in ${targetPath}, so the mark was not saved.`);
    this.name = 'WrongNoteError';
  }
}

/**
 * The one place annotations are read and written.
 *
 * Everything goes through here so that a change lands in three places at once:
 * the sidecar on disk, the in-memory cache the hosts paint from, and the index
 * the review panel queries. Hosts never touch files.
 *
 * Note what this class cannot do: there is no code path here that writes to the
 * annotated file itself. That is the whole point — the original is never
 * modified, and it is a structural guarantee rather than a convention.
 */
export class AnnotationStore {
  private cache = new Map<string, AnnotationFile>();
  private listeners: Listener[] = [];
  /** Paths with a warm already in flight, so a miss can't spawn a stampede. */
  private warming = new Set<string>();

  constructor(private app: App, private index: AttentionIndex) {}

  /** Annotations for a file, from cache when we have it. */
  async get(targetPath: string): Promise<AnnotationFile> {
    const cached = this.cache.get(targetPath);
    if (cached) return cached;
    const loaded = await repairOnLoad(this.app, await loadSidecar(this.app, targetPath));
    this.cache.set(targetPath, loaded.data);
    this.index.replaceFile(targetPath, loaded.data.annotations);
    // Persisted straight away rather than waiting for the next edit: a repair
    // that only lives in memory has to be redone on every load, and the file
    // on disk keeps showing the broken quote to anything else that reads it.
    if (loaded.changed) await saveSidecar(this.app, loaded.data);
    return loaded.data;
  }

  /**
   * Synchronous read for render paths that can't await.
   *
   * A miss means a view is painting a file nobody has loaded yet — which used
   * to render as "this file has no annotations" and stay that way. So a miss
   * kicks off a load and notifies when it lands, turning a silent wrong answer
   * into a brief empty one.
   */
  peek(targetPath: string): readonly Annotation[] {
    const cached = this.cache.get(targetPath);
    if (cached) return cached.annotations;
    if (!this.warming.has(targetPath)) {
      this.warming.add(targetPath);
      void this.get(targetPath)
        .then(() => this.emit(targetPath))
        .finally(() => this.warming.delete(targetPath));
    }
    return [];
  }

  /** Load into the cache so a later peek() has something to paint. */
  async warm(targetPath: string): Promise<void> {
    await this.get(targetPath);
    this.emit(targetPath);
  }

  /**
   * Record that a passage caught you.
   *
   * Marking something already marked appends to its history instead of making a
   * second annotation. A line that moves you three times over a year is the
   * strongest thing this plugin can know about you, and deduplicating it away
   * would throw exactly that away.
   *
   * Returns the annotation and whether this was a fresh mark or a repeat, so
   * the caller can say so.
   */
  async mark(
    targetPath: string,
    anchor: Anchor,
    body: string | null,
  ): Promise<{ annotation: Annotation; repeat: boolean }> {
    await this.assertBelongs(targetPath, anchor);
    const data = await this.get(targetPath);
    const now = new Date().toISOString();

    const existing = data.annotations.find(a => sameSpot(a.anchor, anchor));
    if (existing) {
      existing.hits.push(now);
      // A comment added on a repeat shouldn't silently drop an earlier one.
      if (body) existing.body = existing.body ? `${existing.body}\n\n${body}` : body;
      existing.updated = now;
      await this.commit(targetPath, data);
      return { annotation: existing, repeat: true };
    }

    const annotation: Annotation = {
      id: newId(),
      anchor,
      hits: [now],
      body,
      reviewed: [],
    };
    data.annotations.push(annotation);
    await this.commit(targetPath, data);
    return { annotation, repeat: false };
  }

  /**
   * Record another hit on an annotation you already have in hand.
   *
   * Same effect as marking the passage again, but addressed by id — the review
   * panel is looking at the annotation, not at the text, and shouldn't have to
   * reconstruct an anchor to say "this still matters".
   */
  async markAgain(targetPath: string, id: string): Promise<Annotation | null> {
    const data = await this.get(targetPath);
    const target = data.annotations.find(a => a.id === id);
    if (!target) return null;
    const now = new Date().toISOString();
    target.hits.push(now);
    target.updated = now;
    await this.commit(targetPath, data);
    return target;
  }

  async add(targetPath: string, annotation: Annotation): Promise<void> {
    const data = await this.get(targetPath);
    data.annotations.push(annotation);
    await this.commit(targetPath, data);
  }

  async update(
    targetPath: string,
    id: string,
    patch: Partial<Pick<Annotation, 'body' | 'anchor'>>,
  ): Promise<void> {
    const data = await this.get(targetPath);
    const target = data.annotations.find(a => a.id === id);
    if (!target) return;
    Object.assign(target, patch, { updated: new Date().toISOString() });
    await this.commit(targetPath, data);
  }

  async remove(targetPath: string, id: string): Promise<void> {
    const data = await this.get(targetPath);
    const before = data.annotations.length;
    data.annotations = data.annotations.filter(a => a.id !== id);
    if (data.annotations.length === before) return;
    await this.commit(targetPath, data);
  }

  /** Drop a cache entry (after an external edit or a rename). */
  forget(targetPath: string): void {
    this.cache.delete(targetPath);
  }

  /**
   * Refuse to file a mark under a note that does not contain it.
   *
   * A markdown quote is cut out of a file's own source, so if it cannot be
   * found there again the mark is being filed against the wrong note — and a
   * mark in the wrong note is not a lesser mark, it is a lost one: it can
   * never resolve, so it shows up as lost in a file it was never about, while
   * the passage it was made on has nothing on it.
   *
   * The ways this has happened were all the same mistake in different clothes
   * — the note that was clicked in and the note that was active being taken
   * for the same thing. Each was fixed where it was found, but the fixes are
   * one per path and this is the invariant they were all trying to keep, so it
   * is checked here as well, where every path has to come through.
   */
  private async assertBelongs(targetPath: string, anchor: Anchor): Promise<void> {
    if (anchor.kind !== 'markdown') return;
    const file = this.app.vault.getAbstractFileByPath(targetPath);
    if (!(file instanceof TFile)) return;

    let source: string;
    try {
      source = await this.app.vault.cachedRead(file);
    } catch {
      return; // Unreadable is not the same as wrong.
    }
    if (source.includes(anchor.quote)) return;

    throw new WrongNoteError(targetPath);
  }

  private async commit(targetPath: string, data: AnnotationFile): Promise<void> {
    await saveSidecar(this.app, data);
    this.cache.set(targetPath, data);
    this.index.replaceFile(targetPath, data.annotations);
    this.emit(targetPath);
  }

  onChange(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(targetPath: string): void {
    for (const l of this.listeners) l(targetPath);
  }
}

/**
 * Read a sidecar's anchors through `repairAnchor` before anyone sees them.
 *
 * Silent when the annotated file cannot be read: no source means no way to
 * judge an anchor, and leaving it alone is the answer that loses nothing.
 */
async function repairOnLoad(
  app: App,
  data: AnnotationFile,
): Promise<{ data: AnnotationFile; changed: boolean }> {
  const file = app.vault.getAbstractFileByPath(data.target);
  if (!(file instanceof TFile) || data.annotations.length === 0) return { data, changed: false };

  let source: string;
  try {
    source = await app.vault.cachedRead(file);
  } catch {
    return { data, changed: false };
  }

  let changed = false;
  const annotations = data.annotations.map(a => {
    if (a.anchor.kind !== 'markdown') return a;
    const repaired = repairAnchor(source, a.anchor);
    if (!repaired) return a;
    changed = true;
    return { ...a, anchor: repaired };
  });

  return changed ? { data: { ...data, annotations }, changed } : { data, changed: false };
}
