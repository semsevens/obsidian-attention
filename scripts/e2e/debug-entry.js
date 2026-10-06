// The plugin as `npm run e2e` builds it: the real one, plus a way in.
//
// Obsidian can only be inspected from outside when it was launched with a
// debugging port, and restarting it to get one is not always possible. This
// watches the plugin's own folder instead: a script dropped there as
// `probe-in.js` is run with `app` and `plugin` in scope, and what it returns —
// or throws — is written to `probe-out.json`, along with any notices shown and
// console errors logged meanwhile.
//
// It lives here, outside src/, on purpose: running code from a file is what
// makes it useful for testing and exactly what a published plugin must never
// do. A release is built from src/main.ts and contains none of it.

import AttentionPlugin from "../../src/main";

/* global ATTENTION_BUILD -- defined by esbuild.config.mjs for this build */

export default class DebugAttentionPlugin extends AttentionPlugin {
  async onload() {
    await super.onload();
    // Which build is running: Hot Reload swaps it in a moment after it lands,
    // and a test must not mistake the old one for it.
    this.debugBuild = ATTENTION_BUILD;
    this.registerInterval(window.setInterval(() => { void this.runProbe(); }, 300));
  }

  async runProbe() {
    const adapter = this.app.vault.adapter;
    const inbox = `${this.manifest.dir}/probe-in.js`;
    const outbox = `${this.manifest.dir}/probe-out.json`;
    if (this.probing || !(await adapter.exists(inbox))) return;
    this.probing = true;
    // Whatever happens below — the runner deleting a file between our check
    // and our remove, say — the bridge must be free for the next script, or it
    // goes silent until the plugin is reloaded.
    try {
      await this.answer(adapter, inbox, outbox);
    } catch (e) {
      console.error("attention debug bridge:", e);
    } finally {
      this.probing = false;
    }
  }

  async answer(adapter, inbox, outbox) {
    const notices = [];
    const errors = [];
    const watcher = new MutationObserver(records => {
      for (const r of records) {
        r.addedNodes.forEach(n => {
          if (n.nodeType === 1 && n.classList.contains("notice")) notices.push(n.textContent ?? "");
        });
      }
    });
    watcher.observe(document.body, { childList: true, subtree: true });
    const consoleError = console.error;
    console.error = (...args) => {
      errors.push(args.map(a => (a instanceof Error ? a.stack ?? a.message : String(a))).join(" "));
      consoleError(...args);
    };

    let result;
    try {
      const code = await adapter.read(inbox);
      await adapter.remove(inbox).catch(() => {});
      const fn = new Function("app", "plugin", `return (async () => {\n${code}\n})();`);
      result = { ok: true, value: await fn(this.app, this) };
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.stack ?? e.message : String(e) };
    } finally {
      watcher.disconnect();
      console.error = consoleError;
    }
    // Written aside and renamed into place, so a reader never sees half of it.
    const partial = `${outbox}.partial`;
    await adapter.write(partial, JSON.stringify({ ...result, notices, errors }, null, 2));
    await adapter.remove(outbox).catch(() => {});
    await adapter.rename(partial, outbox);
  }
}
