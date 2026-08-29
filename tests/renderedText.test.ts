import { describe, expect, it } from 'vitest';
import { isChrome, textBefore } from '../src/hosts/markdown/renderedText';

// Enough of a DOM to walk. Obsidian marks its own furniture `mod-ui`.
function text(data: string): Node {
  return { nodeType: 3, textContent: data, childNodes: [] } as unknown as Node;
}
function el(cls: string, ...children: Node[]): Node {
  return {
    nodeType: 1,
    classList: { contains: (c: string) => cls.split(' ').includes(c) },
    childNodes: children,
    textContent: children.map(c => c.textContent).join(''),
    parentNode: null,
  } as unknown as Node;
}
function tree(...children: Node[]): Node {
  const root = el('', ...children);
  const link = (parent: Node) => {
    for (const child of Array.from(parent.childNodes)) {
      (child as { parentNode: Node | null }).parentNode = parent;
      link(child);
    }
  };
  link(root);
  return root;
}

// The note that reported this: its `description` is its opening sentence, so
// the phrase is on screen three times and in the file twice.
const sentence = '希望这张图可以帮到你。';
const body = text(sentence);
const page = tree(
  el('mod-header mod-ui', text('属性选区')),
  el('metadata-container', text('description'), text(sentence)),
  el('el-pre mod-frontmatter mod-ui', text(`description: "${sentence}"`)),
  el('el-p', body),
);

describe('textBefore', () => {
  it('leaves out the properties table and the frontmatter block', () => {
    expect(textBefore(page, body, 0)).toBe('');
  });

  it('keeps text from the note itself', () => {
    const second = text('第二段');
    const withMore = tree(el('metadata-container mod-ui', text(sentence)), el('el-p', body), el('el-p', second));
    expect(textBefore(withMore, second, 0)).toBe(sentence);
  });

  it('stops part-way into the node it is given', () => {
    expect(textBefore(tree(el('el-p', body)), body, 5)).toBe(sentence.slice(0, 5));
  });

  it('is empty when the stop node comes first', () => {
    expect(textBefore(tree(el('el-p', body)), body, 0)).toBe('');
  });
});

describe('isChrome', () => {
  it('recognises a node inside the properties table', () => {
    // It carries no `mod-ui`; the class naming it is all there is to go on.
    const inside = text(sentence);
    tree(el('metadata-container', el('metadata-property', inside)));
    expect(isChrome(inside)).toBe(true);
  });

  it('recognises a node inside anything marked mod-ui', () => {
    const inside = text(sentence);
    tree(el('el-pre mod-frontmatter mod-ui', inside));
    expect(isChrome(inside)).toBe(true);
  });

  it('says no for the note own text', () => {
    expect(isChrome(body)).toBe(false);
  });

  it('says no for nothing at all', () => {
    expect(isChrome(null)).toBe(false);
  });
});
