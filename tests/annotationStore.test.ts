import { describe, it, expect, vi } from 'vitest';
import { AnnotationStore } from '../src/store/annotationStore';
import { AttentionIndex } from '../src/store/attentionIndex';
import { Annotation } from '../src/model';
import { TFile, type App } from '../tests/stubs/obsidian';

function annotation(id: string): Annotation {
  return {
    id,
    anchor: { kind: 'markdown', from: 0, to: 3, quote: 'abc', prefix: '', suffix: '' },
    color: '#fff',
    body: null,
    created: '2026-08-27T00:00:00.000Z',
    reviewed: [],
  };
}

/** An in-memory vault holding one file's worth of sidecar JSON. */
function makeApp(files: Map<string, string>): App {
  return {
    vault: {
      getAbstractFileByPath: (path: string) => (files.has(path) ? new TFile(path) : null),
      read: async (file: TFile) => files.get(file.path) ?? '',
      modify: async (file: TFile, data: string) => { files.set(file.path, data); },
      create: async (path: string, data: string) => {
        files.set(path, data);
        return new TFile(path);
      },
      getFiles: () => [...files.keys()].map(p => new TFile(p)),
    },
    fileManager: {
      trashFile: async (file: TFile) => { files.delete(file.path); },
    },
  };
}

function sidecar(target: string, ...ids: string[]): string {
  return JSON.stringify({ version: 1, target, annotations: ids.map(annotation) });
}

describe('AnnotationStore.peek on a cold cache', () => {
  // Regression: peek() is what the renderers call, and it used to answer a
  // cache miss with an empty list *and leave it that way*. A note that was
  // already open when the plugin loaded — which is every note, on every hot
  // reload — therefore showed no highlights at all until you switched away
  // and back.
  it('returns empty at first, then loads and notifies', async () => {
    const files = new Map([['a.md.anno.json', sidecar('a.md', 'one', 'two')]]);
    const app = makeApp(files);
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));

    const notified = vi.fn();
    store.onChange(notified);

    expect(store.peek('a.md')).toEqual([]);

    await vi.waitFor(() => expect(notified).toHaveBeenCalledWith('a.md'));
    expect(store.peek('a.md')).toHaveLength(2);
  });

  it('coalesces repeated misses into a single load', async () => {
    const files = new Map([['a.md.anno.json', sidecar('a.md', 'one')]]);
    const app = makeApp(files);
    const read = vi.spyOn(app.vault, 'read');
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));

    store.peek('a.md');
    store.peek('a.md');
    store.peek('a.md');

    await vi.waitFor(() => expect(store.peek('a.md')).toHaveLength(1));
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('does not thrash on a file that genuinely has no sidecar', async () => {
    const app = makeApp(new Map());
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));

    expect(store.peek('missing.md')).toEqual([]);
    await vi.waitFor(() => expect(store.peek('missing.md')).toEqual([]));
    // Cached as empty, so the next paint doesn't queue another load.
    expect(store.peek('missing.md')).toEqual([]);
  });
});

describe('AnnotationStore writes', () => {
  it('adds, updates and removes through the sidecar', async () => {
    const files = new Map<string, string>();
    const app = makeApp(files);
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));

    await store.add('a.md', annotation('one'));
    expect(files.has('a.md.anno.json')).toBe(true);

    await store.update('a.md', 'one', { body: 'a note' });
    expect((await store.get('a.md')).annotations[0].body).toBe('a note');

    // Removing the last annotation clears the sidecar rather than leaving a husk.
    await store.remove('a.md', 'one');
    expect(files.has('a.md.anno.json')).toBe(false);
  });

  it('never writes to the annotated file itself', async () => {
    const files = new Map<string, string>([['a.md', '# the original']]);
    const app = makeApp(files);
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));

    await store.add('a.md', annotation('one'));
    await store.update('a.md', 'one', { body: 'hello' });
    await store.remove('a.md', 'one');

    expect(files.get('a.md')).toBe('# the original');
  });
});
