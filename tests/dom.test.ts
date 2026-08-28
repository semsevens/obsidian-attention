import { describe, expect, it } from 'vitest';
import { asEl, asImg, asMedia, elementOf } from '../src/dom';

// Node has no DOM globals. The guards only ever read these constructors' names
// (they hand them to `instanceOf`), so a bare class of the right name is all
// they need — and it keeps the test off jsdom.
const globals = globalThis as Record<string, unknown>;
for (const name of ['HTMLElement', 'HTMLImageElement', 'HTMLMediaElement']) {
  globals[name] = { name };
}

// A popout window has its own class objects, so a real `instanceof` would say
// no to its elements. These fakes stand in for that: `instanceOf` answers by
// name, the way Obsidian's own helper answers across windows.
function fake(...classes: string[]): Node {
  return {
    instanceOf: (type: { name: string }) => classes.includes(type.name),
    parentElement: null,
  } as unknown as Node;
}

describe('asEl', () => {
  it('narrows an element that came from another window', () => {
    const el = fake('HTMLElement');
    expect(asEl(el)).toBe(el);
  });

  it('answers null for null, undefined and non-nodes', () => {
    expect(asEl(null)).toBeNull();
    expect(asEl(undefined)).toBeNull();
    expect(asEl('not a node')).toBeNull();
    expect(asEl({})).toBeNull();
  });

  it('answers null for a node that is not an element', () => {
    expect(asEl(fake('Text', 'CharacterData'))).toBeNull();
  });
});

describe('asImg / asMedia', () => {
  it('accepts only their own kind', () => {
    const img = fake('HTMLImageElement', 'HTMLElement');
    const video = fake('HTMLMediaElement', 'HTMLElement');
    expect(asImg(img)).toBe(img);
    expect(asImg(video)).toBeNull();
    expect(asMedia(video)).toBe(video);
    expect(asMedia(img)).toBeNull();
  });

  it('still narrows to HTMLElement, since both are ones', () => {
    expect(asEl(fake('HTMLImageElement', 'HTMLElement'))).not.toBeNull();
  });
});

describe('elementOf', () => {
  it('returns an element unchanged', () => {
    const el = fake('HTMLElement');
    expect(elementOf(el)).toBe(el);
  });

  it('climbs to the parent when handed a text node', () => {
    const parent = fake('HTMLElement');
    const text = { ...fake('Text'), parentElement: parent } as unknown as Node;
    expect(elementOf(text)).toBe(parent);
  });

  it('answers null for a text node with no parent', () => {
    expect(elementOf(fake('Text'))).toBeNull();
    expect(elementOf(null)).toBeNull();
  });
});
