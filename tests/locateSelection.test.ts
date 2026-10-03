import { describe, it, expect } from 'vitest';
import { locateSelection } from '../src/anchor/locateSelection';
import { project, strip, toSource } from '../src/anchor/plainText';

const PARA = '当时乔尔·格林布拉特（Joel Greenblatt）在对话里反复讲一件事：哪怕最优秀的基金经理，也一定会经历很长时间的跑输；真正困难的，不只是找到一个有效的方法，而是投资者能不能陪着它走过那段难熬的时间。';
const SOURCE = `今天再看，很多内容都有无比的共鸣感。\n\n${PARA}\n\n而那几年，格林布拉特自己恰恰就在经历这样的阶段。\n`;

/** The window a reading-mode paragraph gives: its own line, newline included. */
function paragraphWindow(text: string, para: string, ordinal = 0) {
  const from = text.indexOf(para);
  return { from, to: from + para.length + 1, ordinal };
}

describe('locateSelection', () => {
  it('finds a selection dragged past the end of its paragraph', () => {
    // What the browser hands over when the drag ends beyond "时间。".
    const selected = PARA.slice(PARA.indexOf('（Joel')) + '\n\n';
    const at = locateSelection(SOURCE, selected, paragraphWindow(SOURCE, PARA))!;
    expect(SOURCE.slice(at.from, at.to)).toBe(PARA.slice(PARA.indexOf('（Joel')));
  });

  it('matches whitespace by kind, not by count', () => {
    const selected = '共鸣感。\n当时乔尔';
    const at = locateSelection(SOURCE, selected, { from: 0, to: SOURCE.length, ordinal: 0 })!;
    expect(SOURCE.slice(at.from, at.to)).toBe('共鸣感。\n\n当时乔尔');
  });

  it('takes the requested occurrence inside the window', () => {
    const text = 'x 甲 甲 甲 y';
    const at = locateSelection(text, '甲', { from: 0, to: text.length, ordinal: 2 })!;
    expect(at.from).toBe(text.lastIndexOf('甲'));
  });

  it('falls back to the nearest occurrence outside the window', () => {
    const text = '甲 一二三 乙 四五六 甲';
    const window = { from: text.indexOf('乙'), to: text.indexOf('乙') + 1, ordinal: 0 };
    const at = locateSelection(text, '四五六 甲', window)!;
    expect(text.slice(at.from, at.to)).toBe('四五六 甲');
  });

  it('gives up only when the words are nowhere', () => {
    expect(locateSelection(SOURCE, '不存在的句子', { from: 0, to: 10, ordinal: 0 })).toBeNull();
    expect(locateSelection(SOURCE, ' \n ', { from: 0, to: 10, ordinal: 0 })).toBeNull();
  });
});

describe('selections across block markers', () => {
  it('drops heading, bullet, number, quote and task markers', () => {
    expect(strip('## Pi 1.0 发布\n正文')).toBe('Pi 1.0 发布\n正文');
    expect(strip('- 一\n- [x] 二\n1. 三\n> > 四')).toBe('一\n二\n三\n四');
    expect(strip('**粗体**开头\n#标签 不是标题')).toBe('粗体开头\n#标签 不是标题');
  });

  it('maps a selection across a heading back onto the source', () => {
    const src = '前文结束。\n\n## 小标题\n\n后文开始';
    const p = project(src);
    const at = locateSelection(p.text, '结束。\n小标题\n后文', { from: 0, to: p.text.length, ordinal: 0 })!;
    const range = toSource(p, at.from, at.to)!;
    expect(src.slice(range.from, range.to)).toBe('结束。\n\n## 小标题\n\n后文');
  });
});
