# Attention

Record where your attention went — then run into it again.

Highlight and comment on **notes, transcripts and subtitles**, and revisit what you
marked. Annotations live in a sidecar file next to the original; **the original file
is never modified**.

> Most annotation plugins write `==highlights==` into your notes. This one doesn't
> touch them. Most review plugins resurface whole notes, or highlights imported from
> a third-party service. This one resurfaces the passages *you* marked, wherever you
> marked them.

## Status

Early. The storage layer, the attention index and the review panel work; the
capture surfaces (markdown and transcript) are not implemented yet — see
[`docs/architecture.md`](docs/architecture.md) for the design and what's left.

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
