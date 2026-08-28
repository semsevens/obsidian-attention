import { describe, it, expect } from 'vitest';
import { resolveMarkdown } from '../src/anchor/resolveAnchor';
import { describe as makeAnchor } from '../src/anchor/textQuote';
import { MarkdownAnchor } from '../src/model';

const anchorOn = (text: string, quote: string): MarkdownAnchor => {
  const at = text.indexOf(quote);
  return { kind: 'markdown', ...makeAnchor(text, at, at + quote.length) };
};

describe('resolveMarkdown', () => {
  it('resolves text the ordinary way', () => {
    const text = '第一段：注意力是稀缺资源。';
    const a = anchorOn(text, '注意力是稀缺资源');
    expect(resolveMarkdown(text, a)?.how).toBe('exact');
  });

  it('still gives up on text that is genuinely gone', () => {
    const a = anchorOn('第一段：注意力是稀缺资源。', '注意力是稀缺资源');
    expect(resolveMarkdown('完全不同的内容', a)).toBeNull();
  });
});

describe('an image whose embed was rewritten by another plugin', () => {
  // A tool that caches remote pictures locally turns the URL into a vault
  // embed. The stored quote then exists nowhere in the file, and every image
  // mark in the note would be orphaned at once — but the caption around the
  // picture is untouched, and that is enough to find it again.
  const BEFORE = [
    '# 标题', '',
    '引言段落。', '',
    '![图片](https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg)题图：晚霞 | 摄影：金吒', '',
    '正文继续。', '',
  ].join('\n');

  const AFTER = BEFORE.replace(
    '![图片](https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg)',
    '![[attachments/cached-640.jpeg]]',
  );

  const at = BEFORE.indexOf('![图片](');
  const anchor: MarkdownAnchor = {
    kind: 'markdown',
    ...makeAnchor(BEFORE, at, at + '![图片](https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg)'.length),
  };

  it('is exact before the rewrite', () => {
    expect(resolveMarkdown(BEFORE, anchor)?.how).toBe('exact');
  });

  it('finds the replacement embed by the caption that follows it', () => {
    const r = resolveMarkdown(AFTER, anchor);
    expect(r).not.toBeNull();
    expect(AFTER.slice(r!.from, r!.to)).toBe('![[attachments/cached-640.jpeg]]');
    expect(r!.how).toBe('context');
  });

  it('reports the mark lost when the picture is removed outright', () => {
    const gone = BEFORE.replace('![图片](https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg)', '');
    expect(resolveMarkdown(gone, anchor)).toBeNull();
  });

  it('does not wander to a different picture elsewhere in the note', () => {
    // Same rewrite, but the caption is gone too — nothing pins it down, so it
    // must not silently land on the other image.
    const other = AFTER.replace('题图：晚霞 | 摄影：金吒', '').replace('引言段落。', '![[other.png]]别的说明');
    const r = resolveMarkdown(other, anchor);
    if (r) expect(other.slice(r.from, r.to)).not.toBe('![[other.png]]');
  });
});
