import { Annotation, isComment } from '../model';
import { imageTargetOf, imageMatches } from '../anchor/imageAnchor';

/**
 * Outline the pictures that have been marked.
 *
 * Images can't be painted the way text is: an embed renders to an `<img>`, and
 * there is no string in the rendered output to wrap. The drawn image is found
 * by what it points at instead, which also means it doesn't matter whether it
 * came from a vault embed or a remote URL.
 *
 * Idempotent, like the text painter: an image already marked is left alone.
 */
export function paintImages(root: HTMLElement, annotations: readonly Annotation[]): void {
  const targets: { target: string; annotation: Annotation }[] = [];
  for (const a of annotations) {
    if (a.anchor.kind !== 'markdown') continue;
    const target = imageTargetOf(a.anchor.quote);
    if (target) targets.push({ target, annotation: a });
  }
  if (targets.length === 0) return;

  for (const img of Array.from(root.querySelectorAll('img'))) {
    if (!(img instanceof HTMLImageElement)) continue;
    const src = img.getAttribute('src') ?? '';
    const hit = targets.find(t => imageMatches(src, t.target));
    if (!hit) continue;

    img.addClass('at-img');
    img.toggleClass('at-img-comment', isComment(hit.annotation));
    img.dataset.atId = hit.annotation.id;
  }
}

/** Which annotation, if any, a rendered image carries. */
export function markedImageId(el: Element | null): string | null {
  return el instanceof HTMLElement ? el.dataset.atId ?? null : null;
}
