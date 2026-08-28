// Marking a picture rather than a passage.
//
// An image can't be selected the way text can, so it is anchored by its embed —
// the `![alt](url)` or `![[file.png]]` in the source. That keeps everything
// else working unchanged: the embed text is the quote, so repeat detection,
// re-anchoring after edits and the lost-marks list all apply without knowing
// that this particular mark happens to be a picture.
//
// Painting is where it differs. An embed projects to nothing in rendered text —
// there is no string to wrap — so the drawn image is found by matching what it
// points at instead.

/** `![[file.png]]` or `![alt](target)`, in source order. */
const EMBED = /!\[\[([^\]]+?)\]\]|!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;

export interface ImageEmbed {
  /** The embed exactly as written, which becomes the anchor's quote. */
  text: string;
  from: number;
  to: number;
  /** What it points at: a vault filename, or a URL. */
  target: string;
}

export function findImageEmbeds(source: string): ImageEmbed[] {
  const out: ImageEmbed[] = [];
  EMBED.lastIndex = 0;
  for (let m = EMBED.exec(source); m; m = EMBED.exec(source)) {
    out.push({
      text: m[0],
      from: m.index,
      to: m.index + m[0].length,
      target: (m[1] ?? m[3] ?? '').trim(),
    });
  }
  return out;
}

/** The target of a stored embed quote, or null if it isn't one. */
export function imageTargetOf(quote: string): string | null {
  const found = findImageEmbeds(quote);
  return found.length === 1 && found[0].text === quote.trim() ? found[0].target : null;
}

/** Is this annotation's quote an image embed? */
export function isImageQuote(quote: string): boolean {
  return imageTargetOf(quote) !== null;
}

/**
 * Does a rendered `<img>` show what this embed points at?
 *
 * Vault embeds arrive as `app://…/some%20file.png?1234`, so the comparison is
 * on the decoded tail rather than the whole URL. Remote images keep their URL,
 * but Obsidian may proxy or append to it, so that too is a containment check.
 */
export function imageMatches(src: string, target: string): boolean {
  if (!src || !target) return false;
  const decoded = safeDecode(src);
  if (decoded.includes(target)) return true;

  // A vault embed may be written as a bare filename while src carries the path.
  const name = target.split('/').pop() ?? target;
  return name.length > 0 && decoded.includes(name);
}

function safeDecode(url: string): string {
  try { return decodeURIComponent(url); } catch { return url; }
}
