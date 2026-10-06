// Runs inside Obsidian through the debug bridge (scripts/e2e/debug-entry.js);
// `app` and `plugin` are in scope. See scripts/e2e.mjs.
//
// Clicking a record in the review panel should bring its mark into sight —
// and leave the page alone when the mark is already in sight. It used to
// reopen the note and recentre the mark on every click, so the page jolted
// even when nothing needed to move.
//
// Twice over: for a mark on words, and for a mark on a picture, which is found
// by the `<img>` carrying its id rather than by a highlighted span.

const PATH = '很长的笔记.md';
// Both near the end of a long note, so they start out of sight. The phrase is
// in a paragraph no fixture mark covers, so it is drawn as a highlight of its
// own; the picture is the only one in the note.
const PHRASE = '段落编号 59 在全文里只出现这一次';
const PICTURE = '![[attachments/竹林.png]]';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const file = app.vault.getAbstractFileByPath(PATH);
if (!file) return { skipped: `no ${PATH} in this vault` };
const source = await app.vault.cachedRead(file);
if (!source.includes(PICTURE)) return { skipped: `${PATH} has no ${PICTURE}` };

/** A mark of our own on `quote`, removed at the end: marks are gitignored test state. */
const markOn = async quote => {
  const from = source.lastIndexOf(quote);
  const { annotation, repeat } = await plugin.store.mark(PATH, {
    kind: 'markdown',
    quote,
    prefix: source.slice(Math.max(0, from - 32), from),
    suffix: source.slice(from + quote.length, from + quote.length + 32),
    from,
    to: from + quote.length,
  }, null);
  return { annotation, made: !repeat };
};

// Notes open in the main area's existing tab: a probe has no tab group of its
// own to open new ones in.
let main = null;
app.workspace.iterateAllLeaves(l => { if (!main && l.getRoot() === app.workspace.rootSplit) main = l; });
let panel = app.workspace.getLeavesOfType('attention-review')[0];
if (!panel) {
  panel = app.workspace.getRightLeaf(false) ?? app.workspace.getRightLeaf(true);
  await panel.setViewState({ type: 'attention-review' });
}
const review = panel.view;

const view = () => app.workspace.getLeavesOfType('markdown').find(l => l.view.file?.path === PATH)?.view;
const scroller = () => {
  const v = view();
  if (!v) return null;
  return v.getMode() === 'source'
    ? v.contentEl.querySelector('.cm-scroller')
    : v.previewMode.containerEl.querySelector(':scope > .markdown-preview-view');
};

const failures = [];
const expect = (name, ok, got) => { if (!ok) failures.push({ case: name, got }); };
// Moves at most once: from where it was straight to where it ends.
const once = r => r.positions.filter(y => y >= 0).length <= 2;
const still = r => r.positions.length === 1;

/** Every scenario, for one mark. `what` names it in the failures. */
const scenarios = async (annotation, what) => {
  const inSight = () => {
    const v = view();
    const layer = v.getMode() === 'source' ? '.cm-content' : '.markdown-preview-view';
    const el = v.contentEl.querySelector(`${layer} [data-at-id="${annotation.id}"]`);
    if (!el) return false;
    const r = el.getBoundingClientRect(), p = scroller().getBoundingClientRect();
    return r.height > 0 && r.top >= p.top && r.bottom <= p.bottom;
  };
  const flashed = () => !!view()?.contentEl.querySelector(`[data-at-id="${annotation.id}"].at-flash`);
  /** Click the record; every scroll position seen meanwhile, and how it ended. */
  const click = async () => {
    const seen = [];
    let flash = false;
    const watching = (async () => {
      for (let i = 0; i < 30; i++) {
        const y = Math.round(scroller()?.scrollTop ?? -1);
        if (y !== seen[seen.length - 1]) seen.push(y);
        flash = flash || flashed();
        await sleep(50);
      }
    })();
    await review.jumpTo(annotation, PATH);
    await watching;
    return { positions: seen, inSight: inSight(), flashed: flash };
  };

  await main.openFile(file, { state: { mode: 'preview' } });
  app.workspace.setActiveLeaf(main);
  await sleep(1200);
  scroller().scrollTop = 0;
  await sleep(300);

  let r = await click();
  expect(`${what}, reading: first click brings it into sight, in one move, and flashes it`, r.inSight && once(r) && r.flashed, r);
  r = await click();
  expect(`${what}, reading: clicking again leaves the page alone`, r.inSight && still(r), r);

  scroller().scrollTop += 120;
  await sleep(300);
  if (inSight()) {
    r = await click();
    expect(`${what}, reading: after the reader scrolls, a mark still in sight stays put`, still(r), r);
  }

  await main.setViewState({ type: 'empty' });
  await sleep(300);
  r = await click();
  expect(`${what}: a note not open is opened with the mark in sight`, r.inSight, r);

  await main.setViewState({ type: 'markdown', state: { file: PATH, mode: 'source' } });
  await sleep(1200);
  scroller().scrollTop = 0;
  await sleep(300);
  r = await click();
  expect(`${what}, source: first click brings it into sight, in one move`, r.inSight && once(r), r);
  r = await click();
  expect(`${what}, source: clicking again leaves the page alone`, r.inSight && still(r), r);

  await main.setViewState({ type: 'empty' });
};

const made = [];
try {
  const words = await markOn(PHRASE);
  if (words.made) made.push(words.annotation.id);
  await scenarios(words.annotation, 'a mark on words');

  const picture = await markOn(PICTURE);
  if (picture.made) made.push(picture.annotation.id);
  await scenarios(picture.annotation, 'a mark on a picture');
} finally {
  await main.setViewState({ type: 'empty' });
  for (const id of made) await plugin.store.remove(PATH, id);
}
return { failures };
