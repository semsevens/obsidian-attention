# Fixtures

Notes to annotate while testing by hand. Copy them into a **development
vault** — never the one holding real writing:

```bash
cp fixtures/vault/*.md "$(cat .dev-vault)/_test/"
```

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
| `很长的笔记.md` | long enough that reading mode has not rendered the end of it — a mark there is not in the document until something scrolls to it |
| `混排与表情.md` | Chinese, English and emoji on one line: offsets are UTF-16 code units, and an emoji is more than one |
| `同名媒体.md` | a reminder that `x.mp4` and `x.m4a` get a sidecar each |

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
