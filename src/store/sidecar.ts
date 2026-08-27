import { App, TFile } from 'obsidian';
import { AnnotationFile, emptyFile } from '../model';

// Sidecar naming: the target's FULL filename (extension included) plus a fixed
// suffix.
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
  return sidecarPath.slice(0, -SIDECAR_SUFFIX.length);
}

/** Read the sidecar for `targetPath`. Missing or corrupt → an empty file. */
export async function loadSidecar(
  app: App,
  targetPath: string,
): Promise<AnnotationFile> {
  const file = app.vault.getAbstractFileByPath(sidecarPathFor(targetPath));
  if (!(file instanceof TFile)) return emptyFile(targetPath);

  try {
    const parsed: unknown = JSON.parse(await app.vault.read(file));
    if (
      parsed && typeof parsed === 'object' &&
      Array.isArray((parsed as AnnotationFile).annotations)
    ) {
      // Trust but re-stamp the target: the file may have been renamed.
      return { ...(parsed as AnnotationFile), target: targetPath };
    }
  } catch {
    // Fall through — a broken sidecar shouldn't take the view down with it.
  }
  return emptyFile(targetPath);
}

/**
 * Write the sidecar. An empty annotation list deletes it instead of leaving a
 * husk behind, so un-annotating a file leaves no trace.
 */
export async function saveSidecar(app: App, data: AnnotationFile): Promise<void> {
  const path = sidecarPathFor(data.target);
  const existing = app.vault.getAbstractFileByPath(path);

  if (data.annotations.length === 0) {
    if (existing instanceof TFile) await app.fileManager.trashFile(existing);
    return;
  }

  const body = JSON.stringify(data, null, 2);
  if (existing instanceof TFile) await app.vault.modify(existing, body);
  else await app.vault.create(path, body);
}
