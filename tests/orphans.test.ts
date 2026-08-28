import { describe, it, expect } from 'vitest';
import { classify } from '../src/store/orphans';
import { describe as makeAnchor } from '../src/anchor/textQuote';
import { Annotation, Anchor } from '../src/model';

const TEXT = '第一段：注意力是稀缺资源。\n第二段：反向传播不需要保存激活。';

const mark = (id: string, anchor: Anchor): Annotation =>
  ({ id, anchor, body: null, hits: ['2026-01-01T00:00:00Z'], reviewed: [] });

const md = (quote: string): Annotation => {
  const at = TEXT.indexOf(quote);
  return mark(quote, { kind: 'markdown', ...makeAnchor(TEXT, at, at + quote.length) });
};

describe('classify', () => {
  it('keeps marks that still resolve', () => {
    const { live, lost } = classify([md('注意力是稀缺资源'), md('反向传播')], TEXT);
    expect(live).toHaveLength(2);
    expect(lost).toEqual([]);
  });

  it('separates a mark whose passage was edited away', () => {
    const gone = md('反向传播');
    const edited = '第一段：注意力是稀缺资源。\n第二段：完全换了内容。';
    const { live, lost } = classify([md('注意力是稀缺资源'), gone], edited);
    expect(live.map(a => a.id)).toEqual(['注意力是稀缺资源']);
    expect(lost.map(a => a.id)).toEqual(['反向传播']);
  });

  it('keeps a lost mark intact rather than discarding it', () => {
    // The quote and the times it caught you are the whole reason to keep it.
    const gone = md('反向传播');
    const { lost } = classify([gone], 'nothing of the sort');
    expect(lost[0].anchor.quote).toBe('反向传播');
    expect(lost[0].hits).toEqual(['2026-01-01T00:00:00Z']);
  });

  it('does not judge transcript marks, which resolve against a track', () => {
    const t = mark('t', {
      kind: 'transcript', quote: 'x', prefix: '', suffix: '',
      track: 'a.json', seg: 1, start: 0, charStart: 0, charEnd: 1,
    });
    const { live, lost } = classify([t], 'unrelated markdown');
    expect(live).toHaveLength(1);
    expect(lost).toEqual([]);
  });

  it('copes with an empty file and an empty list', () => {
    expect(classify([], TEXT)).toEqual({ live: [], lost: [] });
    expect(classify([md('反向传播')], '').lost).toHaveLength(1);
  });
});
