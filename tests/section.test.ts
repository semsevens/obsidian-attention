import { describe, expect, it } from 'vitest';
import { LINES_ATTR, blockAround, linesOf, sourceRangeOf } from '../src/hosts/markdown/section';

// A stand-in for a rendered block: the attribute is all these read.
function block(lines: string | null, parent: Element | null = null): Element {
  const el: Partial<Element> & { parentNode: Node | null } = {
    parentNode: parent,
    getAttribute: (name: string) => (name === LINES_ATTR ? lines : null),
    closest: (sel: string) => {
      for (let at: Element | null = el as Element; at; at = at.parentNode as Element | null) {
        if (sel === `[${LINES_ATTR}]` && at.getAttribute?.(LINES_ATTR)) return at;
      }
      return null;
    },
  };
  return el as Element;
}

const NOTE = ['---', 'title: x', '---', '', '第一段。', '', '第二段。'].join('\n');

describe('linesOf', () => {
  it('reads the range a block records', () => {
    expect(linesOf(block('4,4'))).toEqual({ start: 4, end: 4 });
  });

  it('is null for a block that records nothing', () => {
    expect(linesOf(block(null))).toBeNull();
    expect(linesOf(null)).toBeNull();
  });

  it('is null for a range that is not numbers', () => {
    expect(linesOf(block('a,b'))).toBeNull();
    expect(linesOf(block('4'))).toBeNull();
  });
});

describe('blockAround', () => {
  it('finds the block a node sits in', () => {
    const outer = block('4,4');
    const inner = block(null, outer);
    expect(blockAround(inner)).toBe(outer);
  });

  it('finds the block itself', () => {
    const el = block('6,6');
    expect(blockAround(el)).toBe(el);
  });

  it('is null outside any block', () => {
    expect(blockAround(block(null))).toBeNull();
    expect(blockAround(null)).toBeNull();
  });
});

describe('sourceRangeOf', () => {
  it('gives the part of the source that block renders', () => {
    const r = sourceRangeOf(NOTE, block('4,4'))!;
    expect(NOTE.slice(r.from, r.to)).toBe('第一段。\n');
  });

  it('covers a block spanning several lines', () => {
    const r = sourceRangeOf(NOTE, block('4,6'))!;
    expect(NOTE.slice(r.from, r.to)).toBe('第一段。\n\n第二段。');
  });

  it('is null for a block with no range', () => {
    expect(sourceRangeOf(NOTE, block(null))).toBeNull();
  });
});
