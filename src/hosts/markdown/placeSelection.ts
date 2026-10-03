/**
 * Where a reading-mode selection sits in the source, by position.
 *
 * Each rendered block carries the source lines it came from (see `section`).
 * The edges of a selection are offsets into their blocks' rendered text, and
 * aligning that text with those lines turns each offset into a source offset —
 * see `align`. Nothing is searched for, so nothing can fail to be found: a
 * selection spanning paragraphs, or ending in the gap after one, or crossing
 * markup the screen doesn't show, is placed the same way as any other.
 */

import { align, diffPairs } from '../../anchor/align';
import { LINES_ATTR, sourceRangeOf } from './section';

/** A rendered element and the source it was drawn from. */
interface Unit {
  el: Element;
  lines: { from: number; to: number };
}

/** The selection's source range, or null when its blocks record no lines. */
export function placeByLines(source: string, range: Range): { from: number; to: number } | null {
  const units = unitsIn(source, range);
  if (units.length === 0) return null;

  for (const raw of [false, true]) {
    const from = firstOf(units, unit => edgeOffset(source, unit, range, 'start', raw));
    if (from === null) continue;
    // The end comes from the last unit that ends after the start. A footnote
    // is drawn at the bottom of the note but defined wherever it was written,
    // which can be above where the selection began.
    const to = firstOf([...units].reverse(), unit => {
      const end = edgeOffset(source, unit, range, 'end', raw);
      return end !== null && end > from ? end : null;
    });
    // Only whitespace is a miss, not an answer: `**x** y` drawn from
    // `****x**** y` pairs nothing but the space in a selection of `* `.
    if (to !== null && source.slice(from, to).trim()) return { from, to };
  }
  return null;
}

/**
 * The first unit, in order, that can say where an edge is.
 *
 * Not every one can: a transclusion's block in the host is drawn as the other
 * note's text, and a block another plugin draws has no text from the file at
 * all. A selection that runs into one stops at the last unit that can be
 * measured, rather than failing as a whole.
 */
function firstOf(units: Unit[], measure: (unit: Unit) => number | null): number | null {
  for (const unit of units) {
    const at = measure(unit);
    if (at !== null) return at;
  }
  return null;
}

/**
 * The whole source of the blocks a selection touches, first to last.
 *
 * The last resort, when nothing finer can be said: a block another plugin
 * draws — a terminal recording, a chart — has no text from the file on screen
 * at all, and footnotes are numbered in the order they are cited, not the
 * order they are defined, so a selection across two can run backwards through
 * the source. What was pointed at is still these blocks.
 */
export function wholeBlocks(source: string, range: Range): { from: number; to: number } | null {
  const units = unitsIn(source, range);
  if (units.length === 0) return null;
  return {
    from: Math.min(...units.map(u => u.lines.from)),
    to: Math.max(...units.map(u => u.lines.to)),
  };
}

/**
 * What a selection touches, in document order, each with its source.
 *
 * Only within the rendering the selection starts in — the note, or the
 * transclusion it starts inside, which numbers its lines from its own file.
 * A selection that starts on a transclusion's title is inside it too.
 *
 * Footnotes are split out: Obsidian gathers them into one section recorded as
 * the note's last line, so each item is matched to its own definition instead.
 */
function unitsIn(source: string, range: Range): Unit[] {
  const start = range.startContainer;
  const startEl = start.nodeType === 1 ? (start as Element) : start.parentElement;
  // A transclusion's title is drawn beside its content, not inside it.
  const embed = startEl?.closest('.markdown-embed');
  const content = embed && Array.from(embed.children).find(el => el.matches('.markdown-embed-content'));
  const root = content ?? startEl?.closest('.markdown-preview-view');
  if (!root) return [];

  const embedOf = (el: Element) => el.parentElement?.closest('.markdown-embed-content') ?? null;
  const home = root.matches('.markdown-embed-content') ? root : null;
  const units: Unit[] = [];
  for (const el of Array.from(root.querySelectorAll(`[${LINES_ATTR}]`))) {
    if (embedOf(el) !== home || !range.intersectsNode(el)) continue;
    const footnotes = el.querySelectorAll('section.footnotes li');
    if (footnotes.length > 0) {
      for (const li of Array.from(footnotes)) {
        const lines = definitionOf(source, li.textContent ?? '');
        if (lines && range.intersectsNode(li)) units.push({ el: li, lines });
      }
      continue;
    }
    const lines = sourceRangeOf(source, el);
    if (lines) units.push({ el, lines });
  }
  return units;
}

/** The footnote definition line whose text is most like `text`. */
function definitionOf(source: string, text: string): { from: number; to: number } | null {
  let best: { from: number; to: number } | null = null;
  let bestScore = 0;
  const definitions = /^\[\^[^\]\n]+\]:[^\n]*$/gm;
  for (let m = definitions.exec(source); m; m = definitions.exec(source)) {
    const pairs = diffPairs(text, m[0]);
    const score = pairs ? pairs.filter(j => j >= 0).length : 0;
    if (score > bestScore) {
      bestScore = score;
      best = { from: m.index, to: m.index + m[0].length };
    }
  }
  return best;
}

/**
 * The source offset of one edge of `range`, measured inside `unit`.
 *
 * An edge outside it — the selection began above it or ended below it — takes
 * in all of it.
 */
function edgeOffset(
  source: string,
  { el, lines }: Unit,
  range: Range,
  edge: 'start' | 'end',
  raw: boolean,
): number | null {
  const alignment = align(el.textContent ?? '', source.slice(lines.from, lines.to), raw);
  if (!alignment) return null;

  const node = edge === 'start' ? range.startContainer : range.endContainer;
  const offset = edge === 'start' ? range.startOffset : range.endOffset;
  const before = el.ownerDocument.createRange();
  before.setStart(el, 0);
  if (el.contains(node)) before.setEnd(node, offset);
  else if (edge === 'end') before.setEnd(el, el.childNodes.length);
  const at = before.toString().length;

  return lines.from + (edge === 'start' ? alignment.start(at) : alignment.end(at));
}
