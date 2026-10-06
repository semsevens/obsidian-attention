// The data model. One annotation = an anchor (where) + an optional body (what
// you said about it). A highlight is just an annotation whose body is null —
// they are not two different things, so they live in one file and one type.

import type { TextAnchor } from './anchor/textQuote';

// Every host anchors the same way underneath — a quote plus context — so they
// share the shape defined next to the resolver that consumes it.
export type QuoteContext = Pick<TextAnchor, 'quote' | 'prefix' | 'suffix'>;

/**
 * A spot inside a transcript. Anchored to the *media* file, not to a subtitle
 * track — the same media often has several tracks (whisper, vibevoice, …) and
 * re-transcribing must not orphan everything.
 */
export interface TranscriptAnchor extends QuoteContext {
  kind: 'transcript';
  /** The track this was made against, so same-track re-anchoring is exact. */
  track: string;
  /** Segment index within that track — the fast path. */
  seg: number;
  /** Segment start, in seconds. The only thing that survives a track change. */
  start: number;
  charStart: number;
  charEnd: number;
}

/**
 * A spot inside a markdown file. Offsets are a *hint* — the file is editable,
 * so on conflict the quote wins and the offsets get rewritten.
 */
export type MarkdownAnchor = TextAnchor & {
  kind: 'markdown';
  /**
   * For an image: something stable from the `src` it was rendered with.
   *
   * The embed in the file and the picture on screen need not agree. A tool that
   * caches remote images locally serves an `app://` path bearing no relation to
   * the URL in the note, so the embed alone can't find the drawn image again.
   * Recorded when the mark is made, and used only as a hint — if it stops
   * matching, the embed still identifies the mark.
   */
  imageHint?: string;
};

/**
 * Where a passage sits on one page of a PDF, in Obsidian's own terms: the
 * `selection=` of a `#page=…&selection=…` link, which PDF++ reads and writes.
 * Indices are into the page's text items as pdf.js extracts them, so they do
 * not move with zoom or re-rendering — and a PDF, unlike a note, isn't edited.
 */
export interface PdfSpan {
  /** 1-based, as in `#page=`. */
  page: number;
  /** beginIndex, beginOffset, endIndex, endOffset. */
  selection: [number, number, number, number];
}

/**
 * A spot inside a PDF. A passage can run across pages; each page it touches is
 * a span of its own, in order. The quote is what those spans read, joined by
 * newlines, and is kept so a mark can be checked — and shown — without the PDF.
 */
export interface PdfAnchor extends QuoteContext {
  kind: 'pdf';
  spans: PdfSpan[];
  /**
   * A region of a page instead of a run of text — a figure, a table, a
   * formula — drawn with PDF++'s rectangle tool. Its `rect` is in the page's
   * own coordinates, as in a `#page=…&rect=…` link; `spans` is then empty and
   * the quote holds whatever text lies inside, which may be none.
   */
  region?: PdfRegion;
}

export interface PdfRegion {
  page: number;
  /** x1, y1, x2, y2 in PDF units, origin bottom left. */
  rect: [number, number, number, number];
}

/** The page a PDF mark starts on. */
export function pdfPage(anchor: PdfAnchor): number {
  return anchor.region?.page ?? anchor.spans[0]?.page ?? 1;
}

export type Anchor = TranscriptAnchor | MarkdownAnchor | PdfAnchor;

export interface Annotation {
  id: string;
  anchor: Anchor;

  /**
   * Every time this passage caught you, oldest first.
   *
   * A line can move you more than once, months apart, and that is not a
   * duplicate to be cleaned up — it is the strongest signal this plugin
   * records. Marking something already marked appends here rather than
   * creating a second annotation, so the length is how many times it landed.
   */
  hits: string[];

  /** null = a plain mark. A string = a comment (which also marks). */
  body: string | null;
  updated?: string;

  /** Every time this annotation resurfaced in a review, oldest first. */
  reviewed: string[];

  /**
   * How many times this spot was replayed (transcript only, opt-in).
   * Implicit attention: weaker than a mark, but far denser.
   */
  replays?: number;

  /** Written by versions before marks shared one configurable colour. */
  color?: string;
}

/** When this passage first caught you. */
export function firstMarked(a: Annotation): string {
  return a.hits[0] ?? '';
}

/** The most recent time it caught you — what "marked this week" should mean. */
export function lastMarked(a: Annotation): string {
  return a.hits[a.hits.length - 1] ?? '';
}

/**
 * Bring an annotation written by an older version up to date.
 *
 * Applied on read rather than by migrating files: a sidecar someone edited or
 * synced from an older install shouldn't need a separate upgrade step.
 */
export function normalize(raw: Annotation & { created?: string }): Annotation {
  if (Array.isArray(raw.hits) && raw.hits.length > 0) return raw;
  const created = raw.created ?? new Date().toISOString();
  return { ...raw, hits: [created] };
}

/** The shape of a `<file>.anno.json` sidecar. */
export interface AnnotationFile {
  version: 1;
  /** Vault path of the file these annotations belong to. */
  target: string;
  annotations: Annotation[];
}

export function emptyFile(target: string): AnnotationFile {
  return { version: 1, target, annotations: [] };
}

/** Short, collision-resistant enough for a per-file list. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function isComment(a: Annotation): boolean {
  return a.body !== null && a.body.trim().length > 0;
}

/** Do these two anchors point at the same passage? */
export function sameSpot(a: Anchor, b: Anchor): boolean {
  if (a.kind !== b.kind) return false;
  if (a.quote !== b.quote) return false;
  if (a.kind === 'markdown' && b.kind === 'markdown') {
    // Overlap rather than equality: offsets drift as the file is edited.
    return a.from < b.to && b.from < a.to;
  }
  if (a.kind === 'transcript' && b.kind === 'transcript') {
    return a.seg === b.seg || Math.abs(a.start - b.start) < 0.5;
  }
  if (a.kind === 'pdf' && b.kind === 'pdf') {
    // The same region, give or take the rounding of a drag.
    if (a.region || b.region) {
      return !!a.region && !!b.region && a.region.page === b.region.page &&
        a.region.rect.every((v, i) => Math.abs(v - b.region!.rect[i]) < 1);
    }
    // The same quote starting at the same place on the same page. A repeated
    // phrase elsewhere on the page starts somewhere else.
    const [x, y] = [a.spans[0], b.spans[0]];
    return !!x && !!y && x.page === y.page &&
      x.selection[0] === y.selection[0] && x.selection[1] === y.selection[1];
  }
  return false;
}
