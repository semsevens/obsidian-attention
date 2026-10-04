// Runs inside Obsidian through the debug bridge (scripts/e2e/debug-entry.js); `app`,
// `plugin` and `CONFIG` are in scope. See scripts/e2e.mjs.
//
// Makes random selections in reading mode, the way a reader drags, and checks
// each one is captured as the source the reader was looking at. Reading mode
// only draws what is near the screen, so every note is scrolled through and
// fuzzed at each stop.

const { folder, notes, perStop, seed: firstSeed } = CONFIG;

let seed = firstSeed;
const rand = k => { seed = (seed * 16807) % 2147483647; return seed % k; };

// Where the screen and the file cannot be compared character by character —
// typeset math, a block another plugin draws, Obsidian's gathered footnotes
// and its references to them (`[^a]` is drawn as `[1]`). A selection touching
// one only has to be captured, not to match.
// So is a transclusion's title, which is Obsidian's, not the file's.
const UNCOMPARABLE = [
  '.math', 'mjx-container',                                   // typeset math
  'section.footnotes', 'sup[data-footnote-id]', '.footnote-link',
  '[class*="block-language-"]', '[class*="auto-embed"]',      // drawn by plugins
  '.markdown-embed-title', '.inline-title',
].join(', ');

// What a capture should look like once the markup the screen doesn't show is
// taken out. Deliberately independent of the plugin's own projection. Code is
// shown as written, so fences go first and inline code is set aside; and
// `tags` says whether HTML is dropped (it renders) or kept (it is in code a
// selection cut through, where it shows as text).
const visible = (q, tags) => q
  .replace(/^\s*(```|~~~).*$/gm, '')
  .split(/(`+[^`]*`+)/).map((part, i) => i % 2 ? part : part
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)\s]*\)/g, '')
    .replace(/\]\([^)\s]*\)/g, '')
    .replace(/<((?:https?:|mailto:)?[^<>\s]+@[^<>\s]+|https?:[^<>\s]+)>/g, '$1')
    // A video's or audio's fallback text is never shown.
    .replace(/<(video|audio)\b[^]*?<\/\1>/gi, tags ? '' : '$&')
    // Real HTML tags only: `memo<boolean>` and `<{ items: string[] }>` are code.
    .replace(/<\/?(?:a|abbr|audio|b|br|center|del|div|em|font|hr|i|iframe|img|ins|kbd|mark|p|picture|s|small|source|span|strong|sub|sup|track|u|video)\b[^<>]*>/gi, tags ? '' : '$&')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    // A footnote's definition is drawn at the end of the note, not where it is.
    .replace(/^\[\^[^\]]+\]:.*$/gm, '')
    .replace(/\\([!-\/:-@[-`{-~])/g, '$1')
    .replace(LINE_MARKER, ''),
  ).join('');
// Applied to the selection too: `0) throw` in a code block is not a list
// item, but the check can't tell, so both sides lose it alike.
// A number counts as a marker before a space or at the very end: a capture
// is trimmed, so `3. ` on screen can be `3\.` at the end of the source.
// And emphasis may come first: `**3\. Negative results.**` reads `3. Ne…`.
const LINE_MARKER = /^\s*(?:>\s?)*[*_]{0,3}(?:#{1,6}\s|[-*+]\s(?:\[.\]\s)?|\d+[.)](?:\s|$))?/gm;
// Twice: `### 1\. Title` is a heading whose text starts `1.`, and a
// selection of it reads `1. Title`, which looks like a list item.
const letters = s => s.replace(LINE_MARKER, '').replace(LINE_MARKER, '').replace(/[\s!-/:-@[-`{-~]/g, '');

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const bounds = text => [...Array.from(segmenter.segment(text), seg => seg.index), text.length];

const files = app.vault.getMarkdownFiles()
  .filter(f => f.path.startsWith(folder))
  .sort((a, b) => a.path.localeCompare(b.path));
const picks = [];
if (!notes || notes >= files.length) picks.push(...files);
else while (picks.length < notes) { const f = files[rand(files.length)]; if (!picks.includes(f)) picks.push(f); }

const host = plugin.markdownHost;
const leaf = app.workspace.getLeaf('tab');
const report = [];
try {
  for (const file of picks) {
    await leaf.openFile(file, { state: { mode: 'preview' }, active: true });
    const view = leaf.view;
    // The reading layer by name: the first `.markdown-preview-view` under
    // `contentEl` can be a transclusion the editor layer drew.
    const scroller = view.previewMode.containerEl.querySelector(':scope > .markdown-preview-view');
    const row = { note: file.path, ok: 0, captured: 0, failures: [] };

    // A window Obsidian considers hidden renders nothing; wait, then say so
    // rather than report a note with nothing tested as passing.
    for (let waited = 0; !scroller.querySelector('[data-at-lines]') && waited < 40; waited++) {
      await new Promise(r => setTimeout(r, 250));
      if (waited === 20) view.previewMode.rerender(true);   // once, in case it stalled
    }
    if (!scroller.querySelector('[data-at-lines]')) {
      row.failures.push({ why: 'never rendered — is the window in front?' });
      report.push(row);
      continue;
    }

    for (let y = 0; ; y += 1500) {
      scroller.scrollTop = y;
      await new Promise(r => setTimeout(r, 250));
      const texts = [];
      const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement;
        // Only text a reader can see: a <video>'s fallback text is in the
        // DOM, but no browser shows it, so nobody can drag across it.
        if (n.textContent.trim() && p.closest('[data-at-lines]') && p.checkVisibility() &&
            !p.closest('.mod-ui, .mod-frontmatter, .copy-code-button, video, audio, iframe, object')) texts.push(n);
      }
      for (let t = 0; t < perStop && texts.length; t++) {
        const a = rand(texts.length), b = Math.min(texts.length - 1, a + rand(4));
        const an = texts[a], bn = texts[b];
        // Offsets where a drag can actually end: between characters as the
        // reader sees them, never inside an emoji's code units.
        const ab = bounds(an.textContent), bb = bounds(bn.textContent);
        const ao = ab[rand(ab.length - 1)];
        let bo = bb[rand(bb.length)];
        if (a === b && bo <= ao) bo = ab[Math.min(ab.length - 1, ab.indexOf(ao) + 1 + rand(20))];
        const range = document.createRange();
        range.setStart(an, ao);
        range.setEnd(bn, bo);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const want = sel.toString();
        if (!want.trim()) continue;

        const got = await host.capture(view);
        // A player that animates (asciinema) redraws its text while playing,
        // taking the selection with it — as it would from under a reader.
        if (!got && window.getSelection().toString() !== want) { row.vanished = (row.vanished ?? 0) + 1; continue; }
        // A mark belongs to one file, so a selection crossing into or out of
        // a transclusion keeps only the part in the file it started in.
        const embedOf = n => (n.nodeType === 1 ? n : n.parentElement).closest('.markdown-embed');
        const crossesEmbed = embedOf(an) !== embedOf(bn) ||
          Array.from(scroller.querySelectorAll('.markdown-embed')).some(el => range.intersectsNode(el) && !el.contains(an));
        const loose = crossesEmbed ||
          Array.from(scroller.querySelectorAll(UNCOMPARABLE)).some(el => range.intersectsNode(el));
        const inTitle = n => !!(n.nodeType === 1 ? n : n.parentElement).closest('.markdown-embed-title, .inline-title');
        if (!got && inTitle(an) && inTitle(bn)) {
          row.captured++;   // only Obsidian's own title: nothing to mark, rightly
        } else if (!got) {
          const where = n => {
            const el = n.nodeType === 1 ? n : n.parentElement;
            const block = el.closest('[data-at-lines]');
            return `${block?.getAttribute('data-at-lines')} ${block?.className} > ${el.tagName.toLowerCase()}.${el.className}`;
          };
          row.failures.push({ why: 'not captured', selected: want.slice(0, 120), from: where(an), to: where(bn) });
        } else if (loose) {
          row.captured++;
        } else if ([true, false].some(tags => letters(visible(got.anchor.quote, tags)) === letters(want))) {
          row.ok++;
        } else {
          const w = letters(want), g = letters(visible(got.anchor.quote, true));
          let d = 0;
          while (d < w.length && w[d] === g[d]) d++;
          row.failures.push({
            why: 'wrong text', selected: want.slice(0, 120), quote: got.anchor.quote.slice(0, 120),
            differs: { at: d, selected: w.slice(Math.max(0, d - 10), d + 20), quote: g.slice(Math.max(0, d - 10), d + 20) },
          });
        }
      }
      if (y + scroller.clientHeight >= scroller.scrollHeight) break;
    }
    if (row.ok + row.captured + row.failures.length === 0) row.failures.push({ why: 'nothing to select' });
    report.push(row);
  }
} finally {
  window.getSelection().removeAllRanges();
  leaf.detach();
}
return report;
