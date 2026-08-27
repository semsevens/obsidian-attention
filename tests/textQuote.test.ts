import { describe, it, expect } from 'vitest';
import {
  describe as makeAnchor,
  resolve,
  nthOccurrence,
  countOccurrences,
  CONTEXT_LEN,
} from '../src/anchor/textQuote';

const TEXT = 'The quick brown fox jumps over the lazy dog.';

describe('describe', () => {
  it('captures the quote with context on both sides', () => {
    const a = makeAnchor(TEXT, 4, 9); // "quick"
    expect(a.quote).toBe('quick');
    expect(a.prefix).toBe('The ');
    expect(a.suffix).toBe(' brown fox jumps over the lazy d');
    expect(a.suffix).toHaveLength(CONTEXT_LEN);
  });

  it('clamps context at the ends of the file', () => {
    const a = makeAnchor(TEXT, 0, 3);
    expect(a.prefix).toBe('');
    expect(a.quote).toBe('The');
    const b = makeAnchor(TEXT, TEXT.length - 4, TEXT.length);
    expect(b.suffix).toBe('');
  });

  it('keeps at most CONTEXT_LEN characters of context', () => {
    const long = 'x'.repeat(200) + 'NEEDLE' + 'y'.repeat(200);
    const a = makeAnchor(long, 200, 206);
    expect(a.prefix).toHaveLength(CONTEXT_LEN);
    expect(a.suffix).toHaveLength(CONTEXT_LEN);
  });
});

describe('resolve', () => {
  it('takes the fast path when nothing has changed', () => {
    const a = makeAnchor(TEXT, 4, 9);
    expect(resolve(TEXT, a)).toEqual({ from: 4, to: 9, how: 'exact' });
  });

  it('follows the quote when text is inserted before it', () => {
    const a = makeAnchor(TEXT, 4, 9);
    const edited = 'PREAMBLE. ' + TEXT;
    const r = resolve(edited, a);
    expect(r).not.toBeNull();
    expect(edited.slice(r!.from, r!.to)).toBe('quick');
    expect(r!.how).toBe('unique');
  });

  it('picks the right one of several identical quotes using context', () => {
    const text = 'alpha TARGET omega ... beta TARGET gamma';
    const a = makeAnchor(text, 28, 34); // the second TARGET, after "beta "
    expect(a.quote).toBe('TARGET');
    // Shift everything so the stored offsets are stale but context still holds.
    const edited = 'xxxxxxxxxx' + text;
    const r = resolve(edited, a);
    expect(r!.how).toBe('context');
    expect(edited.slice(0, r!.from).endsWith('beta ')).toBe(true);
  });

  it('falls back to the nearest occurrence when no context survives', () => {
    // Offsets are stale (slice(10,13) is 'cab', not the quote) and the stored
    // context matches nowhere, so position is the only signal left.
    const text = 'abc'.repeat(40);
    const a = { quote: 'abc', prefix: 'ZZZ', suffix: 'ZZZ', from: 10, to: 13 };
    const r = resolve(text, a);
    expect(r!.how).toBe('nearest');
    expect(r!.from).toBe(9); // 9 is one away; the next candidate, 12, is two
  });

  it('returns null when the passage is gone', () => {
    const a = makeAnchor(TEXT, 4, 9);
    expect(resolve('a completely different document', a)).toBeNull();
  });

  it('returns null for an empty quote rather than matching everywhere', () => {
    expect(resolve(TEXT, { quote: '', prefix: '', suffix: '', from: 0, to: 0 })).toBeNull();
  });

  it('works on CJK text', () => {
    const text = '所以这里的反向传播并不需要额外的显存。反向传播是关键。';
    const a = makeAnchor(text, 5, 9); // 反向传播 (first)
    expect(a.quote).toBe('反向传播');
    const edited = '前言。' + text;
    const r = resolve(edited, a);
    expect(r!.how).toBe('context');
    expect(edited.slice(r!.from, r!.to)).toBe('反向传播');
    expect(edited.slice(0, r!.from).endsWith('所以这里的')).toBe(true);
  });
});

describe('mapping a reading-mode selection back to the source', () => {
  it('finds the nth occurrence', () => {
    const t = 'a-X-b-X-c-X-d';
    expect(nthOccurrence(t, 'X', 0)).toBe(2);
    expect(nthOccurrence(t, 'X', 1)).toBe(6);
    expect(nthOccurrence(t, 'X', 2)).toBe(10);
    expect(nthOccurrence(t, 'X', 3)).toBe(-1);
  });

  it('is defensive about degenerate input', () => {
    expect(nthOccurrence('abc', '', 0)).toBe(-1);
    expect(nthOccurrence('abc', 'a', -1)).toBe(-1);
    expect(countOccurrences('abc', '')).toBe(0);
  });

  it('counts occurrences before the selection', () => {
    expect(countOccurrences('a-X-b-', 'X')).toBe(1);
    expect(countOccurrences('a-X-b-X-c-', 'X')).toBe(2);
    expect(countOccurrences('nothing here', 'X')).toBe(0);
  });

  it('round-trips: the nth rendered hit is the nth source hit', () => {
    // Markdown emphasis vanishes when rendered, so offsets differ — but the
    // *order* of body text does not, which is what this mapping relies on.
    const source = 'see **TERM** then TERM and *TERM* again';
    const rendered = 'see TERM then TERM and TERM again';
    const selectionStart = rendered.lastIndexOf('TERM'); // the third one
    const ordinal = countOccurrences(rendered.slice(0, selectionStart), 'TERM');
    expect(ordinal).toBe(2);
    const at = nthOccurrence(source, 'TERM', ordinal);
    expect(source.slice(at, at + 4)).toBe('TERM');
    expect(source.slice(0, at).endsWith('*')).toBe(true); // the italic one
  });
});
