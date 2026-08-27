import { describe, it, expect } from 'vitest';
import { sortAnnotations, sortsFor, resolveSort } from '../src/store/sorting';
import { Annotation } from '../src/model';

const at = (id: string, hits: string[]): { annotation: Annotation } => ({
  annotation: {
    id,
    anchor: { kind: 'markdown', quote: id, prefix: '', suffix: '', from: 0, to: 1 },
    body: null,
    hits,
    reviewed: [],
  },
});

const A = at('A', ['2026-01-01T00:00:00Z', '2026-08-01T00:00:00Z']);           // old, marked 2×
const B = at('B', ['2026-07-01T00:00:00Z']);                                   // newer, marked once
const C = at('C', ['2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z', '2026-04-01T00:00:00Z']); // marked 3×

describe('sortAnnotations', () => {
  it('recent orders by the latest hit, not the first', () => {
    expect(sortAnnotations([B, A, C], 'recent').map(x => x.annotation.id)).toEqual(['A', 'B', 'C']);
  });

  it('oldest orders by the first hit', () => {
    expect(sortAnnotations([B, A, C], 'oldest').map(x => x.annotation.id)).toEqual(['A', 'C', 'B']);
  });

  it('marks puts the most-marked first, breaking ties by recency', () => {
    expect(sortAnnotations([B, A, C], 'marks').map(x => x.annotation.id)).toEqual(['C', 'A', 'B']);
  });

  it('leaves the caller’s array alone', () => {
    const input = [B, A, C];
    sortAnnotations(input, 'marks');
    expect(input.map(x => x.annotation.id)).toEqual(['B', 'A', 'C']);
  });
});

describe('which sorts each lens offers', () => {
  it('offers document order only within a file', () => {
    expect(sortsFor('file')).toContain('document');
    expect(sortsFor('all')).not.toContain('document');
  });

  it('falls back when a sort does not apply to the lens', () => {
    // Switching from This note to All while sorted by position must not leave
    // the panel silently unsorted.
    expect(resolveSort('document', 'all')).toBe('recent');
    expect(resolveSort('document', 'file')).toBe('document');
    expect(resolveSort('marks', 'all')).toBe('marks');
  });
});
