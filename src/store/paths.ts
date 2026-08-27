// Sidecar path arithmetic. Deliberately free of any `obsidian` import so it can
// be unit-tested without the app — these rules decide whether a user's
// annotations can still be found, so they're worth pinning down with tests.
//
// Naming: the target's FULL filename (extension included) plus a fixed suffix.
//
//   lecture.mp4  →  lecture.mp4.anno.json
//   lecture.m4a  →  lecture.m4a.anno.json     (distinct from the .mp4's)
//   周报.md       →  周报.md.anno.json
//
// Keeping the original extension buys two things: media that exists in several
// formats gets one sidecar each, and reverse lookup is a plain suffix strip
// rather than the "try every dotted prefix" guessing that a marker-style
// convention forces (see obsidian-media-transcript's findMediaForSubtitle).

export const SIDECAR_SUFFIX = '.anno.json';

export function sidecarPathFor(targetPath: string): string {
  return targetPath + SIDECAR_SUFFIX;
}

export function isSidecarPath(path: string): boolean {
  return path.endsWith(SIDECAR_SUFFIX);
}

/** Inverse of sidecarPathFor. Returns null if this isn't a sidecar path. */
export function targetPathFor(sidecarPath: string): string | null {
  if (!isSidecarPath(sidecarPath)) return null;
  const target = sidecarPath.slice(0, -SIDECAR_SUFFIX.length);
  // A bare ".anno.json" has no target; so does a sidecar of a sidecar, which we
  // refuse rather than letting annotations nest.
  if (target.length === 0 || isSidecarPath(target)) return null;
  return target;
}
