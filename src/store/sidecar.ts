import { App, TFile } from 'obsidian';
import { AnnotationFile, emptyFile } from '../model';
import { sidecarPathFor } from './paths';

// Path rules live in ./paths (no `obsidian` import, so they're unit-testable).
// Re-exported here so callers have one place to import the store from.
export * from './paths';

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
