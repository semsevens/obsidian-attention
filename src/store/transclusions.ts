import { App, TFile } from 'obsidian';

/**
 * The notes transcluded into a file.
 *
 * Their text is on screen while you read the host, so marks made in them are
 * part of what you are looking at — the review panel lists them, and Live
 * Preview has to paint them, even though they live in another file.
 *
 * One level only. Nesting is rare, and each level costs another read of the
 * metadata cache on every render; a note that embeds a note that embeds a note
 * can be opened directly.
 */
export function transcludedNotes(app: App, file: TFile): TFile[] {
  const embeds = app.metadataCache.getFileCache(file)?.embeds ?? [];
  const out: TFile[] = [];
  const seen = new Set<string>([file.path]);

  for (const embed of embeds) {
    const link = embed.link.split('#')[0].split('|')[0].trim();
    if (!link) continue;
    const target = app.metadataCache.getFirstLinkpathDest(link, file.path);
    if (!target || target.extension !== 'md' || seen.has(target.path)) continue;
    seen.add(target.path);
    out.push(target);
  }
  return out;
}
