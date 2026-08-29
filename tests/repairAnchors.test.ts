import { describe as suite, expect, it } from 'vitest';
import { repairAnchor } from '../src/anchor/repairAnchors';
import { describe } from '../src/anchor/textQuote';
import { MarkdownAnchor } from '../src/model';

const NOTE = [
  '---',
  'title: "x"',
  '---',
  '',
  '![banner](https://cdn.example.com/one/0?wx_fmt=jpeg)',
  '',
  '以下是碎碎念：',
  '',
].join('\n');

const IMG = NOTE.indexOf('![banner]');
const IMG_END = NOTE.indexOf(')', IMG) + 1;

const anchorAt = (from: number, to: number): MarkdownAnchor =>
  ({ kind: 'markdown', ...describe(NOTE, from, to) });

// The one that was actually on disk: it began on the fence's last dash and
// stopped partway along the URL, so it rendered as text instead of a picture.
suite('an anchor stored before its edges were checked', () => {
  const broken = anchorAt(IMG - 3, IMG + 40);

  it('is repaired to exactly the embed', () => {
    const fixed = repairAnchor(NOTE, broken)!;
    expect(fixed.quote).toBe('![banner](https://cdn.example.com/one/0?wx_fmt=jpeg)');
    expect(fixed.from).toBe(IMG);
    expect(fixed.to).toBe(IMG_END);
  });

  it('rebuilds the context to match the new edges', () => {
    const fixed = repairAnchor(NOTE, broken)!;
    expect(NOTE.slice(fixed.from - fixed.prefix.length, fixed.from)).toBe(fixed.prefix);
    expect(NOTE.startsWith(fixed.suffix, fixed.to)).toBe(true);
  });

  it('keeps anything else the anchor carried', () => {
    const withHint: MarkdownAnchor = { ...broken, imageHint: 'one' };
    expect(repairAnchor(NOTE, withHint)?.imageHint).toBe('one');
  });
});

suite('anchors left alone', () => {
  it('an anchor already on clean edges', () => {
    expect(repairAnchor(NOTE, anchorAt(IMG, IMG_END))).toBeNull();
  });

  it('an ordinary run of text', () => {
    const from = NOTE.indexOf('以下是');
    expect(repairAnchor(NOTE, anchorAt(from, from + 3))).toBeNull();
  });

  // The file has moved on, so the offsets mean nothing — re-cutting the source
  // at them would swap a findable mark for a wrong one.
  it('an anchor whose offsets no longer describe its quote', () => {
    const stale: MarkdownAnchor = { ...anchorAt(IMG - 3, IMG + 40), quote: 'from another version' };
    expect(repairAnchor(NOTE, stale)).toBeNull();
  });

  it('an anchor that snaps away to nothing', () => {
    const blank = NOTE.indexOf('\n\n以下是');
    expect(repairAnchor(NOTE, anchorAt(blank, blank + 1))).toBeNull();
  });
});
