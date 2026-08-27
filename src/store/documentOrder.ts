import { App, TFile } from 'obsidian';
import { Annotation } from '../model';
import { resolve } from '../anchor/textQuote';

/**
 * Sort a file's annotations the way they appear in the file.
 *
 * The index keeps everything in creation order, which is right for "what did I
 * mark this week" but wrong for an outline — an outline has to follow the
 * document. Orphans (nothing left to resolve against) sort last, since they no
 * longer have a position at all.
 */
export async function inDocumentOrder(
  app: App,
  file: TFile,
  annotations: readonly Annotation[],
): Promise<Annotation[]> {
  if (annotations.length === 0) return [];

  let source: string;
  try {
    source = await app.vault.cachedRead(file);
  } catch {
    return [...annotations];
  }

  const positioned = annotations.map(a => ({
    a,
    at: a.anchor.kind === 'markdown' ? resolve(source, a.anchor)?.from ?? null : null,
  }));

  return positioned
    .sort((x, y) => {
      if (x.at === null && y.at === null) return 0;
      if (x.at === null) return 1;
      if (y.at === null) return -1;
      return x.at - y.at;
    })
    .map(p => p.a);
}
