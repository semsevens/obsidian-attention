// The data model. One annotation = an anchor (where) + an optional body (what
// you said about it). A highlight is just an annotation whose body is null —
// they are not two different things, so they live in one file and one type.

import type { TextAnchor } from './anchor/textQuote';

// Both hosts anchor the same way — a quote plus context — so they share the
// shape defined next to the resolver that consumes it.
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
export type MarkdownAnchor = TextAnchor & { kind: 'markdown' };

export type Anchor = TranscriptAnchor | MarkdownAnchor;

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
  return false;
}
