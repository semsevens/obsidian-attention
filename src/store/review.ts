// The review policy, as pure functions over index entries.
//
// Kept free of `obsidian` imports so the rules that decide *what comes back to
// you* can be tested directly — this is the part of the plugin that determines
// whether an old highlight is ever seen again.

import { Annotation } from '../model';

export interface IndexEntry {
  targetPath: string;
  annotation: Annotation;
}

export type Bucket = 'today' | 'week' | 'month' | 'older';

export const BUCKET_ORDER: readonly Bucket[] = ['today', 'week', 'month', 'older'];

const DAY = 86_400_000;

/**
 * Group by age.
 *
 * Deliberately *not* a spaced-repetition schedule: the goal is to run into
 * these again, not to memorise them, so there is nothing to grade and no
 * interval to compute.
 */
export function bucketize(entries: readonly IndexEntry[], now: number): Record<Bucket, IndexEntry[]> {
  const out: Record<Bucket, IndexEntry[]> = { today: [], week: [], month: [], older: [] };
  for (const e of entries) {
    const age = now - Date.parse(e.annotation.created);
    if (age < DAY) out.today.push(e);
    else if (age < 7 * DAY) out.week.push(e);
    else if (age < 30 * DAY) out.month.push(e);
    else out.older.push(e);
  }
  return out;
}

/**
 * Pick `n` entries to resurface, preferring ones you haven't revisited since
 * marking them. `rand` is injected so the ordering is reproducible in tests.
 */
export function pickResurface(
  entries: readonly IndexEntry[],
  n: number,
  rand: () => number,
): IndexEntry[] {
  // Decorate-sort-undecorate: calling `rand()` inside a comparator would give
  // an inconsistent ordering, which is undefined behaviour for Array#sort.
  const decorated = entries.map(entry => ({ entry, jitter: rand() }));
  decorated.sort((a, b) => {
    const seen = a.entry.annotation.reviewed.length - b.entry.annotation.reviewed.length;
    if (seen !== 0) return seen;
    return a.jitter - b.jitter;
  });
  return decorated.slice(0, Math.max(0, n)).map(d => d.entry);
}

/** Newest first. Stable for equal timestamps. */
export function byNewest(a: IndexEntry, b: IndexEntry): number {
  return b.annotation.created.localeCompare(a.annotation.created);
}
