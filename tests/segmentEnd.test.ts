import { describe, expect, it } from 'vitest';
import { endOfSegment, PLAY_ON } from '../src/hosts/transcript/segmentEnd';

const STARTS = [0, 3.5, 7.25, 11];

describe('endOfSegment', () => {
  it('ends a line where the next one begins', () => {
    expect(endOfSegment(STARTS, 3.5, 20)).toBe(7.25);
  });

  it('ends the last line at the end of the recording', () => {
    expect(endOfSegment(STARTS, 11, 20)).toBe(20);
  });

  it('does not care what order the starts arrive in', () => {
    expect(endOfSegment([11, 0, 7.25, 3.5], 3.5, 20)).toBe(7.25);
  });

  it('works from a start that is between segments', () => {
    expect(endOfSegment(STARTS, 5, 20)).toBe(7.25);
  });

  // Metadata may not have loaded, and a stream has no end at all. Stopping
  // immediately would be worse than not stopping.
  it('keeps playing when the duration is unknown', () => {
    expect(endOfSegment(STARTS, 11, NaN)).toBe(PLAY_ON);
    expect(endOfSegment(STARTS, 11, 0)).toBe(PLAY_ON);
    expect(endOfSegment(STARTS, 11, Infinity)).toBe(PLAY_ON);
  });

  it('keeps playing when there are no segments to go on', () => {
    expect(endOfSegment([], 3.5, NaN)).toBe(PLAY_ON);
  });

  it('ignores starts that are not numbers', () => {
    expect(endOfSegment([0, NaN, 7.25], 3.5, 20)).toBe(7.25);
  });

  it('skips a segment that starts at the same moment', () => {
    expect(endOfSegment([0, 3.5, 3.5, 7.25], 3.5, 20)).toBe(7.25);
  });

  // The anchor's start and the DOM's came from two readings of the same track,
  // so they can disagree in the last bits. Treating that as the next segment
  // stops playback the instant it starts, which is what happened.
  it('does not mistake a segment for its own successor', () => {
    expect(endOfSegment([72.762, 74.94200000000001, 77.542], 74.942, 89.96)).toBe(77.542);
  });

  it('still ends at a boundary a tenth of a second away', () => {
    expect(endOfSegment([3.5, 3.6], 3.5, 20)).toBe(3.6);
  });
});
