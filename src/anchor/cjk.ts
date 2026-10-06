// Chinese text as PDFs carry it, made readable.
//
// Many PDFs — anything printed to PDF from macOS, for one — map their glyphs to
// the Kangxi Radicals and CJK Radicals Supplement blocks instead of to ordinary
// characters. They look the same; they are not: `注意⼒` has U+2F12 KANGXI
// RADICAL POWER where `力` should be. Copied out, searched for, or shown in the
// review panel, the passage is quietly wrong — a search for 注意力 finds nothing.
//
// The radicals are kept as they are wherever the PDF itself is matched against
// (that is what its text layer contains), and turned back into characters only
// for people to read. Kangxi radicals all have a compatibility mapping (NFKC);
// the supplement's simplified forms have none, hence the table, from Unicode's
// EquivalentUnifiedIdeograph.txt.

const SUPPLEMENT: Record<string, string> = {
  '⺁': '厂', '⺇': '几', '⺊': '卜', '⺌': '小',
  '⺕': '彐', '⺗': '心', '⺝': '月', '⺟': '母', '⺠': '民', '⺮': '竹',
  '⺺': '聿', '⺼': '月', '⻁': '虎', '⻄': '西', '⻅': '见',
  '⻆': '角', '⻈': '讠', '⻉': '贝', '⻋': '车', '⻌': '辶', '⻍': '辶',
  '⻏': '阝', '⻐': '钅', '⻑': '長', '⻒': '镸', '⻓': '长', '⻔': '门',
  '⻗': '雨', '⻘': '青', '⻙': '韦', '⻚': '页', '⻛': '风', '⻜': '飞',
  '⻝': '食', '⻢': '马', '⻣': '骨', '⻤': '鬼', '⻥': '鱼', '⻦': '鸟',
  '⻧': '卤', '⻨': '麦', '⻩': '黄', '⻬': '齐', '⻮': '齿', '⻰': '龙',
  '⻳': '龟',
};

/** Kangxi Radicals, U+2F00–U+2FDF: NFKC maps every one to its character. */
const KANGXI = /[⼀-⿟]/g;
/** CJK Radicals Supplement, U+2E80–U+2EFF. */
const RADICAL = /[⺀-⻿]/g;

/** `text` with radicals standing in for characters replaced by the characters. */
export function readable(text: string): string {
  return text
    .replace(KANGXI, c => c.normalize('NFKC'))
    .replace(RADICAL, c => SUPPLEMENT[c] ?? c);
}
