/**
 * Move transcript marks from the recording onto the track they were read from.
 *
 * They used to be filed under the media file, on the reasoning that
 * transcribing again shouldn't orphan everything. But a mark is made on words,
 * and re-transcribing produces different words cut in different places, so
 * carrying marks across pointed them at text that was never there. Filing them
 * under the track says what is true: they are about that transcription.
 *
 * Every such anchor already recorded its track, so nothing has to be guessed.
 */

import { Annotation } from '../model';

export interface Move {
  /** The sidecar these came from — the recording. */
  from: string;
  /** The track sidecar they belong in. */
  to: string;
  annotations: Annotation[];
}

/**
 * How a recording's annotations should be split up.
 *
 * Anything without a track to go to stays put: a transcript made on the fly
 * has no file to name, and a mark with nowhere to go is not improved by
 * moving it somewhere arbitrary.
 */
export function planMove(target: string, annotations: readonly Annotation[]): {
  moves: Move[];
  keep: Annotation[];
} {
  const byTrack = new Map<string, Annotation[]>();
  const keep: Annotation[] = [];

  for (const a of annotations) {
    const track = a.anchor.kind === 'transcript' ? a.anchor.track?.trim() : '';
    if (!track || track === target) {
      keep.push(a);
      continue;
    }
    const group = byTrack.get(track);
    if (group) group.push(a);
    else byTrack.set(track, [a]);
  }

  return {
    moves: [...byTrack].map(([to, group]) => ({ from: target, to, annotations: group })),
    keep,
  };
}
