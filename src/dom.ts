// Cross-window-safe DOM narrowing.
//
// `instanceof HTMLElement` is false for an element belonging to a popout
// window: that window has its own class objects, so the check compares against
// the wrong constructor. Obsidian's `Node.instanceOf()` handles it, but only
// exists on Nodes — the values being narrowed here are often an EventTarget or
// something that may be null, which is why these read as functions rather than
// as a mechanical `instanceof` → `.instanceOf` substitution.

/** Narrow anything to an HTMLElement, across windows, tolerating null. */
export function asEl(value: unknown): HTMLElement | null {
  return narrow(value, HTMLElement);
}

export function asImg(value: unknown): HTMLImageElement | null {
  return narrow(value, HTMLImageElement);
}

export function asMedia(value: unknown): HTMLMediaElement | null {
  return narrow(value, HTMLMediaElement);
}

/** The element a node lives in — itself when it is one, else its parent. */
export function elementOf(node: Node | null | undefined): HTMLElement | null {
  if (!node) return null;
  return asEl(node) ?? asEl(node.parentElement);
}

function narrow<T>(value: unknown, type: { new (): T }): T | null {
  const node = value as Node | null | undefined;
  if (!node || typeof node.instanceOf !== 'function') return null;
  return node.instanceOf(type) ? node : null;
}
