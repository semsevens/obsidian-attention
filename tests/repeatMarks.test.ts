import { describe, it, expect } from 'vitest';
import { AnnotationStore } from '../src/store/annotationStore';
import { AttentionIndex } from '../src/store/attentionIndex';
import { normalize, sameSpot, lastMarked, firstMarked, Anchor, Annotation } from '../src/model';
import { bucketize } from '../src/store/review';
import { TFile, type App } from './stubs/obsidian';

function makeApp(files: Map<string, string>): App {
  return {
    vault: {
      getAbstractFileByPath: (p: string) => (files.has(p) ? new TFile(p) : null),
      read: async (f: TFile) => files.get(f.path) ?? '',
      modify: async (f: TFile, d: string) => { files.set(f.path, d); },
      create: async (p: string, d: string) => { files.set(p, d); return new TFile(p); },
      getFiles: () => [...files.keys()].map(p => new TFile(p)),
    },
    fileManager: {
      trashFile: async (file: TFile) => { files.delete(file.path); },
    },
  };
}

const md = (quote: string, from: number, to: number): Anchor =>
  ({ kind: 'markdown', quote, prefix: '', suffix: '', from, to });

describe('marking the same passage again', () => {
  // The whole point: a line that moves you three times over a year says more
  // than three separate marks would, and deduplicating it away loses exactly
  // the signal this plugin exists to keep.
  it('appends to the history instead of making a second annotation', async () => {
    const files = new Map<string, string>();
    const app = makeApp(files);
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));

    const first = await store.mark('a.md', md('attention', 10, 19), null);
    expect(first.repeat).toBe(false);
    expect(first.annotation.hits).toHaveLength(1);

    const second = await store.mark('a.md', md('attention', 10, 19), null);
    expect(second.repeat).toBe(true);
    expect(second.annotation.id).toBe(first.annotation.id);
    expect(second.annotation.hits).toHaveLength(2);

    expect((await store.get('a.md')).annotations).toHaveLength(1);
  });

  it('keeps both comments when a repeat carries one', async () => {
    const app = makeApp(new Map());
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));

    await store.mark('a.md', md('x', 0, 1), 'first thought');
    const { annotation } = await store.mark('a.md', md('x', 0, 1), 'second thought');
    expect(annotation.body).toContain('first thought');
    expect(annotation.body).toContain('second thought');
  });

  it('treats a different passage as a different annotation', async () => {
    const app = makeApp(new Map());
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));

    await store.mark('a.md', md('attention', 10, 19), null);
    const other = await store.mark('a.md', md('elsewhere', 50, 59), null);
    expect(other.repeat).toBe(false);
    expect((await store.get('a.md')).annotations).toHaveLength(2);
  });
});

describe('sameSpot', () => {
  it('matches overlapping ranges, since offsets drift as a file is edited', () => {
    expect(sameSpot(md('x', 10, 20), md('x', 12, 22))).toBe(true);
    expect(sameSpot(md('x', 10, 20), md('x', 30, 40))).toBe(false);
  });

  it('requires the same text', () => {
    expect(sameSpot(md('x', 10, 20), md('y', 10, 20))).toBe(false);
  });

  it('matches a transcript line by segment or by time', () => {
    const t = (seg: number, start: number): Anchor =>
      ({ kind: 'transcript', quote: 'q', prefix: '', suffix: '', track: 'a', seg, start, charStart: 0, charEnd: 1 });
    expect(sameSpot(t(3, 10), t(3, 10))).toBe(true);
    expect(sameSpot(t(3, 10), t(9, 10.2))).toBe(true);   // re-segmented, same moment
    expect(sameSpot(t(3, 10), t(9, 40))).toBe(false);
  });

  it('never matches across hosts', () => {
    const t: Anchor = { kind: 'transcript', quote: 'x', prefix: '', suffix: '', track: 'a', seg: 1, start: 0, charStart: 0, charEnd: 1 };
    expect(sameSpot(md('x', 0, 1), t)).toBe(false);
  });
});

describe('annotations written by older versions', () => {
  it('gains a history from its created date', () => {
    const old = { id: 'a', anchor: md('x', 0, 1), body: null, reviewed: [],
                  created: '2026-01-01T00:00:00.000Z' } as unknown as Annotation;
    const fixed = normalize(old);
    expect(fixed.hits).toEqual(['2026-01-01T00:00:00.000Z']);
    expect(firstMarked(fixed)).toBe('2026-01-01T00:00:00.000Z');
  });

  it('leaves an already-current annotation alone', () => {
    const current: Annotation = { id: 'a', anchor: md('x', 0, 1), body: null, reviewed: [], hits: ['2026-05-05T00:00:00.000Z'] };
    expect(normalize(current)).toBe(current);
  });
});

describe('bucketing uses the most recent hit', () => {
  it('puts a long-ago passage marked again today in today', () => {
    const now = Date.parse('2026-08-27T12:00:00.000Z');
    const annotation: Annotation = {
      id: 'a', anchor: md('x', 0, 1), body: null, reviewed: [],
      hits: ['2025-01-01T00:00:00.000Z', '2026-08-27T09:00:00.000Z'],
    };
    expect(firstMarked(annotation).startsWith('2025')).toBe(true);
    const b = bucketize([{ targetPath: 'a.md', annotation }], now);
    expect(b.today).toHaveLength(1);
    expect(b.older).toHaveLength(0);
    expect(lastMarked(annotation).startsWith('2026-08-27')).toBe(true);
  });
});

describe('marking again from a list', () => {
  it('adds a hit without needing the anchor rebuilt', async () => {
    const app = makeApp(new Map());
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));
    const { annotation } = await store.mark('a.md', md('x', 0, 1), null);

    const again = await store.markAgain('a.md', annotation.id);
    expect(again?.hits).toHaveLength(2);
    expect((await store.get('a.md')).annotations).toHaveLength(1);
  });

  it('answers null for an id that is gone', async () => {
    const app = makeApp(new Map());
    const store = new AnnotationStore(app as never, new AttentionIndex(app as never));
    expect(await store.markAgain('a.md', 'nope')).toBeNull();
  });
});
