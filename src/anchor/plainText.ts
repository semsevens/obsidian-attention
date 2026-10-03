// Projecting markdown source onto the text a reader actually sees.
//
// Reading mode hands us a selection made against rendered output, but an anchor
// has to be expressed in source offsets so the editor can decorate it. Those two
// disagree wherever markup lives: `**bold**` is four characters shorter once
// drawn, `[text](url)` loses everything after the word, an image disappears
// entirely.
//
// Requiring the selection to appear verbatim in the source — the previous
// approach — meant any selection containing emphasis, a link or a highlight
// could not be anchored at all. In a real note that is most of them.
//
// So: strip the markup, remember where every surviving character came from, and
// map the match back.

export interface Projection {
  /** The source with inline markup removed. */
  text: string;
  /** `source[map[i]]` is the character that produced `text[i]`. */
  map: number[];
}

/** Inline constructs that wrap text and should be unwrapped, longest first. */
const WRAPPERS = ['***', '___', '**', '__', '~~', '==', '*', '_'];

/** A fence opening or closing a code block: up to three spaces, then ``` or ~~~. */
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * What opens a line without being drawn as text: quote bars, a heading's
 * hashes, a bullet or a number (the browser draws those as markers, which a
 * selection doesn't include), a task's checkbox.
 */
const LINE_MARKER = /(?:[ \t]*>[ \t]?)*[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+(?:\[[ xX]\][ \t]+)?|\d{1,9}[.)][ \t]+)?/y;

/** An inline HTML tag, opening or closing. Drawn as an element, never as text. */
const TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>\n]*)?\/?>/y;

/** What a backslash can escape: ASCII punctuation, per CommonMark. */
const ESCAPABLE = /[!-\/:-@[-`{-~]/;

const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

/**
 * Build the reader's-eye view of `source`, with an offset for every character.
 *
 * Deliberately shallow: it handles the inline markers that break anchoring in
 * practice, and code — whose markers are text — but otherwise leaves block
 * structure alone. A full markdown parse would be
 * more correct and much more to go wrong; what matters here is that the
 * projection and the map stay in step.
 */
export function project(source: string): Projection {
  let text = '';
  const map: number[] = [];
  let i = 0;

  const take = (n: number) => {
    for (let k = 0; k < n; k++) {
      text += source[i];
      map.push(i);
      i++;
    }
  };

  while (i < source.length) {
    // A fenced code block is drawn verbatim — an underscore or asterisk in
    // there is code, not emphasis. The fence lines themselves are not drawn.
    if (i === 0 || source[i - 1] === '\n') {
      const block = fencedBlock(source, i);
      if (block) {
        i = block.body;
        take(block.bodyEnd - i);
        i = block.end;
        continue;
      }
      LINE_MARKER.lastIndex = i;
      const marker = LINE_MARKER.exec(source);
      if (marker && marker[0].length > 0) { i += marker[0].length; continue; }
    }

    // Inline code is drawn verbatim too, minus its backticks.
    if (source[i] === '`') {
      let run = 1;
      while (source[i + run] === '`') run++;
      const close = closingRun(source, i + run, run);
      if (close < 0) { i += run; continue; }   // unpaired: a fragment's edge
      i += run;
      take(close - i);
      i += run;
      continue;
    }

    // Math is typeset: `$x_1$` is drawn as a formula whose text is nothing
    // like the TeX, so neither side can be matched against the other.
    if (source[i] === '$') {
      const end = mathEnd(source, i);
      if (end > 0) { i = end; continue; }
    }

    // `\*` is a literal asterisk: drop the backslash, keep what it protects.
    if (source[i] === '\\' && ESCAPABLE.test(source[i + 1] ?? '')) {
      i++;
      take(1);
      continue;
    }

    // `<sup>[1]</sup>` is drawn as `[1]`; the tags are elements, not text.
    TAG.lastIndex = i;
    const tag = TAG.exec(source);
    if (tag) { i += tag[0].length; continue; }

    // Images vanish from the rendered text entirely, alt text included.
    if (source.startsWith('![', i)) {
      const close = matchLink(source, i + 1);
      if (close) { i = close.end; continue; }
    }

    // Links keep their label and drop the target.
    if (source[i] === '[') {
      const link = matchLink(source, i);
      if (link) {
        i++;                       // past '['
        take(link.labelEnd - i);   // the label itself
        i = link.end;              // past '](…)'
        continue;
      }
    }

    // Wrappers contribute nothing visible; step over the marker only — unless
    // it can't be one: `tool_search` is a word, and ` * ` is an asterisk.
    const wrapper = WRAPPERS.find(w => source.startsWith(w, i));
    if (wrapper) {
      const before = source[i - 1] ?? ' ';
      const after = source[i + wrapper.length] ?? ' ';
      const intraword = wrapper[0] === '_' && WORD.test(before) && WORD.test(after);
      const loose = SPACE.test(before) && SPACE.test(after);
      if (intraword || loose) take(wrapper.length);
      else i += wrapper.length;
      continue;
    }

    take(1);
  }

  return { text, map };
}

