# Fixtures

`fixtures/vault` **is** the development vault: open it in Obsidian as a vault
of its own (never the one holding real writing), and list it first in
`.dev-vault` so every build is deployed into it:

```bash
echo "$PWD/fixtures/vault" > .dev-vault
```

Its settings are kept here; the plugins it uses are not (they are other
people's code) — install Hot Reload, Media Transcript, Archive Redirect,
Asciinema Player and PDF++ into it once. Marks made while testing (`*.anno.json`) and
recordings (`录音/`) are ignored.

## End to end

```bash
npm run e2e
```

builds a debug version of the plugin into the vault and has Obsidian make a
few thousand random selections across every note here, checking each is
captured as the source the reader was looking at; then jumps to marks — on
words and on a picture — from the review panel, and marks a PDF through PDF++.

The vault has to be open, but not in front: the debug build keeps its window
drawing in the background and stops it from ever coming forward, so you can
go on reading another vault while it runs. Nothing moves the real mouse. The
one thing it borrows is the clipboard: PDF++ copies a link when the rectangle
test draws on a PDF, and the test puts your clipboard text back afterwards.
`E2E_FOREGROUND=1` brings the window forward first, for when it won't run in
the background. Point it at a real vault to find the next case:

```bash
E2E_VAULT=~/Desktop/ob/me E2E_FOLDER=raw/in E2E_NOTES=12 npm run e2e
```

When that finds something, write the smallest note here that reproduces it —
in your own words: the repository is public and clipped articles are not ours
to publish — and add a test beside the fix.

## The notes

Each one exists for a case that has broken at least once:

| File | What it is for |
|---|---|
| `plain-note.md` | the ordinary path, plus a phrase repeated three times (ordinal mapping) |
| `宿主.md` / `被嵌入.md` | a transclusion — a mark inside it belongs to the embedded note, not the host |
| `表格.md` | marks inside a table, which Live Preview renders as a widget |
| `编辑韧性.md` | text inserted above a mark, pushing every offset along |
| `含点的.文件名.md` | a dot in the filename: the sidecar appends to the whole name rather than treating `.文件名` as a marker |
| `周报.md` | plain prose, for sorting and the review panel |
| `图片.md` | frontmatter, then: an image directly under the fence, one sharing its line with a caption, one alone on its line, the same remote image twice, and a very long URL |
| `图片宿主.md` | transcludes the above — an image marked inside it belongs to `图片.md`, whose source has the embed |
| `代码与列表.md` | marks in a code block, a list, a quote, and across inline markup |
| `很长的笔记.md` | long enough that reading mode has not rendered the end of it — a mark there is not in the document until something scrolls to it. Near the end, a picture: jumping to a mark on it must find the picture, and a picture the editor draws only once scrolled to must still show its mark |
| `混排与表情.md` | Chinese, English and emoji on one line: offsets are UTF-16 code units, and an emoji is more than one |
| `同名媒体.md` | a reminder that `x.mp4` and `x.m4a` get a sidecar each |
| `选区-记号.md` | everything the screen draws differently from the source: `<sup>` footnote markers, `snake_case` in and out of code, fenced code, backslash escapes, `****literal asterisks****`, list, task and quote markers, math, a table, entities, an autolink |
| `选区-脚注.md` | footnotes, which Obsidian renumbers and gathers at the end while recording that section as the note's last line |
| `选区-插件渲染.md` | a block another plugin draws (Asciinema Player): its text on screen is not in the file at all |
| `属性选区.md` | a description that repeats the first sentence, so the properties table shows it twice more |
| `注意力笔记.pdf` | three pages of Chinese and English, printed to PDF from HTML by Chrome — which, like most macOS PDF output, stores some characters as radicals (`⼒` for 力). A phrase repeats on every page, and a paragraph ends one page where the next begins another |
| `跨段.md` | a clipped-article opening: byline, image with a caption on its line, paragraphs and a list to drag across |

Every row above is a case that has been wrong at some point. The image ones are
worth spelling out, since three separate bugs came from them in one afternoon:
an image alone on its line renders as `<p><img></p>` and has no words beside it
to be identified by; an image directly under the frontmatter is where a drag
in Live Preview starts inside the `---` fence; and a remote image is served
from a local cache once Archive Redirect is installed, so the rendered `src`
looks nothing like the source and matching by address cannot fire.

## Recordings

**Not kept here.** They are megabytes of somebody else's audio,
and a transcript is only interesting alongside the recording it was made from —
so copy a real pair (`x.m4a` and `x.<marker>.json`) out of a real vault into the
development vault when a transcript case needs testing. Real material is worth
testing against: forty-second segments with no word-level timings are the shape
that has caused the most trouble here, and no invented fixture had it.

A development vault wants more than one of them:

- **two tracks for one recording** — `x.<marker>.json` beside a plain `x.json`,
  so the priority that decides which one opens has something to decide between,
  and so a mark filed under the track that is *not* showing demonstrates what
  that means.
- **a video** — the mp4 path renders a player as well as a transcript, and only
  audio has ever been tested here.

`ffmpeg` makes both out of one recording:

```bash
# a second, differently-cut transcription: split each segment in two
# a short video: black frames over the recording's own audio
ffmpeg -f lavfi -i color=c=0x2b2b3d:s=320x180:d=30 -i x.m4a -shortest \
       -c:v libx264 -pix_fmt yuv420p -c:a aac -t 30 short.mp4
```

## Plugins the development vault needs

Attention alone is not enough to reproduce what happens in a real vault:
**Media Transcript** renders the transcripts marks attach to, and **Archive
Redirect** rewrites remote images to a local cache — which is the whole reason
a rendered `src` can disagree with the source. Without it installed, an entire
class of image bug simply cannot happen there.
