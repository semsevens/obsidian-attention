import { describe, expect, it } from 'vitest';
import { planMove } from '../src/store/migrateToTrack';
import { Annotation } from '../src/model';

const mark = (id: string, track: string | undefined, kind = 'transcript'): Annotation =>
  ({
    id,
    anchor: kind === 'transcript'
      ? { kind: 'transcript', quote: 'x', prefix: '', suffix: '', track: track as string, seg: 1, start: 1, charStart: 0, charEnd: 1 }
      : { kind: 'markdown', quote: 'x', prefix: '', suffix: '', from: 0, to: 1 },
    hits: ['2026-01-01T00:00:00.000Z'],
    body: null,
    reviewed: [],
  } as Annotation);

describe('planMove', () => {
  it('sends a recording’s marks to the track they were read from', () => {
    const { moves, keep } = planMove('talk.m4a', [mark('a', 'talk.srt'), mark('b', 'talk.srt')]);
    expect(moves).toEqual([{ from: 'talk.m4a', to: 'talk.srt', annotations: [expect.any(Object), expect.any(Object)] }]);
    expect(moves[0].annotations.map(a => a.id)).toEqual(['a', 'b']);
    expect(keep).toEqual([]);
  });

  it('splits marks made against two different transcriptions', () => {
    const { moves } = planMove('talk.m4a', [mark('a', 'talk.srt'), mark('b', 'talk.whisper.json')]);
    expect(moves.map(m => m.to).sort()).toEqual(['talk.srt', 'talk.whisper.json']);
  });

  // A transcript generated on the fly names no file, and a mark with nowhere
  // to go is not improved by moving it somewhere arbitrary.
  it('leaves a mark with no track where it is', () => {
    const { moves, keep } = planMove('talk.m4a', [mark('a', undefined), mark('b', '  ')]);
    expect(moves).toEqual([]);
    expect(keep.map(a => a.id)).toEqual(['a', 'b']);
  });

  it('leaves a mark already filed under its own track', () => {
    const { moves, keep } = planMove('talk.srt', [mark('a', 'talk.srt')]);
    expect(moves).toEqual([]);
    expect(keep.map(a => a.id)).toEqual(['a']);
  });

  it('never moves a markdown mark', () => {
    const { moves, keep } = planMove('note.md', [mark('a', undefined, 'markdown')]);
    expect(moves).toEqual([]);
    expect(keep.map(a => a.id)).toEqual(['a']);
  });

  it('has nothing to do for an empty sidecar', () => {
    expect(planMove('talk.m4a', [])).toEqual({ moves: [], keep: [] });
  });
});
