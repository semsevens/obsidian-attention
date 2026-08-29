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

**Recordings are not kept here.** They are megabytes of somebody else's audio,
and a transcript is only interesting alongside the recording it was made from —
so copy a real pair (`x.m4a` and `x.<marker>.json`) out of a real vault into the
development vault when a transcript case needs testing. Real material is worth
testing against: forty-second segments with no word-level timings are the shape
that has caused the most trouble here, and no invented fixture had it.
