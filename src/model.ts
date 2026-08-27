// The data model. One annotation = an anchor (where) + an optional body (what
// you said about it). A highlight is just an annotation whose body is null —
// they are not two different things, so they live in one file and one type.

/** ~32 chars of context on each side, used to re-find a quote after edits. */
export interface QuoteContext {
  quote: string;
  prefix: string;
  suffix: string;
}

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
export interface MarkdownAnchor extends QuoteContext {
  kind: 'markdown';
  from: number;
  to: number;
}

export type Anchor = TranscriptAnchor | MarkdownAnchor;

export interface Annotation {
  id: string;
  anchor: Anchor;
  color: string;
  /** null = a plain highlight. A string = a comment (which also highlights). */
  body: string | null;
  /** ISO timestamps. */
  created: string;
  updated?: string;
  /** Every time this annotation resurfaced in a review, oldest first. */
  reviewed: string[];
  /**
   * How many times this spot was replayed (transcript only, opt-in).
   * Implicit attention: weaker than a highlight, but far denser.
   */
  replays?: number;
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
