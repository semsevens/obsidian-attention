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

Select text in a note and a small bar appears: **Mark** it, or 💬 to write a
comment. Click a picture for **Mark**, 💬 and 🔍 — zooming is still there, just no longer
the only thing a click can do. A marked picture gets a ring rather than an
underline, and behaves like any other mark from there. Turn that off in settings to capture only deliberately.

Either way, right-click a selection for the full menu:

- **Highlight** — in the default colour
- **Highlight in colour…** — pick from the palette
- **Comment…** — write a note against the passage (⌘/Ctrl+Enter saves)

Click a mark to read its comment and see every time that passage caught you;
right-click it to edit or remove.

Marking something already marked doesn't create a second mark — it records
another hit. A line that moves you three times over a year is the strongest
thing this plugin can know about you, and the panel shows it as `3×`. In editing modes these are appended to Obsidian's own context menu;
reading mode gets its own, raised only when there is something to offer.

The ribbon's highlighter icon opens the panel, which has two views of the same
annotations:

- **This note** — an outline, in document order, for finding your way around
  what you marked here
- **All** — across the vault, grouped by how long ago, with a **Resurface**
  button that brings back a handful you haven't revisited

Marks follow the note as you edit it — text inserted around them shifts them,
text typed inside them widens them. A passage deleted or replaced outright can't
be followed, so its mark is listed as **lost** rather than quietly discarded: it
keeps its words, its comment and every time it caught you, and can be re-attached
to a new selection without losing any of that.

Sort either view by document position, when it was last or first marked, or how
many times it caught you. Hovering an entry reveals buttons to mark it again, comment on it, or remove it
without going to find it first; right-click gives the full menu. The count
appears only once a passage has caught you more than once. Clicking an entry jumps to the passage and flashes it. The panel appears on its
own when you open a note that has annotations, and stays out of the way when you
open one that doesn't.

## Opening notes in reading mode

Off by default; turn it on under **How notes open**.

Marks live beside the note rather than in it, so reading mode costs nothing
here — you can highlight and comment without ever leaving it. That makes it the
natural way to hold material you collected in order to read it: the note stops
inviting stray keystrokes, and nothing you do to it can be a typo.

It is *not* read-only. Obsidian has no such thing, and this doesn't invent one:
Ctrl+E still switches to editing, and the file stays writable.

- **Everything else opens as** — the vault-wide default.
- **Exceptions by folder** — somewhere you write rather than read. The deepest
  matching folder wins, so `raw` can be reading while `raw/drafts` is not.
- **Frontmatter** overrules both, using the same keys as the *Force note view
  mode* plugin, so notes already carrying them keep working:

  ```yaml
  obsidianUIMode: preview     # or: source
  obsidianEditingMode: live   # or: source
  ```

The mode is chosen when a note is opened, and only then. Press Ctrl+E to fix a
typo, glance at another tab, come back — you are still editing. Plugins that
force the mode on every activation need an "ignore open files" switch to escape
that; not reconsidering is simpler and never surprises you.

> Running a separate view-mode plugin alongside this will make them fight —
> whichever acts last wins, and the winner can change from open to open. Pick
> one.

## On a phone

Everything works, with the gestures a phone has:

- **Select text** and lift your finger — the popover appears once the selection
  stops changing, which is later than the lift, since iOS lets you drag the
  handles afterwards.
- **Press and hold** for the full menu, wherever a right-click would give you
  one: a passage, a picture, an entry in the panel.
- The panel's row actions are always visible there rather than waiting for a
  hover that will never come.

## Versus `==highlight==`

Obsidian's own highlight is markdown syntax living in the note. That makes it
sturdier than anything here — it cannot lose its anchor, because it *is* the
text — and it travels to any markdown tool. What it can't do is carry a comment,
a colour, or a date, or tell you what you marked last week; and it edits the file
to exist at all.

Timestamps use a moment format string — the same vocabulary as daily note
filenames — defaulting to `YYYY-MM-DD HH:mm:ss`. Clear it for relative times
("3 days ago"), which follow your Obsidian's language.

Marks share one colour, set in settings. Choosing a swatch every time turns
noticing something into a decision, and how often a passage caught you carries
more than which shade you picked.

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
the vault named in `.dev-vault` after every rebuild (`styles.css` is
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
