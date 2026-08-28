import { describe, it, expect } from 'vitest';
import {
  findImageEmbeds, imageTargetOf, isImageQuote, imageMatches, embedBySurroundings,
} from '../src/anchor/imageAnchor';
import { project } from '../src/anchor/plainText';

describe('findImageEmbeds', () => {
  it('finds a vault embed and a markdown image', () => {
    const src = 'text ![[photo.png]] more ![图片](https://x.test/a.jpg) end';
    const found = findImageEmbeds(src);
    expect(found.map(e => e.target)).toEqual(['photo.png', 'https://x.test/a.jpg']);
    expect(src.slice(found[0].from, found[0].to)).toBe('![[photo.png]]');
    expect(src.slice(found[1].from, found[1].to)).toBe('![图片](https://x.test/a.jpg)');
  });

  it('reads the URL out of a clipped image with query junk on it', () => {
    // The shape that turns up in saved articles.
    const src = '![图片](https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg&tp=webp#imgIndex=0)题图：晚霞';
    const [e] = findImageEmbeds(src);
    expect(e.target).toBe('https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg&tp=webp#imgIndex=0');
    expect(src.slice(e.to)).toBe('题图：晚霞');
  });

  it('drops the display options after a pipe', () => {
    // `![[photo.png|300]]` is how everyone resizes a picture; the size is not
    // part of what the embed points at, and keeping it matched nothing.
    expect(findImageEmbeds('![[photo.png|300]]')[0].target).toBe('photo.png');
    expect(findImageEmbeds('![[a/b/photo.png|left|200]]')[0].target).toBe('a/b/photo.png');
    // The quote still keeps the embed exactly as written.
    expect(findImageEmbeds('![[photo.png|300]]')[0].text).toBe('![[photo.png|300]]');
  });

  it('decodes a percent-encoded markdown path', () => {
    const [e] = findImageEmbeds('![alt](%E7%A5%A8%E5%9C%88/attachments/a.png)');
    expect(e.target).toBe('票圈/attachments/a.png');
  });

  it('leaves a URL that will not decode alone', () => {
    expect(findImageEmbeds('![x](https://x.test/%E0%A4.png)')[0].target)
      .toBe('https://x.test/%E0%A4.png');
  });

  it('ignores a transcluded note, which is written like an image embed', () => {
    // `![[some note]]` embeds a note. Counting it as an image meant marking
    // anything inside a transclusion anchored to the whole embed.
    expect(findImageEmbeds('![[raw/x/2026-08-26 Russell - 万字长文]]')).toEqual([]);
    expect(findImageEmbeds('![[另一篇笔记.md]]')).toEqual([]);
    expect(findImageEmbeds('![[Excalidraw/图.md#^abc]]')).toEqual([]);
    // …but a picture with the same syntax still counts.
    expect(findImageEmbeds('![[photo.png]]')).toHaveLength(1);
    expect(findImageEmbeds('![[a/b/图.jpeg|300]]')).toHaveLength(1);
  });

  it('trusts markdown image syntax without an extension', () => {
    // Remote images very often have no extension in the path.
    expect(findImageEmbeds('![](https://mmbiz.qpic.cn/a/640?wx_fmt=jpeg)')).toHaveLength(1);
  });

  it('ignores links, which are not embeds', () => {
    expect(findImageEmbeds('see [the docs](https://x.test) and [[a note]]')).toEqual([]);
  });

  it('finds several in order', () => {
    const found = findImageEmbeds('![[a.png]]\n\n![[b.png]]\n\n![[c.png]]');
    expect(found.map(e => e.target)).toEqual(['a.png', 'b.png', 'c.png']);
    expect(found[0].from).toBeLessThan(found[1].from);
  });
});

describe('imageTargetOf', () => {
  it('recognises a quote that is exactly one embed', () => {
    expect(imageTargetOf('![[photo.png]]')).toBe('photo.png');
    expect(imageTargetOf('![alt](https://x.test/a.jpg)')).toBe('https://x.test/a.jpg');
    expect(isImageQuote('![[photo.png]]')).toBe(true);
  });

  it('rejects ordinary text and text that merely contains an embed', () => {
    expect(imageTargetOf('just some words')).toBeNull();
    expect(imageTargetOf('![[a.png]] and then words')).toBeNull();
    expect(isImageQuote('注意力是稀缺资源')).toBe(false);
  });
});

describe('imageMatches', () => {
  it('matches a vault embed against the app:// URL it renders as', () => {
    const src = 'app://abc123/Users/me/vault/attachments/photo%20one.png?1699999';
    expect(imageMatches(src, 'attachments/photo one.png')).toBe(true);
    expect(imageMatches(src, 'photo one.png')).toBe(true);
  });

  it('matches a remote image by its URL', () => {
    expect(imageMatches('https://x.test/a.jpg', 'https://x.test/a.jpg')).toBe(true);
  });

  it('does not match a different picture', () => {
    expect(imageMatches('app://abc/other.png', 'photo.png')).toBe(false);
    expect(imageMatches('', 'photo.png')).toBe(false);
    expect(imageMatches('app://abc/photo.png', '')).toBe(false);
  });

  it('survives a URL that will not decode', () => {
    expect(imageMatches('app://abc/%E0%A4%A.png', 'photo.png')).toBe(false);
  });
});

describe('embedBySurroundings', () => {
  // Matching on src fails whenever something rewrites it — a vault that caches
  // remote pictures locally serves an app:// path with no relation to the URL
  // in the note. Position is what survives.
  const SOURCE = [
    '# 标题', '',
    '![图片](https://a.test/one.jpg)题图：晚霞 | 摄影：金吒', '',
    '一段正文。', '',
    '![图片](https://a.test/two.png)说到做到。今天我就想说说。', '',
  ].join('\n');

  // Mirrors what the host passes in: the projection and its offset map.
  const plain = (src: string) => {
    const p = project(src);
    return { text: p.text, at: (i: number) => p.map[i] ?? 0 };
  };

  const embeds = findImageEmbeds(SOURCE);

  it('picks the embed a caption follows', () => {
    const p = plain(SOURCE);
    const found = embedBySurroundings(SOURCE, embeds, '', '说到做到。今天我就想说说。', p.at, p.text);
    expect(found?.target).toBe('https://a.test/two.png');
  });

  it('picks the first when its own caption follows it', () => {
    const p = plain(SOURCE);
    const found = embedBySurroundings(SOURCE, embeds, '', '题图：晚霞 | 摄影：金吒', p.at, p.text);
    expect(found?.target).toBe('https://a.test/one.jpg');
  });

  it('falls back to the text before when nothing follows', () => {
    const p = plain(SOURCE);
    const found = embedBySurroundings(SOURCE, embeds, '一段正文。', '', p.at, p.text);
    expect(found?.target).toBe('https://a.test/two.png');
  });

  it('needs no context at all when the note has one image', () => {
    const one = findImageEmbeds('![x](https://a.test/only.jpg)');
    const p = plain('![x](https://a.test/only.jpg)');
    expect(embedBySurroundings('![x](https://a.test/only.jpg)', one, '', '', p.at, p.text)?.target)
      .toBe('https://a.test/only.jpg');
  });

  it('gives up rather than guess when the context matches nothing', () => {
    const p = plain(SOURCE);
    expect(embedBySurroundings(SOURCE, embeds, '', '完全不存在的文字', p.at, p.text)).toBeNull();
  });
});
