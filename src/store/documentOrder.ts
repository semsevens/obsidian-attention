import { App, TFile } from 'obsidian';
import { Annotation } from '../model';
import { resolveMarkdown } from '../anchor/resolveAnchor';

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
  text?: string,
): Promise<Annotation[]> {
  if (annotations.length === 0) return [];

  // Only a note's position needs its text: a PDF's is in the anchor, and
  // reading a PDF as text would load megabytes to throw away.
  let source = text ?? '';
  if (text === undefined && file.extension === 'md') {
    try {
      source = await app.vault.cachedRead(file);
    } catch {
      return [...annotations];
    }
  }

  const positioned = annotations.map(a => ({
    a,
    at: positionOf(a, source),
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

/**
 * Where a mark sits, as one number to sort by: its offset in a note, or its
 * page, item and character in a PDF — which has no single offset of its own.
 */
function positionOf(a: Annotation, source: string): number | null {
  if (a.anchor.kind === 'markdown') return resolveMarkdown(source, a.anchor)?.from ?? null;
  if (a.anchor.kind === 'pdf') {
    // A region sorts by how far down its page it starts: PDF y runs upwards.
    const region = a.anchor.region;
    if (region) return region.page * 1e9 + Math.round(1e6 - Math.max(region.rect[1], region.rect[3]));
    const span = a.anchor.spans[0];
    if (!span) return null;
    const [item, offset] = span.selection;
    return span.page * 1e9 + item * 1e4 + Math.min(offset, 9999);
  }
  return null;
}
