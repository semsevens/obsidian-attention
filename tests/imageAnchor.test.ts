import { describe, it, expect } from 'vitest';
import {
  findImageEmbeds, imageTargetOf, isImageQuote, imageMatches,
} from '../src/anchor/imageAnchor';

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
