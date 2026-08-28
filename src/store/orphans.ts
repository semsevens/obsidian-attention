// Telling apart marks that still point at something from marks that don't.
//
// A mark whose passage has been edited away can't be drawn — guessing a
// location would be worse than admitting it's lost. But dropping it silently is
// worse still: the text you cared about, and the times it caught you, are
// exactly what you'd want back. So they're kept, and shown as lost.

import { Annotation } from '../model';
import { resolveMarkdown } from '../anchor/resolveAnchor';

export interface Classified {
  live: Annotation[];
  /** Still stored, still meaningful, but no longer findable in the file. */
  lost: Annotation[];
}

/**
 * Split a file's annotations by whether they still resolve.
 *
 * Only markdown anchors are judged. A transcript anchor lives against whichever
 * subtitle track is loaded, which this doesn't have in hand — and subtitle
 * files, being generated rather than edited, rarely lose their marks anyway.
 */
export function classify(annotations: readonly Annotation[], text: string): Classified {
  const live: Annotation[] = [];
  const lost: Annotation[] = [];

  // No text means we failed to read the file, not that its contents vanished.
  // Calling every mark lost on the strength of that is a false alarm about the
  // one thing this plugin must not get wrong.
  if (text.length === 0) return { live: [...annotations], lost };

  for (const a of annotations) {
    if (a.anchor.kind !== 'markdown') {
      live.push(a);
      continue;
    }
    (resolveMarkdown(text, a.anchor) ? live : lost).push(a);
  }

  return { live, lost };
}
