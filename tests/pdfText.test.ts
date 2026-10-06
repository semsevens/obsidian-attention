import { describe, it, expect } from 'vitest';
import { describePdf, pageText, resolveSpan, spanText, toOffsets, toSelection } from '../src/anchor/pdfText';
import { readable } from '../src/anchor/cjk';
import { sameSpot, PdfAnchor } from '../src/model';

// Items as pdf.js extracted them from the fixture PDF (fixtures/vault/注意力笔记.pdf),
// radicals and all.
const PAGE1 = [
  '注意⼒笔记：PDF 测试⽂档',
  '这份⽂档专⻔⽤来测试在 PDF ⾥做标注。它有三⻚，',
  '中英⽂混排，还有⼀句会重复出现的话。',
  '同⼀句话可以出现好⼏次：',
  '注意⼒是稀缺资源',
  '。第⼀次出现在这⾥。',
];
const PAGE2 = ['第⼆节 跨⻚', '第⼆⻚的开头。注意⼒是稀缺资源——这是第⼆次出现。'];

describe('offsets and selections', () => {
  it('reads a selection within one item and across several', () => {
    expect(spanText(PAGE1, [0, 0, 0, 3])).toBe('注意⼒');
    expect(spanText(PAGE1, [3, 6, 5, 1])).toBe('出现好⼏次：注意⼒是稀缺资源。');
  });

  it('takes an end offset of 0 as the end of the item before', () => {
    expect(spanText(PAGE1, [4, 0, 5, 0])).toBe('注意⼒是稀缺资源');
  });

  it('round-trips between selections and offsets', () => {
    for (const sel of [[0, 0, 0, 3], [3, 6, 5, 1], [1, 2, 2, 4]] as const) {
      const range = toOffsets(PAGE1, [...sel])!;
      expect(toSelection(PAGE1, range.from, range.to)).toEqual([...sel]);
    }
  });

  it('never ends a selection at offset 0 of the next item', () => {
    const at = pageText(PAGE1).indexOf('注意⼒是稀缺资源');
    expect(toSelection(PAGE1, at, at + 8)).toEqual([4, 0, 4, 8]);
  });

  it('refuses selections that do not fit', () => {
    expect(spanText(PAGE1, [0, 0, 9, 1])).toBeNull();
    expect(spanText(PAGE1, [2, 3, 1, 0])).toBeNull();
    expect(toSelection(PAGE1, 5, 5)).toBeNull();
  });
});

describe('describePdf', () => {
  it('quotes one page with context from that page', () => {
    const d = describePdf([{ page: 1, selection: [4, 0, 4, 8] }], new Map([[1, PAGE1]]))!;
    expect(d.quote).toBe('注意⼒是稀缺资源');
    expect(d.prefix.endsWith('可以出现好⼏次：')).toBe(true);
    expect(d.suffix.startsWith('。第⼀次')).toBe(true);
  });

  it('joins a passage across pages with a newline', () => {
    const d = describePdf(
      [{ page: 1, selection: [5, 1, 5, 10] }, { page: 2, selection: [0, 0, 0, 3] }],
      new Map([[1, PAGE1], [2, PAGE2]]),
    )!;
    expect(d.quote).toBe('第⼀次出现在这⾥。\n第⼆节');
    expect(d.suffix.startsWith(' 跨⻚')).toBe(true);
  });

  it('gives up when a page is missing', () => {
    expect(describePdf([{ page: 3, selection: [0, 0, 0, 1] }], new Map([[1, PAGE1]]))).toBeNull();
  });
});

describe('resolveSpan', () => {
  it('keeps a selection that still reads its quote', () => {
    const span = { page: 1, selection: [4, 0, 4, 8] as [number, number, number, number] };
    expect(resolveSpan(PAGE1, span, '注意⼒是稀缺资源', '', '')).toEqual([4, 0, 4, 8]);
  });

  it('finds the words again when the items were split differently', () => {
    // The same page re-exported: one item became two.
    const resplit = [...PAGE1.slice(0, 4), '注意⼒是', '稀缺资源', ...PAGE1.slice(5)];
    const span = { page: 1, selection: [4, 0, 4, 8] as [number, number, number, number] };
    const found = resolveSpan(resplit, span, '注意⼒是稀缺资源', '出现好⼏次：', '。第⼀次')!;
    expect(spanText(resplit, found)).toBe('注意⼒是稀缺资源');
  });
});

describe('sameSpot for PDFs', () => {
  const at = (page: number, bi: number, bo: number): PdfAnchor => ({
    kind: 'pdf', quote: '注意⼒是稀缺资源', prefix: '', suffix: '',
    spans: [{ page, selection: [bi, bo, bi, bo + 8] }],
  });
  it('is the same passage where it starts at the same place', () => {
    expect(sameSpot(at(1, 4, 0), at(1, 4, 0))).toBe(true);
  });
  it('is a different one on another page or elsewhere on the page', () => {
    expect(sameSpot(at(1, 4, 0), at(2, 4, 0))).toBe(false);
    expect(sameSpot(at(1, 4, 0), at(1, 6, 0))).toBe(false);
  });
});

describe('readable', () => {
  it('turns radicals standing in for characters back into characters', () => {
    expect(readable('注意⼒笔记：PDF 测试⽂档')).toBe('注意力笔记：PDF 测试文档');
    expect(readable('它有三⻚，⻓度')).toBe('它有三页，长度');
  });
  it('leaves ordinary text, full-width punctuation included, alone', () => {
    expect(readable('（括号）和 ABC，１２３')).toBe('（括号）和 ABC，１２３');
  });
});
