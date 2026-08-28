import { describe, it, expect } from 'vitest';
import { project, strip, toSource } from '../src/anchor/plainText';

/** Every projected character must point at the source character it came from. */
function mapIsConsistent(source: string): boolean {
  const p = project(source);
  return p.text.split('').every((ch, i) => source[p.map[i]] === ch);
}

describe('project', () => {
  it('unwraps emphasis, strong, highlight, strike and code', () => {
    expect(strip('a **b** c')).toBe('a b c');
    expect(strip('a *b* c')).toBe('a b c');
    expect(strip('a ==b== c')).toBe('a b c');
    expect(strip('a ~~b~~ c')).toBe('a b c');
    expect(strip('a `b` c')).toBe('a b c');
    expect(strip('a ***b*** c')).toBe('a b c');
  });

  it('keeps a link label and drops its target', () => {
    expect(strip('see [the docs](https://example.com) now')).toBe('see the docs now');
  });

  it('drops images entirely, as the rendered text does', () => {
    // This note pattern is common in clipped articles: image then text, one line.
    expect(strip('![图片](https://x.test/a.png#imgIndex=0)题图：晚霞')).toBe('题图：晚霞');
  });

  it('leaves plain text exactly as it was', () => {
    expect(strip('第一段：注意力是稀缺资源。')).toBe('第一段：注意力是稀缺资源。');
  });

  it('keeps the offset map honest', () => {
    for (const src of [
      'a **b** c',
      'see [the docs](https://example.com) now',
      '![图片](https://x.test/a.png)题图：晚霞 | 摄影：金吒',
      '**加粗**中间*斜体*和 `代码` 与 ==高亮==',
      '第一段：注意力是稀缺资源。',
    ]) {
      expect(mapIsConsistent(src), src).toBe(true);
    }
  });

  it('leaves a bracket that isn’t a link alone', () => {
    expect(strip('an [unclosed bracket')).toBe('an [unclosed bracket');
    expect(strip('[not a link] just brackets')).toBe('[not a link] just brackets');
  });
});

describe('toSource', () => {
  it('maps a rendered range back onto the source, markup included', () => {
    const src = '看 **反向传播** 的原理';
    const p = project(src);
    expect(p.text).toBe('看 反向传播 的原理');

    const from = p.text.indexOf('反向传播');
    const at = toSource(p, from, from + 4)!;
    expect(src.slice(at.from, at.to)).toBe('反向传播');
  });

  it('anchors a selection that spans markup', () => {
    // The case that used to be refused outright.
    const src = '这句话里有 **加粗的部分** 夹在中间。';
    const p = project(src);
    const from = p.text.indexOf('这句话里有');
    const to = p.text.indexOf('夹在中间');
    const at = toSource(p, from, to)!;
    expect(src.slice(at.from, at.to)).toContain('**加粗的部分**');
  });

  it('refuses a degenerate range', () => {
    const p = project('abc');
    expect(toSource(p, 1, 1)).toBeNull();
    expect(toSource(p, 0, 99)).toBeNull();
  });
});
