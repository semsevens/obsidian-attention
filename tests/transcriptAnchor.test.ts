import { describe, it, expect } from 'vitest';
import {
  resolveTranscript,
  describeTranscript,
  Seg,
  TIME_TOLERANCE_S,
} from '../src/anchor/transcriptAnchor';
import { TranscriptAnchor } from '../src/model';

// Track A: as one engine segmented it.
const TRACK_A = 'lecture.whisper.json';
const segsA: Seg[] = [
  { seg: 1, start: 0.0, text: '所以这里的反向传播并不需要额外的显存' },
  { seg: 2, start: 5.2, text: '用计算换显存就是这个思路' },
  { seg: 3, start: 11.8, text: '反向传播是关键' },
];

// Track B: another engine — different boundaries, and it misheard a word.
const TRACK_B = 'lecture.vibevoice.json';
const segsB: Seg[] = [
  { seg: 1, start: 0.4, text: '所以这里的反向传播并不需要额外的显存，用计算换显存' },
  { seg: 2, start: 11.5, text: '就是这个思路，反向传播是关键' },
];

function anchorOn(segs: Seg[], seg: number, from: number, to: number, track: string): TranscriptAnchor {
  return describeTranscript(segs.find(s => s.seg === seg)!, from, to, track);
}

describe('describeTranscript', () => {
  it('captures quote, context and the timeline position', () => {
    const a = anchorOn(segsA, 1, 5, 9, TRACK_A);
    expect(a.quote).toBe('反向传播');
    expect(a.prefix).toBe('所以这里的');
    expect(a.suffix).toBe('并不需要额外的显存');
    expect(a.start).toBe(0);
    expect(a.track).toBe(TRACK_A);
  });
});

describe('resolveTranscript on the track it was made against', () => {
  it('hits the stored offsets directly', () => {
    const a = anchorOn(segsA, 1, 5, 9, TRACK_A);
    expect(resolveTranscript(segsA, a, TRACK_A)).toEqual({
      seg: 1, charStart: 5, charEnd: 9, how: 'exact',
    });
  });

  it('follows the quote when the line was re-generated slightly differently', () => {
    const a = anchorOn(segsA, 1, 5, 9, TRACK_A);
    const edited: Seg[] = [{ seg: 1, start: 0, text: '嗯，所以这里的反向传播并不需要额外的显存' }];
    const hit = resolveTranscript(edited, a, TRACK_A)!;
    expect(hit.how).toBe('drifted');
    expect(edited[0].text.slice(hit.charStart, hit.charEnd)).toBe('反向传播');
  });
});

describe('resolveTranscript across tracks', () => {
  // The point of anchoring to the media rather than the track: swap ASR engines
  // and the marks should still land.
  it('finds the passage in a differently-segmented track', () => {
    const a = anchorOn(segsA, 1, 5, 9, TRACK_A); // 反向传播 at t=0
    const hit = resolveTranscript(segsB, a, TRACK_B)!;
    expect(hit.how).toBe('retimed');
    expect(hit.seg).toBe(1);
    expect(segsB[0].text.slice(hit.charStart, hit.charEnd)).toBe('反向传播');
  });

  it('uses the timestamp to pick between repeated phrases', () => {
    // 反向传播 appears in both of track B's segments; the anchor is at t=11.8,
    // so it must land in the second, not the first.
    const a = anchorOn(segsA, 3, 0, 4, TRACK_A);
    expect(a.start).toBe(11.8);
    const hit = resolveTranscript(segsB, a, TRACK_B)!;
    expect(hit.seg).toBe(2);
    expect(segsB[1].text.slice(hit.charStart, hit.charEnd)).toBe('反向传播');
  });

  it('ignores a match too far from the remembered time', () => {
    const a = anchorOn(segsA, 1, 5, 9, TRACK_A); // t=0
    const far: Seg[] = [{ seg: 1, start: 600, text: '反向传播是关键' }];
    // Sole match in the track, so it is accepted — but as 'unique', not 'retimed'.
    expect(resolveTranscript(far, a, TRACK_B)!.how).toBe('unique');
  });

  it('refuses to guess between several distant matches', () => {
    const a = anchorOn(segsA, 1, 5, 9, TRACK_A);
    const far: Seg[] = [
      { seg: 1, start: 600, text: '反向传播是关键' },
      { seg: 2, start: 900, text: '再说一次反向传播' },
    ];
    expect(resolveTranscript(far, a, TRACK_B)).toBeNull();
  });

  it('returns null when the passage is gone entirely', () => {
    const a = anchorOn(segsA, 1, 5, 9, TRACK_A);
    expect(resolveTranscript([{ seg: 1, start: 0, text: '完全不同的内容' }], a, TRACK_B)).toBeNull();
  });

  it('searches a window on both sides of the timestamp', () => {
    const a = anchorOn(segsA, 2, 0, 2, TRACK_A); // 用计算, t=5.2
    const shifted: Seg[] = [
      { seg: 1, start: 5.2 - TIME_TOLERANCE_S + 0.1, text: '用计算换显存' },
    ];
    expect(resolveTranscript(shifted, a, TRACK_B)!.how).toBe('retimed');
  });
});
