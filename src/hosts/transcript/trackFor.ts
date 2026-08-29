/**
 * Which subtitle track a recording is read through.
 *
 * Marks are filed under the track, so answering this decides where a
 * recording's marks live — and the answer has to be the same one Media
 * Transcript would give, or a mark would be filed under a track nobody is
 * looking at. Its rule is a naming convention plus a priority list:
 *
 *   talk.srt          → marker ""        (the plain form)
 *   talk.whisper.json → marker "whisper"
 *
 * The list names markers best-first; a marker it does not mention ranks after
 * every one it does. Ties break on format, SRT before VTT before JSON.
 *
 * Reimplemented here rather than imported because Media Transcript may not be
 * installed at all — this plugin works without it, and a hard dependency for
 * one sorting rule would be a poor trade. The priorities themselves are read
 * from that plugin at runtime, so the two cannot disagree about what the
 * reader asked for.
 */

const SUBTITLE_EXTENSIONS = ['srt', 'vtt', 'json'];
const FORMAT_ORDER = SUBTITLE_EXTENSIONS;

export interface TrackCandidate {
  path: string;
  marker: string;
  extension: string;
}

/** Every subtitle file that names this recording, by the convention above. */
export function tracksFor(
  paths: readonly string[],
  mediaPath: string,
  subtitleDir: string,
): TrackCandidate[] {
  const mediaDir = dirOf(mediaPath);
  const base = baseNameOf(mediaPath);
  const searchDir = subtitleDir.trim() !== '' ? trimSlashes(subtitleDir) : mediaDir;

  const out: TrackCandidate[] = [];
  for (const path of paths) {
    if (dirOf(path) !== searchDir) continue;

    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!name.startsWith(base + '.')) continue;

    const rest = name.slice(base.length + 1).split('.');
    const extension = (rest.pop() ?? '').toLowerCase();
    if (!SUBTITLE_EXTENSIONS.includes(extension)) continue;
    // Only `base.ext` and `base.marker.ext`; anything longer names something
    // else that merely starts the same way.
    if (rest.length > 1) continue;

    out.push({ path, marker: rest[0] ?? '', extension });
  }
  return out;
}

/** The one that opens by default, or null when the recording has no track. */
export function preferredTrack(
  tracks: readonly TrackCandidate[],
  markers: readonly string[],
): string | null {
  if (tracks.length === 0) return null;

  const rankOf = new Map(markers.map((m, i) => [m.trim(), i]));
  const rank = (t: TrackCandidate) => rankOf.get(t.marker.trim()) ?? markers.length;
  const format = (t: TrackCandidate) => {
    const at = FORMAT_ORDER.indexOf(t.extension);
    return at < 0 ? FORMAT_ORDER.length : at;
  };

  return [...tracks]
    .map((track, found_at) => ({ track, found_at }))
    .sort((a, b) =>
      rank(a.track) - rank(b.track) ||
      format(a.track) - format(b.track) ||
      a.found_at - b.found_at)[0].track.path;
}

function dirOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

function baseNameOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : name.slice(0, dot);
}

function trimSlashes(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}
