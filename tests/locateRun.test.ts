import { describe, expect, it } from 'vitest';
import { blocksOf, locateRun } from '../src/hosts/locateRun';

// The mark that reported this: four paragraphs, stored with the blank lines
// between them, drawn into a DOM that has none.
const QUOTE = [
  '有一次我和南添老师一起讨论企业家，他说过一段话我印象深刻。',
  '他认为好的企业家的决策会引发两个「我靠」。',
  '初听这个决策的反应：「我靠，他怎么这么傻，这么做决定？」',
].join('\n\n');

describe('blocksOf', () => {
  it('splits a quote on its blank lines', () => {
    expect(blocksOf(QUOTE)).toHaveLength(3);
  });

  it('leaves a single-block quote as one piece', () => {
    expect(blocksOf('一句话而已。')).toEqual(['一句话而已。']);
  });

  it('drops indentation a list or quote block carries', () => {
    expect(blocksOf('  第一段\n\n\t第二段  ')).toEqual(['第一段', '第二段']);
  });

  it('has nothing to look for in whitespace', () => {
    expect(blocksOf('\n\n  \n')).toEqual([]);
  });
});

describe('locateRun', () => {
  const flat = '开头' + blocksOf(QUOTE).join('') + '结尾';

  it('finds every block, run together as the DOM has them', () => {
    const at = locateRun(flat, blocksOf(QUOTE));
    expect(at).toHaveLength(3);
    expect(at![0]).toBe(2);
  });

  it('keeps the blocks in order', () => {
    const at = locateRun(flat, blocksOf(QUOTE))!;
    expect(at[1]).toBeGreaterThan(at[0]);
    expect(at[2]).toBeGreaterThan(at[1]);
  });

  // Three of four somewhere in the note is not the passage that was marked.
  it('answers null when a block is missing', () => {
    expect(locateRun('开头' + blocksOf(QUOTE)[0] + '结尾', blocksOf(QUOTE))).toBeNull();
  });

  it('answers null when the blocks appear out of order', () => {
    const [a, b] = blocksOf(QUOTE);
    expect(locateRun(b + a, [a, b])).toBeNull();
  });

  it('starts looking where it is told, so a second run can be found', () => {
    const twice = flat + flat;
    const first = locateRun(twice, blocksOf(QUOTE))!;
    const second = locateRun(twice, blocksOf(QUOTE), first[2] + 1)!;
    expect(second[0]).toBeGreaterThan(first[0]);
  });

  it('has nothing to find for an empty quote', () => {
    expect(locateRun(flat, [])).toBeNull();
  });
});
