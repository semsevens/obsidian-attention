/**
 * The rendered text that corresponds to the note's source.
 *
 * Reading mode draws more than the document. Obsidian's own furniture — the
 * inline title, the properties table, and the frontmatter block when it is set
 * to show — is text on screen that is not text in the file, and it repeats
 * what the file says: a note whose `description` matches its opening sentence
 * has that sentence on screen three times and in the source twice.
 *
 * That matters because a selection is located by *which* occurrence it is.
 * Counting Obsidian's furniture makes the answer too high, and the anchor is
 * then looked for at an occurrence the file does not have — reported as "could
 * not find that selection in the note" for a selection sitting in plain sight.
 *
 * Obsidian marks most of it `mod-ui`; the properties table carries its own
 * name instead, so both are named here.
 */

const UI = ['mod-ui', 'metadata-container'];

function isUi(node: Node): boolean {
  const el = node as Partial<Element>;
  if (typeof el.classList?.contains !== 'function') return false;
  return UI.some(cls => el.classList!.contains(cls));
}

/** Text of `root` up to `stop`, with Obsidian's own furniture left out. */
export function textBefore(root: Node, stop: Node, stopOffset: number): string {
  let out = '';
  walk(root, node => {
    if (node === stop) {
      out += (node.textContent ?? '').slice(0, stopOffset);
      return 'stop';
    }
    out += node.textContent ?? '';
    return 'next';
  });
  return out;
}

/** Whether this node sits inside something Obsidian drew rather than the note. */
export function isChrome(node: Node | null): boolean {
  for (let at = node; at; at = at.parentNode) {
    if (isUi(at)) return true;
  }
  return false;
}

/**
 * Text nodes in order, skipping `mod-ui` subtrees, until the visitor says stop.
 */
function walk(root: Node, visit: (text: Node) => 'next' | 'stop'): 'next' | 'stop' {
  for (const child of Array.from(root.childNodes)) {
    if (isUi(child)) continue;
    if (child.nodeType === 3) {
      if (visit(child) === 'stop') return 'stop';
      continue;
    }
    if (walk(child, visit) === 'stop') return 'stop';
  }
  return 'next';
}
