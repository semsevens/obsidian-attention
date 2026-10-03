// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { placeByLines, wholeBlocks } from '../src/hosts/markdown/placeSelection';

// Each case here was a selection that failed in a real vault. The markup is
// what Obsidian's reading mode draws, copied from a live view: a block per
// section, stamped by the plugin with the source lines it came from.

/** A reading view holding one rendered block per `[lines, html]`. */
function render(blocks: [string, string][]): HTMLElement {
  const view = document.createElement('div');
  view.className = 'markdown-preview-view';
  view.innerHTML = blocks
    .map(([lines, html]) => `<div class="el-p" data-at-lines="${lines}">${html}</div>`)
    .join('');
  document.body.replaceChildren(view);
  return view;
}

/** The text node holding `text`, and the offset of `text` within it. */
function at(root: Node, text: string, after = false): [Node, number] {
  const found = find(root, text);
  if (!found) throw new Error(`no "${text}" on screen`);
  const i = found.textContent!.indexOf(text);
  return [found, after ? i + text.length : i];
}

function find(node: Node, text: string): Node | null {
  if (node.nodeType === 3) return node.textContent!.includes(text) ? node : null;
  for (const child of Array.from(node.childNodes)) {
    const hit = find(child, text);
    if (hit) return hit;
  }
  return null;
}

function select(start: [Node, number], end: [Node, number]): Range {
  const r = document.createRange();
  r.setStart(...start);
  r.setEnd(...end);
  return r;
}

function placed(source: string, range: Range): string | null {
  const p = placeByLines(source, range);
  return p && source.slice(p.from, p.to);
}

const PARAS = [
  '今天再看，很多内容都有无比的共鸣感。',
  '',
  '当时他在对话里反复讲一件事：真正困难的，不只是找到一个有效的方法，而是能不能陪着它走过那段难熬的时间。',
  '',
  '而那几年，他自己恰恰就在经历这样的阶段。',
  '',
  '次年又只涨6.80%，标普500上涨18.40%。',
  '',
].join('\n');

function paras(): HTMLElement {
  return render([
    ['0,0', '<p dir="auto">今天再看，很多内容都有无比的共鸣感。</p>'],
    ['2,2', '<p dir="auto">当时他在对话里反复讲一件事：真正困难的，不只是找到一个有效的方法，而是能不能陪着它走过那段难熬的时间。</p>'],
    ['4,4', '<p dir="auto">而那几年，他自己恰恰就在经历这样的阶段。</p>'],
    ['6,6', '<p dir="auto">次年又只涨6.80%，标普500上涨18.40%。</p>'],
  ]);
}

