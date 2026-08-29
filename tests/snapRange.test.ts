import { describe, expect, it } from 'vitest';
import { bodyStart, snapRange } from '../src/anchor/snapRange';

const NOTE = [
  '---',
  'title: "x"',
  'tags: [raw, wechat]',
  '---',
  '',
  '![banner](https://cdn.example.com/one/0?wx_fmt=jpeg)',
  '',
  '以下是碎碎念：',
  '',
  'the last paragraph',
  '',
].join('\n');

const BODY = NOTE.indexOf('![banner]');
const IMG_END = NOTE.indexOf(')', BODY) + 1;

describe('bodyStart', () => {
  it('skips the frontmatter and the blank line after it', () => {
    expect(bodyStart(NOTE)).toBe(BODY);
  });

  it('is zero for a note with no frontmatter', () => {
    expect(bodyStart('just text\n')).toBe(0);
  });

  it('is zero when the fence is never closed', () => {
    expect(bodyStart('---\ntitle: x\nstill open\n')).toBe(0);
  });

  it('is not fooled by a --- later in the body', () => {
    const note = 'body text\n\n---\n\nmore\n';
    expect(bodyStart(note)).toBe(0);
  });
});

// This is the range that actually got stored: a Live Preview drag that began
// in the properties table and ended inside the picture.
describe('the drag that produced a broken quote', () => {
  const from = NOTE.indexOf('---\n\n![banner]') + 2; // the last dash of the fence
  const to = BODY + 40;                              // halfway through the URL

  it('starts at the picture rather than inside the fence', () => {
    expect(snapRange(NOTE, from, to)?.from).toBe(BODY);
  });

  it('ends at the end of the picture rather than mid-URL', () => {
    expect(snapRange(NOTE, from, to)?.to).toBe(IMG_END);
  });

  it('yields exactly the embed, so it can render as one', () => {
    const r = snapRange(NOTE, from, to)!;
    expect(NOTE.slice(r.from, r.to)).toBe('![banner](https://cdn.example.com/one/0?wx_fmt=jpeg)');
  });
});

describe('snapRange', () => {
  it('leaves an ordinary text selection alone', () => {
    const from = NOTE.indexOf('以下是');
    const to = from + 3;
    expect(snapRange(NOTE, from, to)).toEqual({ from, to });
  });

  it('grows a selection that only clips the front of a picture', () => {
    const r = snapRange(NOTE, BODY + 5, NOTE.indexOf('以下是') + 3)!;
    expect(r.from).toBe(BODY);
  });

  it('trims whitespace off both ends', () => {
    const line = '以下是碎碎念：';
    const from = NOTE.indexOf(line);
    const r = snapRange(NOTE, from - 1, from + line.length + 1)!;
    expect(NOTE.slice(r.from, r.to)).toBe(line);
  });

  it('refuses a selection made entirely inside the frontmatter', () => {
    expect(snapRange(NOTE, 4, 12)).toBeNull();
  });

  it('refuses a range that collapses to nothing', () => {
    const blank = NOTE.indexOf('\n\n以下是');
    expect(snapRange(NOTE, blank, blank + 1)).toBeNull();
  });

  it('accepts its bounds in either order and clamps to the source', () => {
    const from = NOTE.indexOf('以下是');
    expect(snapRange(NOTE, from + 3, from)).toEqual({ from, to: from + 3 });
    expect(snapRange(NOTE, from, 10_000)?.to).toBe(NOTE.trimEnd().length);
  });
});
