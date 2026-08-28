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

  it('copes with an empty list', () => {
    expect(classify([], TEXT)).toEqual({ live: [], lost: [] });
  });

  it('does not cry lost when the text could not be read', () => {
    // An editor that has just opened hands back an empty buffer for a moment.
    // Declaring every mark in the file lost on that basis is a false alarm
    // about the one thing this must not get wrong.
    const { live, lost } = classify([md('反向传播')], '');
    expect(live).toHaveLength(1);
    expect(lost).toEqual([]);
  });
});

describe('classify across the versions of a file that disagree', () => {
  // The editor's buffer and the file on disk are rarely identical: the buffer
  // leads while you type, and lags while a view switches files — for a moment
  // it still holds the note you came from. A mark is lost only if no version
  // has it; anything less announces that a whole file's marks are gone.
  const OTHER = '完全是另一篇笔记的内容。';

  it('keeps a mark the buffer has but disk does not (unsaved edit)', () => {
    const a = md('注意力是稀缺资源');
    const { live, lost } = classify([a], TEXT, '旧版本没有这句话。');
    expect(live).toHaveLength(1);
    expect(lost).toEqual([]);
  });

  it('keeps a mark disk has but the buffer does not (stale buffer)', () => {
    // The exact shape of the bug: clicking a panel entry jumps to another
    // note, and the panel renders while the editor still holds the old one.
    const a = md('注意力是稀缺资源');
    const { live, lost } = classify([a], OTHER, TEXT);
    expect(live).toHaveLength(1);
    expect(lost).toEqual([]);
  });

  it('reports lost only when no version has it', () => {
    const a = md('注意力是稀缺资源');
    const { live, lost } = classify([a], OTHER, '另一段也没有的文字。');
    expect(live).toEqual([]);
    expect(lost).toHaveLength(1);
  });

  it('ignores versions that could not be read', () => {
    const a = md('注意力是稀缺资源');
    expect(classify([a], '', TEXT).live).toHaveLength(1);
    expect(classify([a], TEXT, '').live).toHaveLength(1);
    expect(classify([a], '', '').live).toHaveLength(1);
  });

  it('still works when given a single version', () => {
    expect(classify([md('注意力是稀缺资源')], TEXT).live).toHaveLength(1);
    expect(classify([md('注意力是稀缺资源')], OTHER).lost).toHaveLength(1);
  });
});
