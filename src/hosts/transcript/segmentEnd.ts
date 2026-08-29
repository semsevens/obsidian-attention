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
