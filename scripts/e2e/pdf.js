// Runs inside Obsidian through the debug bridge (scripts/e2e/debug-entry.js);
// `app` and `plugin` are in scope. See scripts/e2e.mjs.
//
// Marks on a PDF, through PDF++: a selection is captured as the text selected,
// a mark is drawn over that text and taken away with it, a passage across
// pages is one span per page, and jumping to a mark from the review panel
// moves the page once when it is out of sight and not at all when it is not.

const PATH = '注意力笔记.pdf';
const SELECTIONS = 120;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const file = app.vault.getAbstractFileByPath(PATH);
if (!file) return { skipped: `no ${PATH} in this vault` };
if (!app.plugins.plugins['pdf-plus']) return { skipped: 'PDF++ is not enabled in this vault' };
const host = plugin.pdfHost;
if (!host) return { skipped: 'the PDF host is off in settings' };

const failures = [];
const expect = (name, ok, got) => { if (!ok) failures.push({ case: name, got }); };
const letters = s => s.replace(/\s+/g, '');

let main = null;
app.workspace.iterateAllLeaves(l => { if (!main && l.getRoot() === app.workspace.rootSplit) main = l; });

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const bounds = text => [...Array.from(segmenter.segment(text), s => s.index), text.length];
let seed = 11;
const rand = k => { seed = (seed * 16807) % 2147483647; return seed % k; };

const select = (a, ao, b, bo) => {
  const r = document.createRange();
  r.setStart(a, ao);
  r.setEnd(b, bo);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  return sel.toString();
};
const textNodes = page => {
  const out = [];
  const layer = main.view.containerEl.querySelector(`.page[data-page-number="${page}"] .textLayer`);
  if (!layer) return out;
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.textContent.trim() && n.parentElement.closest('.textLayerNode')) out.push(n);
  }
  return out;
};
/** Select `phrase` on a page, however the text layer has split it into nodes. */
const selectPhrase = (page, phrase) => {
  const nodes = textNodes(page);
  const at = nodes.map(n => n.textContent).join('').indexOf(phrase);
  if (at < 0) return null;
  const point = offset => {
    let left = offset;
    for (const n of nodes) {
      if (left <= n.textContent.length) return [n, left];
      left -= n.textContent.length;
    }
    return [nodes[nodes.length - 1], nodes[nodes.length - 1].textContent.length];
  };
  const [a, ao] = point(at), [b, bo] = point(at + phrase.length);
  return select(a, ao, b, bo);
};
const scroller = () => main.view.containerEl.querySelector('.pdf-viewer-container');
const waitFor = async (look, ms = 5000) => {
  for (let t = 0; t < ms; t += 100) { const v = look(); if (v) return v; await sleep(100); }
  return look();
};

