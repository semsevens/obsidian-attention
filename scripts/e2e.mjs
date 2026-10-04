// End-to-end: select text in a running Obsidian and check what gets captured.
//
//   npm run e2e                      # every note in the fixtures vault
//   E2E_VAULT=~/vault E2E_FOLDER=raw/in E2E_NOTES=12 npm run e2e
//
// Builds the plugin with the debug bridge (scripts/e2e/debug-entry.js), deploys it
// into the vault, waits for Hot Reload to load it, then hands Obsidian
// scripts/e2e/fuzz.js and reports what came back. The vault has to be open in
// Obsidian: `open "obsidian://open?vault=<its folder name>"`.
//
// Then scripts/e2e/reveal.js: clicking a record in the review panel, which
// should scroll only when the mark is out of sight.
//
// Unit tests cover what each piece does with the DOM it is given; this covers
// whether that DOM is what Obsidian actually draws, which no fixture can.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { homedir } from "node:os";

const vault = resolve((process.env.E2E_VAULT ?? "fixtures/vault").replace(/^~/, homedir()));
const config = {
  folder: process.env.E2E_FOLDER ?? "",
  notes: Number(process.env.E2E_NOTES ?? 0),   // 0: all of them
  perStop: Number(process.env.E2E_PER_STOP ?? 40),
  seed: Number(process.env.E2E_SEED ?? 7),
};
const pluginDir = join(vault, ".obsidian/plugins/attention");
const inbox = join(pluginDir, "probe-in.js");
const outbox = join(pluginDir, "probe-out.json");

const build = String(Date.now());
execFileSync("node", ["esbuild.config.mjs", "production"], {
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, ATTENTION_DEBUG: "1", ATTENTION_BUILD: build, VAULT_PLUGIN_DIR: pluginDir },
});

/**
 * The name Obsidian knows the vault by: the folder name it was registered
 * with, which need not be this path's — `~/ob/dev` can be a link to here.
 */
function vaultName(dir) {
  const real = realpathSync(dir);
  try {
    const list = JSON.parse(readFileSync(join(homedir(), "Library/Application Support/obsidian/obsidian.json"), "utf8"));
    for (const { path } of Object.values(list.vaults ?? {})) {
      if (existsSync(path) && realpathSync(path) === real) return basename(path);
    }
  } catch {
    // Not macOS, or Obsidian has never run: fall back to the folder's name.
  }
  return basename(dir);
}

/** Run a script inside Obsidian and wait for its answer. */
async function probe(code, seconds) {
  rmSync(outbox, { force: true });
  writeFileSync(inbox, code);
  for (let waited = 0; waited < seconds * 4; waited++) {
    if (existsSync(outbox)) {
      try {
        return JSON.parse(readFileSync(outbox, "utf8"));
      } catch {
        // Still being written by an older build without the rename; wait.
      }
    }
    await new Promise(r => setTimeout(r, 250));
  }
  rmSync(inbox, { force: true });
  return null;
}

// Obsidian renders nothing in a window it considers hidden, so bring the
// vault's window to the front.
execFileSync("open", [`obsidian://open?vault=${encodeURIComponent(vaultName(vault))}`]);
// Wait for this build, not just any: the one already loaded answers too, and
// a run against it tests code that is no longer there.
let running = null;
for (let tries = 0; tries < 20 && running !== build; tries++) {
  running = (await probe("return plugin.debugBuild ?? null;", 20))?.value ?? null;
  if (running !== build) await new Promise(r => setTimeout(r, 500));
}
if (running !== build) {
  console.error(running === null
    ? `No answer from Obsidian. Is the vault open?\n  open "obsidian://open?vault=${vaultName(vault)}"`
    : "Obsidian is still running an older build. Is Hot Reload installed in the vault?");
  process.exit(2);
}

const fuzz = readFileSync(new URL("./e2e/fuzz.js", import.meta.url), "utf8");
const result = await probe(`const CONFIG = ${JSON.stringify(config)};\n${fuzz}`, 1800);
if (!result?.ok) {
  console.error(result?.error ?? "No answer from Obsidian within half an hour.");
  process.exit(2);
}

if (result.value.length === 0) {
  console.error(`No notes under "${config.folder}" in ${vault}.`);
  process.exit(2);
}

let failures = 0;
for (const row of result.value) {
  failures += row.failures.length;
  const mark = row.failures.length ? "✗" : "✓";
  const vanished = row.vanished ? `, vanished ${row.vanished}` : "";
  console.log(`${mark} ${row.note}  matched ${row.ok}, captured ${row.captured}${vanished}, failed ${row.failures.length}`);
  for (const f of row.failures.slice(0, 3)) console.log("    ", JSON.stringify(f));
}
for (const e of result.errors) console.log("  console error:", e.slice(0, 300));

// Going to a mark from the review panel: in sight, in one move, and not at all
// when it already is. Needs the fixture note, so only in the fixtures vault.
const reveal = await probe(readFileSync(new URL("./e2e/reveal.js", import.meta.url), "utf8"), 120);
if (!reveal?.ok) {
  failures++;
  console.log("✗ jumping to a mark:", reveal?.error ?? "no answer");
} else if (reveal.value.skipped) {
  console.log(`- jumping to a mark: skipped (${reveal.value.skipped})`);
} else {
  failures += reveal.value.failures.length;
  console.log(`${reveal.value.failures.length ? "✗" : "✓"} jumping to a mark from the review panel`);
  for (const f of reveal.value.failures) console.log("    ", JSON.stringify(f));
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures || result.errors.length ? 1 : 0);
