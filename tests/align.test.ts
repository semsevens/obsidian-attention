import { describe, it, expect } from 'vitest';
import { align, diffPairs } from '../src/anchor/align';

/** Map the rendered substring `sel` (first occurrence) back onto the source. */
function sourceOf(rendered: string, source: string, sel: string): string {
  const a = align(rendered, source)!;
  const at = rendered.indexOf(sel);
  return source.slice(a.start(at), a.end(at + sel.length));
}

describe('diffPairs', () => {
  it('pairs every character of a subsequence', () => {
    const p = diffPairs('ace', 'abcde')!;
    expect(Array.from(p)).toEqual([0, 2, 4]);
  });

  it('pairs what it can and skips the rest', () => {
    const p = diffPairs('a1c', 'abc')!;
    expect(Array.from(p)).toEqual([0, -1, 2]);
  });

  it('handles empty sides', () => {
    expect(Array.from(diffPairs('', 'abc')!)).toEqual([]);
    expect(Array.from(diffPairs('ab', '')!)).toEqual([-1, -1]);
  });
});

describe('align', () => {
  it('maps plain text one to one', () => {
    const s = '当时乔尔·格林布拉特（Joel Greenblatt）在对话里反复讲一件事。\n';
    expect(sourceOf(s.trim(), s, '（Joel Greenblatt）')).toBe('（Joel Greenblatt）');
  });

  it('steps over markup the screen does not show', () => {
    const src = '这是 **加粗** 和 [链接](https://example.com/example) 还有 `code_x`。\n';
    const rendered = '这是 加粗 和 链接 还有 code_x。';
    expect(sourceOf(rendered, src, '加粗 和 链接')).toBe('加粗** 和 [链接');
    expect(sourceOf(rendered, src, 'code_x')).toBe('code_x');
  });

  it('survives what the projection gets wrong', () => {
    // Entities and a table's pipes are not projected away; the diff copes.
    const src = '| A &amp; B | C |\n|---|---|\n| 一 | 二 |\n';
    const rendered = 'A & BC一二';
    expect(sourceOf(rendered, src, '一二')).toBe('一 | 二');
    expect(sourceOf(rendered, src, 'B')).toBe('B');
  });

  it('maps an edge on an unpaired character to its neighbours', () => {
    // A list number is drawn by the browser; the source's number differs.
    const a = align('1.项目', '3. 项目\n')!;
    expect(a.start(0)).toBe(3);
  });

  it('refuses a block whose source is some other paragraph', () => {
    expect(align('完全不同的一段话', '另外一个段落的内容\n')).toBeNull();
  });

  it('gives up on text that has nothing to do with the source', () => {
    const big = 'x'.repeat(3000);
    expect(align(big, 'y'.repeat(3000))).toBeNull();
  });
});
