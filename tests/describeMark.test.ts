import { describe, expect, it } from 'vitest';
import { describeMark } from '../src/store/describeMark';
import { Annotation } from '../src/model';

const when = (iso: string) => iso.slice(0, 10);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const textMark = (over: Partial<Annotation> = {}): Annotation => ({
  id: 'a',
  anchor: { kind: 'markdown', quote: 'the passage', prefix: '', suffix: '', from: 0, to: 11 },
  hits: ['2026-08-29T00:00:00.000Z'],
  body: null,
  reviewed: [],
  ...over,
} as Annotation);

describe('describeMark', () => {
  it('leads with the passage, as a quotation', () => {
    const { text } = describeMark(textMark(), { targetPath: 'notes/a.md', when });
    expect(text.startsWith('> the passage')).toBe(true);
  });

  it('says which file it came from, path and all', () => {
    const { text } = describeMark(textMark(), { targetPath: 'raw/in/a note.md', when });
    expect(text).toContain('Source: raw/in/a note.md');
  });

  it('includes the comment when there is one', () => {
    const { text } = describeMark(textMark({ body: '好美' }), { targetPath: 'a.md', when });
    expect(text).toContain('好美');
  });

  it('leaves no empty space where a comment would be', () => {
    const { text } = describeMark(textMark(), { targetPath: 'a.md', when });
    expect(text).toBe('> the passage\n\nSource: a.md\nMarked: 2026-08-29');
  });

  it('quotes every line of a passage that spans several', () => {
    const { text } = describeMark(
      textMark({ anchor: { kind: 'markdown', quote: 'one\ntwo', prefix: '', suffix: '', from: 0, to: 7 } } as Partial<Annotation>),
      { targetPath: 'a.md', when },
    );
    expect(text).toContain('> one\n> two');
  });

  it('counts the times a passage caught you', () => {
    const { text } = describeMark(
      textMark({ hits: ['2026-08-01T00:00:00.000Z', '2026-08-29T00:00:00.000Z'] }),
      { targetPath: 'a.md', when },
    );
    expect(text).toContain('Marked 2×: 2026-08-01, 2026-08-29');
  });

  it('gives the position in the recording for a transcript mark', () => {
    const spoken = textMark({
      anchor: { kind: 'transcript', quote: 'said aloud', prefix: '', suffix: '', track: 'talk.srt', seg: 3, start: 74.9, charStart: 0, charEnd: 10 },
    } as Partial<Annotation>);
    const { text } = describeMark(spoken, { targetPath: 'talk.srt', when, clock });
    expect(text).toContain('At: 1:14');
  });

  it('says nothing about time for a mark in a note', () => {
    const { text } = describeMark(textMark(), { targetPath: 'a.md', when, clock });
    expect(text).not.toContain('At:');
  });
});