const made = [];
try {
  await main.openFile(file);
  app.workspace.setActiveLeaf(main, { focus: false });
  if (!await waitFor(() => textNodes(1).length > 0, 8000)) {
    return { failures: [{ case: 'the PDF never drew its text — is the window in front?' }] };
  }

  // ── Capturing ────────────────────────────────────────────────────────────
  let captured = 0;
  for (let i = 0; i < SELECTIONS; i++) {
    const pages = [1, 2, 3].filter(p => textNodes(p).length > 0);
    const p = pages[rand(pages.length)];
    const nodes = textNodes(p);
    const a = rand(nodes.length);
    const b = Math.min(nodes.length - 1, a + rand(4));
    const ab = bounds(nodes[a].textContent), bb = bounds(nodes[b].textContent);
    const ao = ab[rand(ab.length - 1)];
    let bo = bb[1 + rand(bb.length - 1)];
    if (a === b && bo <= ao) bo = ab[Math.min(ab.length - 1, ab.indexOf(ao) + 1)];
    const want = select(nodes[a], ao, nodes[b], bo);
    if (!want.trim()) continue;
    const got = host.capture();
    captured++;
    expect('a selection is captured as the text selected',
      got && letters(got.anchor.quote) === letters(want), { want, quote: got?.anchor.quote });
  }
  expect('selections were made', captured > SELECTIONS / 2, captured);

  // ── Across pages ─────────────────────────────────────────────────────────
  scroller().scrollTop = main.view.containerEl.querySelector('.page[data-page-number="2"]').offsetTop - 200;
  await waitFor(() => textNodes(1).length && textNodes(2).length);
  const p1 = textNodes(1), p2 = textNodes(2);
  if (p1.length && p2.length) {
    const last = p1[p1.length - 1];
    const want = select(last, 0, p2[0], Math.min(2, p2[0].textContent.length));
    const got = host.capture();
    expect('a selection across pages is one span per page',
      got && got.anchor.spans.map(s => s.page).join() === '1,2' && letters(got.anchor.quote) === letters(want),
      { want, spans: got?.anchor.spans, quote: got?.anchor.quote });
  }

  // ── Drawing ──────────────────────────────────────────────────────────────
  scroller().scrollTop = 0;
  await waitFor(() => textNodes(1).length);
  // As the PDF stores it: with the radical ⼒ (U+2F12) where 力 should be.
  const phrase = selectPhrase(1, '注意⼒是稀缺资源');
  expect('the fixture phrase is on page 1', phrase, textNodes(1).map(n => n.textContent).join('').slice(0, 200));
  if (!phrase) return { failures };
  const selectedRect = window.getSelection().getRangeAt(0).getBoundingClientRect();
  const one = host.capture();
  window.getSelection().removeAllRanges();
  const { annotation } = await plugin.store.mark(PATH, one.anchor, null);
  made.push(annotation.id);
  const drawn = await waitFor(() => main.view.containerEl.querySelectorAll(`.at-pdf-hl[data-at-id="${annotation.id}"]`).length > 0);
  expect('a mark is drawn on its page', drawn, null);
  if (drawn) {
    const r = main.view.containerEl.querySelector(`.at-pdf-hl[data-at-id="${annotation.id}"]`).getBoundingClientRect();
    const overlaps = r.left < selectedRect.right && r.right > selectedRect.left && r.top < selectedRect.bottom && r.bottom > selectedRect.top;
    expect('the mark covers the text that was selected', overlaps,
      { mark: [r.left, r.top, r.right, r.bottom].map(Math.round), selected: [selectedRect.left, selectedRect.top, selectedRect.right, selectedRect.bottom].map(Math.round) });
  }

  // ── A mark quoted before line ends were kept ─────────────────────────────
  // Such a quote runs the last word of a line into the first of the next. The
  // mark must still be found and drawn, and its quote put right.
  const items = main.view.viewer.child.getPage(1).textLayer;
  const textItems = (items?.textLayer ?? items)?.textContentItems ?? [];
  const wrap = textItems.findIndex((it, i) => it.hasEOL && it.str.trim() && textItems[i + 1]?.str.trim());
  expect('the fixture has a line that wraps', wrap >= 0, null);
  if (wrap >= 0) {
    const [a, b] = [textItems[wrap].str, textItems[wrap + 1].str];
    const { annotation: old } = await plugin.store.mark(PATH, {
      kind: 'pdf', spans: [{ page: 1, selection: [wrap, 0, wrap + 1, b.length] }],
      quote: a + b, prefix: '', suffix: '',
    }, null);
    made.push(old.id);
    const drawnOld = await waitFor(() => main.view.containerEl.querySelector(`.at-pdf-hl[data-at-id="${old.id}"]`));
    expect('a mark quoted without its line break is still drawn', drawnOld, null);
    const repaired = await waitFor(() => plugin.store.peek(PATH).find(x => x.id === old.id)?.anchor.quote.includes('\n'));
    expect('and its quote is put right', repaired, plugin.store.peek(PATH).find(x => x.id === old.id)?.anchor.quote);
  }

  // ── The review panel ─────────────────────────────────────────────────────
  let panel = app.workspace.getLeavesOfType('attention-review')[0];
  if (!panel) { panel = app.workspace.getRightLeaf(false) ?? app.workspace.getRightLeaf(true); await panel.setViewState({ type: 'attention-review' }); }
  await sleep(500);
  const shown = Array.from(panel.view.containerEl.querySelectorAll('.at-quote')).map(e => e.textContent);
  expect('the panel shows characters, not the radicals the PDF stores',
    shown.includes('注意力是稀缺资源') && !shown.some(t => /[⺀-⿟]/.test(t)), shown);

  // ── A region, drawn with PDF++'s rectangle tool ──────────────────────────
  // The way a reader marks a figure: turn the tool on, drag over the page.
  // PDF++ copies the region's link as it always does — the clipboard is put
  // back afterwards — and Attention offers to mark it.
  const clipboard = await navigator.clipboard.readText().catch(() => null);
  try {
    scroller().scrollTop = 0;
    await sleep(400);
    const tool = main.view.containerEl.querySelector('.pdf-plus-rect-select');
    expect('PDF++ shows its rectangle tool', tool, null);
    if (tool) {
      tool.click();
      const pageEl = main.view.containerEl.querySelector('.page[data-page-number="1"]');
      const box = pageEl.getBoundingClientRect();
      const [x1, y1] = [box.left + box.width * 0.08, box.top + box.height * 0.06];
      const [x2, y2] = [box.left + box.width * 0.75, box.top + box.height * 0.16];
      const pointer = (type, x, y, on) => on.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
      }));
      pointer('pointerdown', x1, y1, document.elementFromPoint(x1, y1) ?? pageEl);
      pointer('pointermove', x2, y2, pageEl);
      pointer('pointerup', x2, y2, pageEl);
      const markButton = await waitFor(() => document.querySelector('.at-popover .at-pop-mark'), 2000);
      expect('drawing a rectangle offers to mark it', markButton, null);
      if (markButton) {
        markButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        const region = await waitFor(() => plugin.store.peek(PATH).find(a => a.anchor.region), 3000);
        expect('the region is marked, on its page, with the text inside it',
          region && region.anchor.region.page === 1 && region.anchor.quote.includes('PDF'), region?.anchor);
        if (region) {
          made.push(region.id);
          const drawn = await waitFor(() => main.view.containerEl.querySelector(`.at-pdf-region[data-at-id="${region.id}"]`));
          const r = drawn?.getBoundingClientRect();
          // Where PDF++ placed it should be where the drag was, within a few pixels.
          const near = r && Math.abs(r.left - x1) < 6 && Math.abs(r.top - y1) < 6 && Math.abs(r.right - x2) < 6 && Math.abs(r.bottom - y2) < 6;
          expect('the region is drawn where it was dragged', near,
            { drawn: r && [r.left, r.top, r.right, r.bottom].map(Math.round), dragged: [x1, y1, x2, y2].map(Math.round) });
          await sleep(800);
          const thumb = await waitFor(() => panel.view.containerEl.querySelector('.at-thumb-pdf canvas, .at-thumb-pdf img'), 5000);
          expect('the panel shows the region as a picture', thumb, panel.view.containerEl.querySelector('.at-thumb-pdf')?.innerHTML.slice(0, 200));
        }
      }
    }
  } finally {
    if (clipboard !== null) await navigator.clipboard.writeText(clipboard).catch(() => {});
  }

  // ── Jumping to a mark ────────────────────────────────────────────────────
  // A mark on the last page, jumped to from the first.
  await waitFor(() => { scroller().scrollTop = scroller().scrollHeight; return textNodes(3).length; });
  const p3 = textNodes(3);
  const far = p3.find(n => n.textContent.includes('结束')) ?? p3[p3.length - 1];
  select(far, 0, far, far.textContent.length);
  const farCapture = host.capture();
  window.getSelection().removeAllRanges();
  const { annotation: farMark } = await plugin.store.mark(PATH, farCapture.anchor, null);
  made.push(farMark.id);
  scroller().scrollTop = 0;
  await sleep(600);

  const click = async () => {
    const seen = [];
    const watching = (async () => {
      for (let i = 0; i < 30; i++) {
        const y = Math.round(scroller().scrollTop);
        if (y !== seen[seen.length - 1]) seen.push(y);
        await sleep(50);
      }
    })();
    await panel.view.jumpTo(farMark, PATH);
    await watching;
    const el = main.view.containerEl.querySelector(`.at-pdf-hl[data-at-id="${farMark.id}"]`);
    const r = el?.getBoundingClientRect(), port = scroller().getBoundingClientRect();
    return { positions: seen, inSight: !!r && r.top >= port.top && r.bottom <= port.bottom };
  };
  let r = await click();
  expect('jumping to a mark on another page brings it into sight', r.inSight && r.positions.length >= 2, r);
  r = await click();
  expect('jumping again to a mark in sight leaves the page alone', r.inSight && r.positions.length === 1, r);

  // The case that reported it: zoomed in, on the mark's own page, scrolled
  // past it — the mark above the top edge. The page is already the right one;
  // the jump still has to bring the words back into sight.
  main.view.viewer.child.pdfViewer.pdfViewer.currentScaleValue = '1.35';
  await sleep(1200);
  const farEl = () => main.view.containerEl.querySelector(`.at-pdf-hl[data-at-id="${farMark.id}"]`);
  await waitFor(farEl);
  if (farEl()) {
    scroller().scrollTop += farEl().getBoundingClientRect().bottom - scroller().getBoundingClientRect().top + 80;
    await sleep(600);
    r = await click();
    expect('zoomed in and scrolled past a mark on its own page, the jump brings it back into sight', r.inSight, r);
  }
  main.view.viewer.child.pdfViewer.pdfViewer.currentScaleValue = 'auto';
} finally {
  window.getSelection().removeAllRanges();
  for (const id of made) await plugin.store.remove(PATH, id);
  await main.setViewState({ type: 'empty' });
}
return { failures };
