import { describe, expect, it } from 'vitest';
import { intersect, lineOf, lineStarts, rangeOfLines } from '../src/anchor/lines';

const NOTE = ['---', 'title: x', '---', '', '第一段。', '', '第二段。', ''].join('\n');
const STARTS = lineStarts(NOTE);

describe('lineStarts', () => {
  it('begins at zero and has one entry per line', () => {
    expect(STARTS[0]).toBe(0);
    expect(STARTS).toHaveLength(NOTE.split('\n').length);
  });

  it('points just past each newline', () => {
    expect(NOTE.slice(STARTS[4], STARTS[4] + 4)).toBe('第一段。');
  });

  it('handles a source with no newlines at all', () => {
    expect(lineStarts('一行而已')).toEqual([0]);
  });
});

describe('lineOf', () => {
  it('finds the line an offset is on', () => {
    expect(lineOf(STARTS, NOTE.indexOf('第一段'))).toBe(4);
    expect(lineOf(STARTS, NOTE.indexOf('第二段'))).toBe(6);
  });

  it('puts the very first character on line zero', () => {
    expect(lineOf(STARTS, 0)).toBe(0);
  });

  it('puts a newline itself on the line it ends', () => {
    expect(lineOf(STARTS, NOTE.indexOf('\n'))).toBe(0);
  });
});

describe('rangeOfLines', () => {
  it('covers exactly the lines asked for', () => {
    const r = rangeOfLines(NOTE, STARTS, 4, 4);
    expect(NOTE.slice(r.from, r.to)).toBe('第一段。\n');
  });

  it('covers several lines together', () => {
    const r = rangeOfLines(NOTE, STARTS, 4, 6);
    expect(NOTE.slice(r.from, r.to)).toBe('第一段。\n\n第二段。\n');
  });

  it('runs to the end of the file for the last line', () => {
    const r = rangeOfLines(NOTE, STARTS, 7, 7);
    expect(r.to).toBe(NOTE.length);
  });

  it('clamps a line number past the end', () => {
    expect(rangeOfLines(NOTE, STARTS, 99, 99).to).toBe(NOTE.length);
  });
});

describe('intersect', () => {
  it('gives the overlapping part', () => {
    expect(intersect({ from: 0, to: 10 }, { from: 4, to: 20 })).toEqual({ from: 4, to: 10 });
  });

  it('is null when they only touch', () => {
    expect(intersect({ from: 0, to: 10 }, { from: 10, to: 20 })).toBeNull();
  });

  it('is null when they are apart', () => {
    expect(intersect({ from: 0, to: 5 }, { from: 9, to: 20 })).toBeNull();
  });
});
