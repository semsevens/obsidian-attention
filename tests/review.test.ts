import { describe, it, expect } from 'vitest';
import { bucketize, pickResurface, IndexEntry } from '../src/store/review';
import { Annotation } from '../src/model';

const DAY = 86_400_000;
const NOW = Date.parse('2026-08-27T12:00:00.000Z');

function entry(opts: { agoMs?: number; reviewed?: number; id?: string }): IndexEntry {
  const annotation: Annotation = {
    id: opts.id ?? 'x',
    anchor: { kind: 'markdown', from: 0, to: 1, quote: 'q', prefix: '', suffix: '' },
    body: null,
    hits: [new Date(NOW - (opts.agoMs ?? 0)).toISOString()],
    reviewed: Array.from({ length: opts.reviewed ?? 0 }, () => '2026-01-01T00:00:00.000Z'),
  };
  return { targetPath: 'a.md', annotation };
}

describe('bucketize', () => {
  it('places entries in the bucket matching their age', () => {
    const b = bucketize(
      [
        entry({ agoMs: 0, id: 'now' }),
        entry({ agoMs: 3 * DAY, id: 'week' }),
        entry({ agoMs: 10 * DAY, id: 'month' }),
        entry({ agoMs: 400 * DAY, id: 'old' }),
      ],
      NOW,
    );
    expect(b.today.map(e => e.annotation.id)).toEqual(['now']);
    expect(b.week.map(e => e.annotation.id)).toEqual(['week']);
    expect(b.month.map(e => e.annotation.id)).toEqual(['month']);
    expect(b.older.map(e => e.annotation.id)).toEqual(['old']);
  });

  it('puts each boundary in the older of the two buckets', () => {
    const at = (ms: number) => bucketize([entry({ agoMs: ms })], NOW);
    expect(at(DAY - 1).today).toHaveLength(1);
    expect(at(DAY).week).toHaveLength(1);
    expect(at(7 * DAY - 1).week).toHaveLength(1);
    expect(at(7 * DAY).month).toHaveLength(1);
    expect(at(30 * DAY - 1).month).toHaveLength(1);
    expect(at(30 * DAY).older).toHaveLength(1);
  });

  it('handles an empty index', () => {
    const b = bucketize([], NOW);
    expect([...b.today, ...b.week, ...b.month, ...b.older]).toHaveLength(0);
  });
});

describe('pickResurface', () => {
  const seeded = () => { let i = 0; return () => ((i = (i * 9301 + 49297) % 233280) / 233280); };

  it('prefers annotations that have never been revisited', () => {
    const picked = pickResurface(
      [
        entry({ reviewed: 3, id: 'seen-thrice' }),
        entry({ reviewed: 0, id: 'unseen' }),
        entry({ reviewed: 1, id: 'seen-once' }),
      ],
      3,
      seeded(),
    );
    expect(picked.map(e => e.annotation.id)).toEqual(['unseen', 'seen-once', 'seen-thrice']);
  });

  it('returns at most n, and copes with n beyond the pool', () => {
    const pool = [entry({ id: 'a' }), entry({ id: 'b' })];
    expect(pickResurface(pool, 1, seeded())).toHaveLength(1);
    expect(pickResurface(pool, 99, seeded())).toHaveLength(2);
    expect(pickResurface(pool, 0, seeded())).toHaveLength(0);
    expect(pickResurface(pool, -5, seeded())).toHaveLength(0);
  });

  it('does not mutate the caller’s array', () => {
    const pool = [entry({ reviewed: 5, id: 'a' }), entry({ reviewed: 0, id: 'b' })];
    const before = pool.map(e => e.annotation.id);
    pickResurface(pool, 2, seeded());
    expect(pool.map(e => e.annotation.id)).toEqual(before);
  });
});
