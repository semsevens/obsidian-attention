/**
 * Which file a transcript mark is filed under.
 *
 * The subtitle track, not the recording. A mark is made on words, and the
 * words belong to the transcription that produced them — transcribe the same
 * recording again and you get different words, cut in different places, so a
 * mark carried across would be pointing at text that was never there.
 *
 * The cost is the honest one: marks made against an old track stay with that
 * track. They are not lost, they are simply not about the new one.
 *
 * A player showing a transcript it generated on the fly has no track file to
 * name, and there the recording is the only thing to hold on to.
 */
export function ownerOfMarks(mediaPath: string, trackPath: string): string {
  return trackPath.trim() !== '' ? trackPath : mediaPath;
}
