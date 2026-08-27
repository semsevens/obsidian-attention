import { App } from 'obsidian';
import { Annotation, AnnotationFile } from '../model';
import { loadSidecar, saveSidecar } from './sidecar';
import { AttentionIndex } from './attentionIndex';

type Listener = (targetPath: string) => void;

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
    const loaded = await loadSidecar(this.app, targetPath);
    this.cache.set(targetPath, loaded);
    return loaded;
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

  async add(targetPath: string, annotation: Annotation): Promise<void> {
    const data = await this.get(targetPath);
    data.annotations.push(annotation);
    await this.commit(targetPath, data);
  }

  async update(
    targetPath: string,
    id: string,
    patch: Partial<Pick<Annotation, 'body' | 'color' | 'anchor'>>,
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