/**
 * Where math opening at `i` ends, or -1 if this `$` doesn't open any.
 *
 * `$$…$$` may span lines. `$…$` stays on one, and follows the rule Obsidian
 * and Pandoc share so that prices aren't formulas: no space just inside either
 * dollar, and no digit straight after the closing one — `$5 and $10` is text.
 */
function mathEnd(source: string, i: number): number {
  if (source.startsWith('$$', i)) {
    const close = source.indexOf('$$', i + 2);
    return close < 0 ? -1 : close + 2;
  }
  const inline = /\$(?=\S)[^$\n]*?\S\$(?!\d)|\$[^\s$]\$(?!\d)/y;
  inline.lastIndex = i;
  const m = inline.exec(source);
  return m ? i + m[0].length : -1;
}

/** The line starting at `i`, without its newline. */
function lineAt(source: string, i: number): string {
  const end = source.indexOf('\n', i);
  return source.slice(i, end < 0 ? source.length : end);
}

/**
 * The fenced code block opening at `i`, if one does: where its body starts and
 * ends, and where the closing fence ends. An unclosed block runs to the end of
 * the note, which is how CommonMark reads it too.
 */
function fencedBlock(source: string, i: number): { body: number; bodyEnd: number; end: number } | null {
  const fence = FENCE.exec(lineAt(source, i))?.[1];
  if (!fence) return null;
  const closing = new RegExp(`^ {0,3}\\${fence[0]}{${fence.length},}\\s*$`);
  const newline = source.indexOf('\n', i);
  if (newline < 0) return { body: source.length, bodyEnd: source.length, end: source.length };
  const body = newline + 1;
  for (let at = body; at < source.length; at += lineAt(source, at).length + 1) {
    const line = lineAt(source, at);
    if (closing.test(line)) return { body, bodyEnd: at, end: at + line.length };
  }
  return { body, bodyEnd: source.length, end: source.length };
}

/** Start of the next run of exactly `n` backticks from `i`, or -1. */
function closingRun(source: string, i: number, n: number): number {
  for (let k = i; k < source.length; k++) {
    if (source[k] === '\n' && source[k + 1] === '\n') return -1;  // spans no blank line
    if (source[k] !== '`') continue;
    let run = 1;
    while (source[k + run] === '`') run++;
    if (run === n) return k;
    k += run - 1;
  }
  return -1;
}

/** Strip markup, discarding the offsets. */
export function strip(source: string): string {
  return project(source).text;
}

/**
 * Turn a range in the projection back into a range in the source.
 *
 * The end maps to just past the last surviving character, so trailing markup
 * isn't swept into the anchor.
 */
export function toSource(p: Projection, from: number, to: number): { from: number; to: number } | null {
  if (from < 0 || to > p.text.length || to <= from) return null;
  return { from: p.map[from], to: p.map[to - 1] + 1 };
}

/** `[label](target)` starting at `i`, or null if it isn't one. */
function matchLink(source: string, i: number): { labelEnd: number; end: number } | null {
  if (source[i] !== '[') return null;
  let depth = 0;
  for (let k = i; k < source.length; k++) {
    if (source[k] === '[') depth++;
    else if (source[k] === ']') {
      depth--;
      if (depth === 0) {
        if (source[k + 1] !== '(') return null;
        const close = source.indexOf(')', k + 2);
        if (close < 0) return null;
        return { labelEnd: k, end: close + 1 };
      }
    } else if (source[k] === '\n' && depth > 0) {
      return null;   // links don't span blank structure; bail rather than guess
    }
  }
  return null;
}
