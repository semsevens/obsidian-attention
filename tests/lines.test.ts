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

// Offsets are UTF-16 code units, which is what the anchor stores and what
// `slice` uses — an emoji is two of them, a family emoji considerably more.
// Line arithmetic has to agree with that or a mark after one drifts.
describe('text that is not one code unit per character', () => {
  const NOTE = ['# 标题', '', '中文 English 🎯 混排', '', '👨‍👩‍👧‍👦 家庭', ''].join('\n');
  const starts = lineStarts(NOTE);

  it('counts lines the same way regardless of what is on them', () => {
    expect(starts).toHaveLength(6);
  });

  it('cuts a line containing an emoji at its real bounds', () => {
    const r = rangeOfLines(NOTE, starts, 2, 2);
    expect(NOTE.slice(r.from, r.to)).toBe('中文 English 🎯 混排\n');
  });

  it('cuts a line of multi-codepoint emoji whole', () => {
    const r = rangeOfLines(NOTE, starts, 4, 4);
    expect(NOTE.slice(r.from, r.to)).toBe('👨‍👩‍👧‍👦 家庭\n');
  });

  it('puts an offset inside an emoji on the line it is on', () => {
    const at = NOTE.indexOf('🎯');
    expect(lineOf(starts, at)).toBe(2);
    expect(lineOf(starts, at + 1)).toBe(2);
  });

  it('intersects ranges that begin mid-emoji without losing the line', () => {
    const line = rangeOfLines(NOTE, starts, 2, 2);
    const mark = { from: NOTE.indexOf('🎯'), to: NOTE.indexOf('混排') + 2 };
    const piece = intersect(mark, line)!;
    expect(NOTE.slice(piece.from, piece.to)).toBe('🎯 混排');
  });
});
