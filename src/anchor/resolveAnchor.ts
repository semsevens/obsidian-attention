// Resolving a markdown anchor, with the extra step images need.
//
// Text is found by its own words. An image has none: its anchor holds the embed
// that produced it, and an embed is exactly the kind of thing other plugins
// rewrite. A tool that caches remote pictures locally turns
// `![](https://…)` into `![[attachments/x.png]]`, and every image mark in the
// note would become an orphan at once — the stored text simply isn't there any
// more.
//
// What doesn't change is where the picture sits. The caption under it and the
// paragraph before it are the same words as before, so an image is looked up by
// its surroundings when its embed no longer matches.

import { MarkdownAnchor } from '../model';
import { resolve, ResolvedRange } from './textQuote';
import { project } from './plainText';
import { findImageEmbeds, isImageQuote, embedBySurroundings } from './imageAnchor';

export function resolveMarkdown(text: string, anchor: MarkdownAnchor): ResolvedRange | null {
  const direct = resolve(text, anchor);
  if (direct) return direct;
  if (!isImageQuote(anchor.quote)) return null;

  const embeds = findImageEmbeds(text);
  if (embeds.length === 0) return null;

  const plain = project(text);
  const found = embedBySurroundings(
    text, embeds, anchor.prefix, anchor.suffix,
    i => plain.map[i] ?? 0,
    plain.text,
  );
  if (!found) return null;

  // 'context' rather than 'exact': the embed was rewritten, so the anchor is
  // out of date and worth repairing on the next pass.
  return { from: found.from, to: found.to, how: 'context' };
}
