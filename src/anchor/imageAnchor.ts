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

/**
 * `![[…]]` embeds anything, not only pictures — a note transcluded into
 * another is written exactly the same way. Treating those as images meant that
 * marking anything inside a transcluded note anchored to the whole embed, since
 * it was the only "image" the host file contained.
 */
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)(?:[?#]|$)/i;

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
    const isWiki = m[1] !== undefined;
    const target = cleanTarget(m[1] ?? m[3] ?? '');
    // A wiki embed has to name a picture. Markdown image syntax is only ever
    // used for one, extension or not — remote URLs frequently have none.
    if (isWiki && !IMAGE_FILE.test(target)) continue;
    out.push({ text: m[0], from: m.index, to: m.index + m[0].length, target });
  }
  return out;
}

/**
 * The file or URL an embed actually points at.
 *
 * Wiki embeds carry display options after a pipe — `![[photo.png|300]]` is how
 * everyone resizes a picture — and those are not part of the target. Markdown
 * paths arrive percent-encoded, while the rendered src decodes to the real
 * name, so they are decoded here to be compared like with like.
 */
function cleanTarget(raw: string): string {
  const withoutOptions = raw.split('|')[0].trim();
  try {
    return decodeURIComponent(withoutOptions);
  } catch {
    return withoutOptions;
  }
}

/**
 * Find the embed that produced a rendered image, using the text around it.
 *
 * Matching on the `src` is unreliable: plenty of setups rewrite it. A vault
 * that caches remote pictures locally serves an `app://` path with no relation
 * to the URL in the note, and a drawing plugin serves a blob. What does hold is
 * position — an image sits between the same words on screen as it does in the
 * file.
 *
 * `after` is preferred over `before` because a caption immediately following a
 * picture is the commonest layout, and it pins the embed from the near side.
 */
export function embedBySurroundings(
  source: string,
  embeds: readonly ImageEmbed[],
  before: string,
  after: string,
  offsetOfPlain: (plainIndex: number) => number,
  plainText: string,
): ImageEmbed | null {
  if (embeds.length === 0) return null;
  if (embeds.length === 1) return embeds[0];

  const trimmedAfter = after.trim();
  if (trimmedAfter.length >= 2) {
    const at = plainText.indexOf(trimmedAfter);
    if (at >= 0) {
      const cut = offsetOfPlain(at);
      const before_ = embeds.filter(e => e.to <= cut);
      if (before_.length > 0) return before_[before_.length - 1];
    }
  }

  const trimmedBefore = before.trim();
  if (trimmedBefore.length >= 2) {
    const at = plainText.lastIndexOf(trimmedBefore);
    if (at >= 0) {
      const cut = offsetOfPlain(Math.min(at + trimmedBefore.length, plainText.length - 1));
      const after_ = embeds.filter(e => e.from >= cut);
      if (after_.length > 0) return after_[0];
    }
  }

  return null;
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

/**
 * A stable fragment of a rendered image URL, for recognising it again.
 *
 * The last path segment: a filename for vault images, a content hash for a
 * locally cached remote one. Query strings are dropped — Obsidian appends a
 * changing timestamp to vault resources.
 */
export function srcHint(src: string): string {
  const withoutQuery = safeDecode(src).split(/[?#]/)[0];
  const tail = withoutQuery.split('/').filter(Boolean).pop() ?? '';
  return tail.length >= 4 ? tail : '';
}

function safeDecode(url: string): string {
  try { return decodeURIComponent(url); } catch { return url; }
}
