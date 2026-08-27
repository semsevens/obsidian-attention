// Re-finding a marked passage in a transcript.
//
// Easier than markdown in one way — subtitle files are generated, not edited,
// so a mark usually sits exactly where it was left — and harder in another: the
// same media can have several tracks, produced by different ASR engines, which
// disagree about both segmentation and wording. Re-transcribing must not throw
// away everything you marked.
//
// The timeline is the one thing every track agrees on, which is why the anchor
// stores `start` and why that is what a cross-track search keys off.

import { TranscriptAnchor } from '../model';

/** A transcript line, as read from whatever track is currently loaded. */
export interface Seg {
  seg: number;
  start: number;
  text: string;
}

export interface TranscriptHit {
  seg: number;
  charStart: number;
  charEnd: number;
  /** How it was found — 'drifted' and 'retimed' mean the anchor should be rewritten. */
  how: 'exact' | 'drifted' | 'retimed' | 'unique';
}

/** How far from the remembered timestamp to look when the track has changed. */
export const TIME_TOLERANCE_S = 3;

export function describeTranscript(
  seg: Seg,
  charStart: number,
  charEnd: number,
  track: string,
  contextLen = 32,
): TranscriptAnchor {
  return {
    kind: 'transcript',
    track,
    seg: seg.seg,
    start: seg.start,
    charStart,
    charEnd,
    quote: seg.text.slice(charStart, charEnd),
    prefix: seg.text.slice(Math.max(0, charStart - contextLen), charStart),
    suffix: seg.text.slice(charEnd, charEnd + contextLen),
  };
}

function commonSuffixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefixLen(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * Locate `anchor` among `segs`, which belong to `currentTrack`.
 *
 * On the track it was made against, the segment index is a direct hit and only
 * needs verifying. On a different track the index means nothing, so candidates
 * are drawn from a window around the remembered timestamp and scored on the
 * surrounding text.
 */
export function resolveTranscript(
  segs: readonly Seg[],
  anchor: TranscriptAnchor,
  currentTrack: string | null,
): TranscriptHit | null {
  if (!anchor.quote) return null;

  const sameTrack = currentTrack != null && currentTrack === anchor.track;

  if (sameTrack) {
    const seg = segs.find(s => s.seg === anchor.seg);
    if (seg) {
      if (seg.text.slice(anchor.charStart, anchor.charEnd) === anchor.quote) {
        return { seg: seg.seg, charStart: anchor.charStart, charEnd: anchor.charEnd, how: 'exact' };
      }
      // The track was regenerated in place and this line shifted a little.
      const at = seg.text.indexOf(anchor.quote);
      if (at >= 0) {
        return { seg: seg.seg, charStart: at, charEnd: at + anchor.quote.length, how: 'drifted' };
      }
    }
  }

  // Different track, or the remembered segment no longer holds the quote: look
  // around the timestamp, which is the only thing tracks agree on.
  const near = segs.filter(s => Math.abs(s.start - anchor.start) <= TIME_TOLERANCE_S);
  const scored: { seg: Seg; at: number; score: number }[] = [];
  for (const s of near) {
    const at = s.text.indexOf(anchor.quote);
    if (at < 0) continue;
    scored.push({
      seg: s,
      at,
      score:
        commonSuffixLen(s.text.slice(0, at), anchor.prefix) +
        commonPrefixLen(s.text.slice(at + anchor.quote.length), anchor.suffix),
    });
  }
  if (scored.length > 0) {
    scored.sort((a, b) =>
      b.score - a.score ||
      Math.abs(a.seg.start - anchor.start) - Math.abs(b.seg.start - anchor.start));
    const best = scored[0];
    return {
      seg: best.seg.seg,
      charStart: best.at,
      charEnd: best.at + anchor.quote.length,
      how: 'retimed',
    };
  }

  // Nothing near the timestamp. Accept a match elsewhere only if it's the only
  // one in the whole track — otherwise we'd be guessing.
  const everywhere = segs.filter(s => s.text.includes(anchor.quote));
  if (everywhere.length === 1) {
    const s = everywhere[0];
    const at = s.text.indexOf(anchor.quote);
    return { seg: s.seg, charStart: at, charEnd: at + anchor.quote.length, how: 'unique' };
  }

  return null;
}
