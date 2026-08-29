import { describe, expect, it } from 'vitest';
import { endOfPassage, endOfSegment, startOfMark, PLAY_ON } from '../src/hosts/transcript/segmentEnd';

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

// Real shape: subtitles are cut to fit the screen, so a sentence runs across
// several of them and one line on its own is a fragment.
describe('endOfPassage', () => {
  const talk = [
    { start: 0, text: '大家好，' },
    { start: 3, text: '今天想聊的是' },
    { start: 6, text: '注意力这件事。' },
    { start: 9, text: '为什么呢？' },
    { start: 12, text: '因为它稀缺' },
    { start: 15, text: '而且不可再生。' },
    { start: 18, text: '好，我们开始。' },
  ];

  it('runs to the end of the sentence, not the end of the line', () => {
    expect(endOfPassage(talk, 3, 30)).toBe(9);
  });

  it('starts from the line that was marked, not the one before', () => {
    expect(endOfPassage(talk, 12, 30)).toBe(18);
  });

  it('stops right there when the marked line already ends a sentence', () => {
    expect(endOfPassage(talk, 9, 30)).toBe(12);
  });

  it('ends the last sentence at the end of the recording', () => {
    expect(endOfPassage(talk, 18, 30)).toBe(30);
  });

  it('tolerates the same floating-point drift a single line does', () => {
    const drifted = [{ start: 3.0000000001, text: 'a' }, { start: 6, text: 'b。' }, { start: 9, text: 'c' }];
    expect(endOfPassage(drifted, 3, 30)).toBe(9);
  });

  it('accepts a closing quote after the full stop', () => {
    const quoted = [{ start: 0, text: '他说「够了。」' }, { start: 3, text: '然后走了。' }];
    expect(endOfPassage(quoted, 0, 30)).toBe(3);
  });

  it('handles western punctuation too', () => {
    const english = [{ start: 0, text: 'and so' }, { start: 3, text: 'it goes.' }, { start: 6, text: 'Next.' }];
    expect(endOfPassage(english, 0, 30)).toBe(6);
  });

  // Some speech recognition emits no punctuation at all; without a cap this
  // would play out the rest of the recording.
  it('gives up after a dozen lines when nothing ends a sentence', () => {
    const unpunctuated = Array.from({ length: 40 }, (_, i) => ({ start: i, text: '嗯嗯' }));
    expect(endOfPassage(unpunctuated, 0, 100)).toBe(12);
  });

  it('gives up after forty-five seconds of long lines', () => {
    const slow = Array.from({ length: 8 }, (_, i) => ({ start: i * 20, text: '嗯' }));
    expect(endOfPassage(slow, 0, 400)).toBe(80);
  });

  it('falls back to the plain line end when the mark is past every segment', () => {
    expect(endOfPassage(talk, 100, 120)).toBe(120);
  });
});

// A transcriber that merges a speaker's run produces lines twenty seconds
// long. Seeking to the start of one plays everything before the marked words.
describe('startOfMark', () => {
  const line = '内容和分类的那种先验权重啊然后就是你在游走的时候不是没有权重就只能拿频次来做一个判断标准游走的';

  it('lands near the words, not at the start of a long line', () => {
    const at = startOfMark(7, 27, line, line.indexOf('来做一个'));
    expect(at).toBeGreaterThan(18);
    expect(at).toBeLessThan(24);
  });

  it('stays at the start for words at the start', () => {
    expect(startOfMark(7, 27, line, 0)).toBe(7);
  });

  it('never seeks before the line begins', () => {
    expect(startOfMark(7, 27, line, 1)).toBeGreaterThanOrEqual(7);
  });

  it('leaves a short line alone, where guessing buys nothing', () => {
    expect(startOfMark(7, 8, '好的', 1)).toBe(7);
    expect(startOfMark(7, 9.5, '好的好的', 3)).toBe(7);
  });

  it('falls back to the line start when its end is unknown', () => {
    expect(startOfMark(7, NaN, line, 40)).toBe(7);
    expect(startOfMark(7, 7, line, 40)).toBe(7);
    expect(startOfMark(7, 3, line, 40)).toBe(7);
  });

  it('falls back for an empty line', () => {
    expect(startOfMark(7, 27, '', 0)).toBe(7);
  });

  it('clamps an offset past the end of the line', () => {
    expect(startOfMark(7, 27, line, 9999)).toBeLessThanOrEqual(27);
  });
});
