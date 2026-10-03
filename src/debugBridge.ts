/**
 * A way in for debugging the plugin inside a running Obsidian.
 *
 * Obsidian can only be inspected from outside when it was launched with a
 * debugging port, and restarting it to get one is not always possible. This
 * watches the plugin's own folder instead: a script dropped there as
 * `probe-in.js` is run with `app` and `plugin` in scope, and what it returns —
 * or throws — is written to `probe-out.json`, along with any notices shown and
 * console errors logged meanwhile.
 *
 * Only compiled in for a debug build (`ATTENTION_DEBUG=1`); a release build
 * contains none of it.
 */

import { Plugin } from 'obsidian';

export function startDebugBridge(plugin: Plugin): void {
  const adapter = plugin.app.vault.adapter;
  const dir = plugin.manifest.dir ?? '';
  const inbox = `${dir}/probe-in.js`;
  const outbox = `${dir}/probe-out.json`;
  let busy = false;

  const run = async (): Promise<void> => {
    if (busy || !(await adapter.exists(inbox))) return;
    busy = true;
    const notices: string[] = [];
    const errors: string[] = [];
    const watcher = new MutationObserver(records => {
      for (const r of records) {
        r.addedNodes.forEach(n => {
          if (n instanceof HTMLElement && n.classList.contains('notice')) notices.push(n.textContent ?? '');
        });
      }
    });
    watcher.observe(document.body, { childList: true, subtree: true });
    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map(a => (a instanceof Error ? a.stack ?? a.message : String(a))).join(' '));
      consoleError(...args);
    };

    let result: unknown;
    try {
      const code = await adapter.read(inbox);
      await adapter.remove(inbox);
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('app', 'plugin', `return (async () => {\n${code}\n})();`);
      result = { ok: true, value: await fn(plugin.app, plugin) };
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) };
    } finally {
      watcher.disconnect();
      console.error = consoleError;
    }
    await adapter.write(outbox, JSON.stringify({ ...(result as object), notices, errors }, null, 2));
    busy = false;
  };

  plugin.registerInterval(window.setInterval(() => { void run(); }, 300));
}
