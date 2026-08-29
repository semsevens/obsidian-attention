import { describe, expect, it } from 'vitest';
import { belongsTo, ownerOf } from '../src/hosts/markdown/ownerView';

// A pane, standing in for a MarkdownView: it knows which nodes it holds.
function pane(name: string, ...holds: object[]) {
  return { name, contains: (n: Node | null) => holds.includes(n as unknown as object) };
}

const imgInA = {} as Node;
const imgInB = {} as Node;
const loose = {} as Node;

describe('ownerOf', () => {
  it('finds the pane the element is actually in', () => {
    const a = pane('A', imgInA);
    const b = pane('B', imgInB);
    expect(ownerOf([a, b], imgInB)?.name).toBe('B');
  });

  // The bug this exists to prevent: the active pane is B, the right-click
  // happened in A, and the mark used to be filed under B's file.
  it('does not answer with the active pane when the click was elsewhere', () => {
    const active = pane('active-but-not-clicked');
    const clicked = pane('clicked', imgInA);
    expect(ownerOf([active, clicked], imgInA)?.name).toBe('clicked');
  });

  it('answers null when no pane holds it', () => {
    expect(ownerOf([pane('A', imgInA)], loose)).toBeNull();
  });

  it('answers null for a null element rather than guessing the first pane', () => {
    expect(ownerOf([pane('A', imgInA)], null)).toBeNull();
  });

  it('answers null when there are no panes', () => {
    expect(ownerOf([], imgInA)).toBeNull();
  });
});

describe('belongsTo', () => {
  it('accepts an element the view holds', () => {
    expect(belongsTo(pane('A', imgInA), imgInA)).toBe(true);
  });

  it('rejects an element from another view', () => {
    expect(belongsTo(pane('A', imgInA), imgInB)).toBe(false);
  });

  it('rejects a stale target left over from an earlier click', () => {
    expect(belongsTo(pane('A', imgInA), null)).toBe(false);
    expect(belongsTo(null, imgInA)).toBe(false);
  });
});
