import { describe, it, expect } from 'vitest';
import { mapRange, reanchor, anchorsDiffer, Change } from '../src/anchor/repair';
import { describe as makeAnchor } from '../src/anchor/textQuote';
import { MarkdownAnchor } from '../src/model';

/** An edit replacing text[from,to) with `inserted`. */
const edit = (from: number, to: number, inserted: string): Change =>
  ({ fromA: from, toA: to, fromB: from, toB: from + inserted.length });

describe('mapRange', () => {
  it('shifts a range when text is inserted before it', () => {
    // "hello WORLD" — mark WORLD at 6..11, then insert 3 chars at the start.
    expect(mapRange(6, 11, [edit(0, 0, 'xxx')])).toEqual({ from: 9, to: 14 });
  });

  it('pulls a range back when text before it is deleted', () => {
    expect(mapRange(9, 14, [edit(0, 3, '')])).toEqual({ from: 6, to: 11 });
  });

  it('leaves a range alone when the edit is after it', () => {
    expect(mapRange(0, 5, [edit(20, 20, 'later')])).toEqual({ from: 0, to: 5 });
  });

  it('grows when text is typed inside the marked passage', () => {
    // This is the case searching for the old text can never handle: the marked
    // words themselves changed, so the stored quote no longer exists.
    expect(mapRange(6, 11, [edit(8, 8, 'AAA')])).toEqual({ from: 6, to: 14 });
  });

  it('shrinks when text inside is deleted', () => {
    expect(mapRange(6, 14, [edit(8, 11, '')])).toEqual({ from: 6, to: 11 });
  });

  it('survives an edit overlapping one end', () => {
    const r = mapRange(6, 11, [edit(9, 13, '')])!;
    expect(r.from).toBe(6);
    expect(r.to).toBeLessThanOrEqual(9);
    expect(r.to).toBeGreaterThan(r.from);
  });

  it('reports the range gone when it is deleted outright', () => {
    expect(mapRange(6, 11, [edit(0, 20, '')])).toBeNull();
  });

  it('reports it gone when the whole passage is replaced', () => {
    // Following the replacement would leave the mark sitting on words nobody
    // marked, looking for all the world like it survived the edit.
    expect(mapRange(6, 11, [edit(6, 11, 'something else entirely')])).toBeNull();
    expect(mapRange(6, 11, [edit(4, 15, 'wider replacement')])).toBeNull();
  });

  it('applies several changes in order', () => {
    expect(mapRange(10, 15, [edit(0, 0, 'ab'), edit(0, 0, 'cd')])).toEqual({ from: 14, to: 19 });
  });

  it('handles no changes at all', () => {
    expect(mapRange(3, 8, [])).toEqual({ from: 3, to: 8 });
  });
});

describe('reanchor', () => {
  it('re-reads the quote from where the range now points', () => {
    const text = '前言。所以这里的反向传播并不需要额外显存。';
    const before = { kind: 'markdown', ...makeAnchor(text, 8, 12) } as MarkdownAnchor;
    expect(before.quote).toBe('反向传播');

    // The passage was edited in place; mapping widened the range.
    const edited = '前言。所以这里的反向传播算法并不需要额外显存。';
    const after = reanchor(before, edited, { from: 8, to: 14 });
    expect(after.quote).toBe('反向传播算法');
    expect(after.prefix).toBe('前言。所以这里的');
  });
});

describe('anchorsDiffer', () => {
  const text = 'The quick brown fox';
  const base = { kind: 'markdown', ...makeAnchor(text, 4, 9) } as MarkdownAnchor;

  it('is false for an unchanged anchor, so nothing is written', () => {
    expect(anchorsDiffer(base, { ...base })).toBe(false);
  });

  it('is true once a position or the text moved', () => {
    expect(anchorsDiffer(base, { ...base, from: 5 })).toBe(true);
    expect(anchorsDiffer(base, { ...base, quote: 'other' })).toBe(true);
    expect(anchorsDiffer(base, { ...base, suffix: 'different' })).toBe(true);
  });
});