describe('placeByLines', () => {
  it('places a drag that ends past the paragraph, in the gap before the next', () => {
    const view = paras();
    const next = view.querySelector('[data-at-lines="4,4"]')!;
    const r = select(at(view, '而是能不能'), [next, 0]);
    expect(placed(PARAS, r)?.trim()).toBe('而是能不能陪着它走过那段难熬的时间。');
  });

  it('places a selection across three paragraphs', () => {
    const view = paras();
    const r = select(at(view, '而是能不能'), at(view, '18.40%。', true));
    const text = placed(PARAS, r)!;
    expect(text.startsWith('而是能不能')).toBe(true);
    expect(text.endsWith('上涨18.40%。')).toBe(true);
  });

  it('steps over markup: footnote superscripts, code, bold', () => {
    const source = '在 No MCP!<sup>[1]</sup> 中解释了，配置 `tool_search` 与 **加粗**。\n';
    const view = render([['0,0',
      '<p dir="auto">在 No MCP!<sup>[1]</sup> 中解释了，配置 <code>tool_search</code> 与 <strong>加粗</strong>。</p>']]);
    expect(placed(source, select(at(view, 'MCP!'), at(view, '中解释', true)))).toBe('MCP!<sup>[1]</sup> 中解释');
    expect(placed(source, select(at(view, 'tool_search'), at(view, 'tool_search', true)))).toBe('tool_search');
    expect(placed(source, select(at(view, '与'), at(view, '加粗', true)))).toBe('与 **加粗');
  });

  it('places an asterisk the screen draws, which the projection drops', () => {
    const source = '****格林布拉特**** 我觉得\n';
    const view = render([['0,0', '<p dir="auto"><strong><strong>格林布拉特</strong></strong> 我觉得</p>']]);
    // Obsidian draws this one as literal asterisks around bold text.
    view.querySelector('p')!.innerHTML = '**格林布拉特** 我觉得';
    const p = view.querySelector('p')!.firstChild!;
    expect(placed(source, select([p, 0], [p, 1]))).toBe('*');
    // The closing asterisk and the space after it: only the space pairs at
    // first. Which of the four source asterisks is the one on screen can't be
    // told; what matters is that one is captured and nothing past it.
    expect(placed(source, select([p, 8], [p, 10]))?.trim()).toMatch(/^\*+$/);
  });

  it('places a selection inside the footnotes Obsidian gathers at the end', () => {
    const source = [
      '正文引用了一个脚注[^a]。',
      '',
      '[^a]: 脚注 a 的定义写在正文后面。',
      '',
      '最后一段正文。',
      '',
    ].join('\n');
    const view = render([
      ['0,0', '<p dir="auto">正文引用了一个脚注<sup data-footnote-id="fnref-1"><a href="#fn-1">[1]</a></sup>。</p>'],
      ['4,4', '<p dir="auto">最后一段正文。</p>'],
      // Recorded as the last line, wherever the definitions really are.
      ['5,5', '<section class="footnotes"><hr><ol><li data-footnote-id="fn-1"><p>脚注 a 的定义写在正文后面。<a class="footnote-backref">↩︎</a></p></li></ol></section>'],
    ]);
    expect(placed(source, select(at(view, '的定义'), at(view, '↩︎', true)))).toBe('的定义写在正文后面。');
    // Running into a footnote defined further up stops where the text does.
    expect(placed(source, select(at(view, '最后'), at(view, '脚注 a', true)))).toBe('最后一段正文。');
  });

  it('starts a selection after inline math outside the TeX', () => {
    const source = '行内公式 $x_1 + x_2$ 夹在文字中间。\n';
    const view = render([['0,0',
      '<p dir="auto">行内公式 <span class="math math-inline"><mjx-container>x1+x2</mjx-container></span> 夹在文字中间。</p>']]);
    const math = view.querySelector('.math')!;
    const space = math.nextSibling!;
    expect(placed(source, select([space, 0], at(view, '中间。', true)))?.trim()).toBe('夹在文字中间。');
  });

  it('refuses a block whose recorded lines hold other text', () => {
    // Lines recorded before an edit: the block says 0,0, the file has moved on.
    const view = render([['0,0', '<p dir="auto">屏幕上的这一段已经不在那一行了。</p>']]);
    expect(placed('完全不同的一行文字。\n', select(at(view, '屏幕'), at(view, '那一行', true)))).toBeNull();
  });

  it('places a selection that starts on a transclusion’s title in the embedded note', () => {
    const embedded = '# 被嵌入的笔记\n\n这句话住在被嵌入的文件里。\n';
    const view = render([
      ['2,2', '<p dir="auto">宿主自己的一句话。</p>'],
      ['4,4', '<span class="internal-embed markdown-embed"><div class="embed-title markdown-embed-title">被嵌入</div>' +
        '<div class="markdown-embed-content">' +
        '<div class="markdown-preview-view"><div class="mod-header mod-ui"><div class="inline-title">被嵌入</div></div>' +
        '<div class="el-h1" data-at-lines="0,0"><h1>被嵌入的笔记</h1></div>' +
        '<div class="el-p" data-at-lines="2,2"><p>这句话住在被嵌入的文件里。</p></div>' +
        '</div></div></span>'],
    ]);
    // Both titles: the embed's own, drawn beside the content, and the inline one.
    const outer = view.querySelector('.markdown-embed-title')!.firstChild!;
    expect(placed(embedded, select([outer, 1], at(view, '这句话住在', true)))).toBe('被嵌入的笔记\n\n这句话住在');
    const title = view.querySelector('.inline-title')!.firstChild!;
    const r = select([title, 1], at(view, '这句话住在', true));
    expect(placed(embedded, r)).toBe('被嵌入的笔记\n\n这句话住在');
  });
});

describe('wholeBlocks', () => {
  it('gives the source of a block another plugin draws', () => {
    const source = '前文。\n\n```asciinema\nattachments/终端.cast\n```\n\n后文。\n';
    const view = render([
      ['0,0', '<p dir="auto">前文。</p>'],
      ['2,4', '<div class="block-language-asciinema"><pre>$ echo 这一行只在录像里\n━━━━━━━━━━━━━━━━</pre></div>'],
      ['6,6', '<p dir="auto">后文。</p>'],
    ]);
    const r = select(at(view, '这一行'), at(view, '录像里', true));
    expect(placeByLines(source, r)).toBeNull();
    const block = wholeBlocks(source, r)!;
    expect(source.slice(block.from, block.to).trim()).toBe('```asciinema\nattachments/终端.cast\n```');
  });

  it('spans footnotes cited in the opposite order to their definitions', () => {
    const source = [
      '先引用 b[^b]，再引用 a[^a]。',
      '',
      '[^a]: 定义 a 在前。',
      '[^b]: 定义 b 在后。',
      '',
    ].join('\n');
    const view = render([
      ['0,0', '<p>先引用 b<sup data-footnote-id="fnref-1">[1]</sup>，再引用 a<sup data-footnote-id="fnref-2">[2]</sup>。</p>'],
      // Numbered by citation: b is 1, a is 2.
      ['4,4', '<section class="footnotes"><hr><ol>' +
        '<li data-footnote-id="fn-1"><p>定义 b 在后。<a class="footnote-backref">↩︎</a></p></li>' +
        '<li data-footnote-id="fn-2"><p>定义 a 在前。<a class="footnote-backref">↩︎</a></p></li></ol></section>'],
    ]);
    const r = select(at(view, '↩︎'), at(view, '定义 a', true));
    expect(placeByLines(source, r)).toBeNull();
    const span = wholeBlocks(source, r)!;
    expect(source.slice(span.from, span.to)).toBe('[^a]: 定义 a 在前。\n[^b]: 定义 b 在后。');
  });
});
