# Attention

Record where your attention went — then run into it again.

Highlight and comment on **notes, transcripts and subtitles**, and revisit what you
marked. Annotations live in a sidecar file next to the original; **the original file
is never modified**.

> Most annotation plugins write `==highlights==` into your notes. This one doesn't
> touch them. Most review plugins resurface whole notes, or highlights imported from
> a third-party service. This one resurfaces the passages *you* marked, wherever you
> marked them.

## Using it

Select text in a note and the colour swatches appear; pick one to highlight, or
💬 to write a comment. Turn that off in settings to capture only deliberately.

Either way, right-click a selection for the full menu:

- **Highlight** — in the default colour
- **Highlight in colour…** — pick from the palette
- **Comment…** — write a note against the passage (⌘/Ctrl+Enter saves)

Click a highlight to read its comment; right-click it to edit, recolour or
remove. In editing modes these are appended to Obsidian's own context menu;
reading mode gets its own, raised only when there is something to offer.

The ribbon's highlighter icon opens the panel, which has two views of the same
annotations:

- **This note** — an outline, in document order, for finding your way around
  what you marked here
- **All** — across the vault, grouped by how long ago, with a **Resurface**
  button that brings back a handful you haven't revisited

Clicking an entry jumps to the passage and flashes it. The panel appears on its
own when you open a note that has annotations, and stays out of the way when you
open one that doesn't.

## Versus `==highlight==`

Obsidian's own highlight is markdown syntax living in the note. That makes it
sturdier than anything here — it cannot lose its anchor, because it *is* the
text — and it travels to any markdown tool. What it can't do is carry a comment,
a colour, or a date, or tell you what you marked last week; and it edits the file
to exist at all.

Marks are drawn as an underline by default. They are meant to be many, a page of
filled blocks is unreadable, and a background fill looks exactly like
`==highlight==` — the one thing worth telling apart. Annotations carrying a
comment get a little more weight. Switch to a background fill in settings.

## Status

Working: markdown notes and — when
[Media Transcript](https://github.com/semsevens/obsidian-media-transcript) is
installed — its transcript panel. Marking a transcript line records the moment
it happens at, so the review panel can put you back there: clicking the entry
seeks the player and plays.

Transcript marks belong to the media file rather than to a subtitle track, and
are re-found by timestamp and quote, so re-transcribing with a different engine
doesn't orphan them.

See [`docs/architecture.md`](docs/architecture.md) for the design and what's
still open.

## How it stores things

```
lecture.mp4              ← never touched
lecture.mp4.anno.json    ← your highlights and comments
周报.md                   ← never touched
周报.md.anno.json
```

One sidecar per annotated file, named after the target's full filename. Portable
(move the media, take the annotations), sync-friendly (a conflict touches one file,
not your whole library), and readable.

A highlight and a comment are the same thing — a comment is just an annotation with
a body — so they share one file and one anchor.

## Review

Not spaced repetition. The goal isn't to *memorise* a passage, it's to *run into it
again*, so there's nothing to grade:

- **Time buckets** — today / this week / this month / earlier
- **Resurface** — a random handful, preferring what you haven't revisited

## Building

```bash
npm install
npm run build
cp main.js manifest.json styles.css <vault>/.obsidian/plugins/attention/
```

## License

MIT

## Development

```bash
npm install
npm run dev      # esbuild watch — rebuilds and copies into the dev vault on every save
npm test         # vitest, watch with: npm run test:watch
```

`npm run dev` copies `main.js`, `manifest.json` and `styles.css` into
`~/Desktop/ob/me/.obsidian/plugins/attention/` after every rebuild (`styles.css` is
watched separately, so CSS-only edits deploy too). Point it elsewhere with
`VAULT_PLUGIN_DIR=/path/to/vault/.obsidian/plugins/attention`, or set it empty to
skip deploying.

Copy, not symlink — this repo lives in iCloud Drive, and aiming a vault at an iCloud
path risks Obsidian stalling on an evicted file.

Install [hot-reload](https://github.com/pjeby/hot-reload) in the dev vault and
Obsidian will reload the plugin on every rebuild; the build already writes the
`.hotreload` marker it looks for. Without it, reload manually.

### What is tested

The pure logic — sidecar path rules and the review policy. Both decide whether a
passage you marked can still be found and shown to you again, and both fail
*silently* when wrong, which is exactly what clicking around does not catch. The UI
layers are left to manual testing.
