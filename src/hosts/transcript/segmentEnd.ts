/**
 * Where a marked line stops.
 *
 * A transcript anchor stores only where its segment begins — that is the one
 * thing that survives being re-anchored against a different track. The end has
 * to be worked out from its neighbours: a line runs until the next one starts.
 */

/** Not knowing where to stop is not the same as stopping at zero. */
export const PLAY_ON = Infinity;

/**
 * How far apart two starts must be to be different segments.
 *
 * The anchor's start was stored from one reading of the track and the DOM's
 * from another, so the same moment can come back as 74.942 and
 * 74.94200000000001 — enough for a segment to look like its own successor,
 * which ends playback the instant it begins. No real subtitle line is a
 * hundredth of a second long.
 */
const SAME_MOMENT = 0.01;

/**
 * The moment playback should stop, given every segment start in the track.
 *
 * `duration` closes the last segment. When it is unknown — metadata not loaded
 * yet, a stream — the answer is to keep playing rather than to stop at once.
 */
export function endOfSegment(
  starts: readonly number[],
  start: number,
  duration: number,
): number {
  const next = starts
    .filter(s => Number.isFinite(s) && s > start + SAME_MOMENT)
    .sort((a, b) => a - b)[0];
  if (next !== undefined) return next;
  return Number.isFinite(duration) && duration > start ? duration : PLAY_ON;
}

export interface Segment {
  start: number;
  text: string;
}

/**
 * Sentence-final punctuation, in both widths.
 *
 * A closing quote or bracket may follow the mark that ends the sentence, so
 * they are allowed to trail it.
 */
const ENDS_SENTENCE = /[。．.！!？?…]+["'’”」』）)\]]*\s*$/;

/**
 * A line is short. Extending too far turns "play this" into "play the rest of
 * the talk", so an unpunctuated transcript still stops somewhere sensible.
 */
const MOST_SEGMENTS = 12;
const MOST_SECONDS = 45;

/**
 * Where the marked *passage* stops — the sentence, not the subtitle line.
 *
 * Subtitles are cut to fit on screen, so one line is a fragment: hearing only
 * it is like reading half a sentence. Playback runs on until a line closes a
 * sentence, which is the smallest unit that is actually worth listening to.
 *
 * A transcript with no punctuation at all — some speech recognition emits
 * none — would otherwise play to the end of the recording, so the reach is
 * capped in both segments and seconds.
 */
export function endOfPassage(
  segments: readonly Segment[],
  start: number,
  duration: number,
): number {
  const ordered = [...segments]
    .filter(s => Number.isFinite(s.start))
    .sort((a, b) => a.start - b.start);
  const starts = ordered.map(s => s.start);

  const first = ordered.findIndex(s => s.start > start - SAME_MOMENT);
  if (first < 0) return endOfSegment(starts, start, duration);

  for (let i = first; i < ordered.length && i - first < MOST_SEGMENTS; i++) {
    const closes = ENDS_SENTENCE.test(ordered[i].text.trim());
    const over = ordered[i].start - start > MOST_SECONDS;
    if (closes || over) return endOfSegment(starts, ordered[i].start, duration);
  }

  const last = ordered[Math.min(first + MOST_SEGMENTS - 1, ordered.length - 1)];
  return endOfSegment(starts, last.start, duration);
}

/** A moment of run-up, so playback doesn't clip the first syllable. */
const LEAD_IN = 0.4;

/**
 * Below this, a line is short enough to just play. Guessing at a position
 * inside three seconds of speech buys nothing and can only be wrong.
 */
const WORTH_SEEKING_INTO = 3;

/**
 * Where in the recording the marked words actually are.
 *
 * A subtitle line can be long — twenty seconds is not unusual once a
 * transcriber merges a speaker's run together — and an anchor only stores
 * where that line *begins*. Seeking there plays everything said before the
 * marked words, which sounds like clicking a mark and getting the wrong
 * passage.
 *
 * Without word-level timings the best available answer is where the words sit
 * in the line, read as a fraction of it. That is only as even as the speaker
 * was, so it is an estimate — but an estimate inside the right line beats the
 * start of a line the reader was not pointing at.
 */
export function startOfMark(
  segmentStart: number,
  segmentEnd: number,
  text: string,
  charStart: number,
): number {
  const span = segmentEnd - segmentStart;
  if (!Number.isFinite(span) || span < WORTH_SEEKING_INTO || text.length === 0) return segmentStart;

  const through = Math.min(Math.max(charStart, 0), text.length) / text.length;
  const at = segmentStart + through * span - LEAD_IN;
  return Math.max(segmentStart, at);
}
