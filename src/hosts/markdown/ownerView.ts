/**
 * Which view an element is physically inside.
 *
 * A mark is filed under a file, and the file has to be the one whose text
 * actually contains what was clicked. Reaching for the *active* view instead is
 * wrong in the cases that matter: right-clicking in a background split does not
 * activate it first, and the sidebar can hold focus while the pointer is over a
 * note. Getting it wrong writes the mark into a note that does not contain the
 * words, where it can never resolve — it shows up later as lost, in a file it
 * was never about.
 */

/** The narrowest thing this needs from a view: does it contain the node. */
export interface Container {
  contains(node: Node | null): boolean;
}

export function ownerOf<T extends Container>(views: readonly T[], el: Node | null): T | null {
  if (!el) return null;
  for (const view of views) {
    if (view.contains(el)) return view;
  }
  return null;
}

/**
 * True when this element may be acted on as part of `view`.
 *
 * Used as a guard before filing anything: no owner at all is a stale target
 * left over from a previous click, which is worse than doing nothing.
 */
export function belongsTo(view: Container | null, el: Node | null): boolean {
  return view !== null && el !== null && view.contains(el);
}
