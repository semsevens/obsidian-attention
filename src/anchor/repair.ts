// Keeping an anchor current as the file it points into changes.
//
// Two mechanisms, deliberately different in kind:
//
//   Mapping — while a note is open, CodeMirror knows exactly what changed, so
//     positions can be carried through an edit rather than searched for. This
//     is exact, and survives edits *inside* the marked passage, which no amount
//     of searching for the old text could.
//
//   Repair — everything else (edits from another app, sync, a note edited while
//     closed) is found by resolve(), and what it finds is written back so the
//     next read takes the fast path instead of searching again forever.
//
// Neither guesses. A passage that is genuinely gone becomes an orphan, because
// a mark silently sitting on the wrong words is worse than one that admits it
// is lost.

import { MarkdownAnchor } from '../model';
import { describe, CONTEXT_LEN } from './textQuote';

/** A change to the document, in the shape CodeMirror reports them. */
export interface Change {
  fromA: number;
  toA: number;
  fromB: number;
  toB: number;
}

/**
 * Carry `[from, to)` through a set of changes.
 *
 * Returns null when the range no longer exists — deleted outright, or eaten
 * from both ends until nothing is left.
 */
export function mapRange(
  from: number,
  to: number,
  changes: readonly Change[],
): { from: number; to: number } | null {
  let a = from;
  let b = to;

  for (const c of changes) {
    const grow = (c.toB - c.fromB) - (c.toA - c.fromA);

    // Entirely after the change: both ends shift by the same amount.
    if (c.toA <= a) {
      a += grow;
      b += grow;
      continue;
    }
    // Entirely before it: untouched.
    if (c.fromA >= b) continue;

    // Overlapping. Clamp each end to the edited region, so text inserted in
    // the middle of a marked passage extends it rather than losing it.
    a = a <= c.fromA ? a : Math.max(c.fromB, Math.min(a + grow, c.toB));
    b = b >= c.toA ? b + grow : Math.max(c.fromB, Math.min(b + grow, c.toB));
    if (b <= a) return null;
  }

  return b > a ? { from: a, to: b } : null;
}

/**
 * Rebuild an anchor around where it now sits.
 *
 * The quote is re-read from the document rather than kept, so a passage edited
 * in place stays marked and the stored text keeps matching what's on screen.
 */
export function reanchor(anchor: MarkdownAnchor, text: string, at: { from: number; to: number }): MarkdownAnchor {
  return { kind: 'markdown', ...describe(text, at.from, at.to) };
}

/** Has anything actually changed? Avoids writing a sidecar for no reason. */
export function anchorsDiffer(a: MarkdownAnchor, b: MarkdownAnchor): boolean {
  return a.from !== b.from || a.to !== b.to || a.quote !== b.quote ||
    a.prefix !== b.prefix || a.suffix !== b.suffix;
}

export { CONTEXT_LEN };
