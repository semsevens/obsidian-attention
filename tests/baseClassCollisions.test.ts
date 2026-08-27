import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard against shadowing a member of the Obsidian class you extend.
 *
 * This has bitten twice. `scope` was caught by the compiler because View
 * declares it with a different type. `open` was not: View.prototype.open is how
 * Obsidian *mounts* a view, and an override with a compatible-enough signature
 * type-checks fine, then silently swallows the mount — the panel renders
 * perfectly into an element that never enters the document.
 *
 * Neither the type-checker nor a unit test on the view's own behaviour can see
 * this, so the check is on names. The list was read from a live Obsidian 1.13
 * (walking the prototype chain above ReviewView.prototype, plus the instance
 * fields the base constructors set).
 */
const ITEM_VIEW_MEMBERS = new Set([
  '_children', '_events', '_loaded', 'actionsEl', 'addAction', 'addChild', 'app',
  'backButtonEl', 'canDropAnywhere', 'close', 'containerEl', 'contentEl',
  'forwardButtonEl', 'getEphemeralState', 'getIcon', 'getSideTooltipPlacement',
  'getState', 'handleCopy', 'handleCut', 'handleDrop', 'handlePaste', 'headerEl',
  'icon', 'leaf', 'leftSidebarToggleEl', 'load', 'moreOptionsButtonEl', 'navigation',
  'onClose', 'onGroupChange', 'onHeaderMenu', 'onMoreOptions', 'onMoreOptionsMenu',
  'onOpen', 'onPaneMenu', 'onResize', 'onTabMenu', 'onload', 'onunload', 'open',
  'register', 'registerDomEvent', 'registerEvent', 'registerInterval',
  'registerScopeEvent', 'removeChild', 'scope', 'setEphemeralState', 'setState',
  'titleContainerEl', 'titleEl', 'titleParentEl', 'unload', 'updateNavButtons',
]);

/** Overriding these is the whole point of subclassing a View. */
const INTENTIONAL = new Set([
  'onOpen', 'onClose', 'onload', 'onunload', 'getIcon', 'getState', 'setState',
  'getEphemeralState', 'setEphemeralState', 'onResize', 'onPaneMenu',
]);

/** Members declared directly in a class body: methods, fields, and `private x` params. */
function declaredMembers(source: string): string[] {
  const body = source.slice(source.indexOf('extends ItemView'));
  const names = new Set<string>();
  // methods: `foo(`, `async foo(`, `private foo(`, `private async foo(`
  for (const m of body.matchAll(/^\s{2}(?:(?:private|public|protected|readonly)\s+)*(?:async\s+)?(?:get\s+)?([A-Za-z_]\w*)\s*[(<]/gm)) {
    names.add(m[1]);
  }
  // fields: `private foo: T = ...`, `foo = ...`
  for (const m of body.matchAll(/^\s{2}(?:(?:private|public|protected|readonly)\s+)+([A-Za-z_]\w*)\s*[:=]/gm)) {
    names.add(m[1]);
  }
  // constructor parameter properties: `private plugin: X`
  for (const m of body.matchAll(/constructor\s*\([^)]*?(?:private|public|protected|readonly)\s+([A-Za-z_]\w*)\s*:/gs)) {
    names.add(m[1]);
  }
  names.delete('constructor');
  return [...names];
}

const VIEW_DIR = join(__dirname, '..', 'src', 'views');

describe('views do not shadow their Obsidian base class', () => {
  const files = readdirSync(VIEW_DIR).filter(f => f.endsWith('.ts'));

  it('has view files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} declares no accidental overrides`, () => {
      const source = readFileSync(join(VIEW_DIR, file), 'utf8');
      if (!source.includes('extends ItemView')) return;

      const clashes = declaredMembers(source)
        .filter(n => ITEM_VIEW_MEMBERS.has(n) && !INTENTIONAL.has(n));

      expect(clashes, `shadows ItemView member(s): ${clashes.join(', ')}`).toEqual([]);
    });
  }

  it('catches a shadowed member when one exists', () => {
    // Proof the detector works — this is the exact shape of the `open` bug.
    const bad = `
export class Broken extends ItemView {
  private lens = 'file';
  private async open(a: string, b: string): Promise<void> {}
}`;
    expect(declaredMembers(bad).filter(n => ITEM_VIEW_MEMBERS.has(n))).toEqual(['open']);
  });
});
