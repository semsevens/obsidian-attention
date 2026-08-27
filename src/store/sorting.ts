// How the panel orders what it shows.
//
// Pure functions over annotations so the orderings can be pinned down by tests
// — an ordering that silently falls back to "whatever the index happened to
// hold" is the kind of thing nobody notices until they go looking for
// something and it isn't where they expect.

import { Annotation, firstMarked, lastMarked } from '../model';

export type Sort = 'recent' | 'marks' | 'oldest' | 'document';

export const SORT_LABELS: Record<Sort, string> = {
  recent: 'Recently marked',
  marks: 'Times marked',
  oldest: 'First marked',
  document: 'Document order',
};

/** Document order is only meaningful within one file. */
export function sortsFor(lens: 'file' | 'all'): Sort[] {
  return lens === 'file'
    ? ['document', 'recent', 'marks', 'oldest']
    : ['recent', 'marks', 'oldest'];
}

export function resolveSort(sort: Sort, lens: 'file' | 'all'): Sort {
  return sortsFor(lens).includes(sort) ? sort : 'recent';
}

/**
 * Order `annotations` by `sort`.
 *
 * 'document' is handled by the caller, which is the only place that can read
 * the file the offsets refer to; here it falls through to insertion order.
 */
export function sortAnnotations<T extends { annotation: Annotation }>(
  items: readonly T[],
  sort: Sort,
): T[] {
  const out = [...items];
  switch (sort) {
    case 'recent':
      return out.sort((a, b) =>
        lastMarked(b.annotation).localeCompare(lastMarked(a.annotation)));
    case 'oldest':
      return out.sort((a, b) =>
        firstMarked(a.annotation).localeCompare(firstMarked(b.annotation)));
    case 'marks':
      // Most-marked first, then most recent — among passages that caught you
      // the same number of times, the fresher one is the more useful answer.
      return out.sort((a, b) =>
        b.annotation.hits.length - a.annotation.hits.length ||
        lastMarked(b.annotation).localeCompare(lastMarked(a.annotation)));
    default:
      return out;
  }
}
