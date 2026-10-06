// What Attention uses of PDF++, and the one place that knows how to reach it.
//
// PDF++ already does the hard parts of working in a PDF: it turns a selection
// into Obsidian's `#page=…&selection=…` terms, works out the rectangles a run
// of text covers at any zoom, places them on the page, and calls back as each
// page's text is drawn. Attention keeps its own record of what was marked —
// the sidecar, as for every other file — and lets PDF++ do the drawing, so
// marks look and sit exactly as PDF++'s own highlights do.
//
// None of this is a published API. Everything is looked up and checked before
// use; if a PDF++ release moves it, PDF marks go quiet rather than break the
// rest of the plugin.

import { App, Component, View } from 'obsidian';

export type Rect = [number, number, number, number];

/** A pdf.js page view: what PDF++ places rectangles in. */
export interface PageView {
  div: HTMLElement;
  textLayer?: unknown;
}

/** pdf.js's text layer for a page: its items and the elements drawing them. */
export interface TextLayerInfo {
  textContentItems: { str: string }[];
  textDivs: HTMLElement[];
}

/** Obsidian's PDF viewer for one open file. */
export interface PdfChild {
  pdfViewer: { pdfViewer?: { currentPageNumber: number; scrollPageIntoView(o: { pageNumber: number }): void } };
  getPage(page: number): PageView;
}

export interface PdfPlus {
  /** A selection inside one page, in Obsidian's terms. */
  selectionIn(pageEl: HTMLElement, range: Range): [number, number, number, number] | null;
  /** The rectangles a selection covers on a page, merged line by line. */
  rects(info: TextLayerInfo, selection: [number, number, number, number]): Rect[];
  /** An element placed over `rect` in the page's highlight layer. */
  place(rect: Rect, page: PageView): HTMLElement;
  /** Call `ready` for each page whose text is drawn, now and as more are. */
  onTextLayerReady(child: PdfChild, owner: Component, ready: (page: number, view: PageView) => void): void;
}

/** What we look for on PDF++'s `lib`, before knowing it is there. */
interface Lib {
  copyLink?: { getTextSelectionRange?: unknown };
  highlight?: { geometry?: { computeMergedHighlightRects?: unknown }; viewer?: { placeRectInPage?: unknown } };
  onTextLayerReady?: unknown;
}

type SelectionRange = { beginIndex: number; beginOffset: number; endIndex: number; endOffset: number };

/** PDF++, if it is installed, enabled and still shaped as expected. */
export function pdfPlus(app: App): PdfPlus | null {
  const plugins = (app as unknown as { plugins?: { plugins?: Record<string, { lib?: Lib }> } }).plugins?.plugins;
  const lib = plugins?.['pdf-plus']?.lib;
  const copyLink = lib?.copyLink;
  const geometry = lib?.highlight?.geometry;
  const viewer = lib?.highlight?.viewer;
  if (
    !lib || !copyLink || !geometry || !viewer ||
    typeof copyLink.getTextSelectionRange !== 'function' ||
    typeof geometry.computeMergedHighlightRects !== 'function' ||
    typeof viewer.placeRectInPage !== 'function' ||
    typeof lib.onTextLayerReady !== 'function'
  ) return null;

  // Called as methods on their owners, which they read as `this`; typed now
  // that each has been checked to be a function.
  const link = copyLink as { getTextSelectionRange(p: HTMLElement, r: Range): SelectionRange | null };
  const geo = geometry as {
    computeMergedHighlightRects(i: TextLayerInfo, bi: number, bo: number, ei: number, eo: number): { rect: Rect }[] | null;
  };
  const view = viewer as { placeRectInPage(r: Rect, p: PageView): HTMLElement };
  const layers = lib as { onTextLayerReady(v: unknown, c: Component, cb: (page: number, view: PageView) => void): void };

  return {
    selectionIn(pageEl, range) {
      const r = link.getTextSelectionRange(pageEl, range);
      return r ? [r.beginIndex, r.beginOffset, r.endIndex, r.endOffset] : null;
    },
    rects(info, [bi, bo, ei, eo]) {
      return (geo.computeMergedHighlightRects(info, bi, bo, ei, eo) ?? []).map(m => m.rect);
    },
    place(rect, page) {
      return view.placeRectInPage(rect, page);
    },
    onTextLayerReady(child, owner, ready) {
      layers.onTextLayerReady(child.pdfViewer, owner, ready);
    },
  };
}

/** The viewer inside a PDF view, once it has loaded. */
export function childOf(view: View): PdfChild | null {
  const child = (view as unknown as { viewer?: { child?: PdfChild } }).viewer?.child;
  return child && typeof child.getPage === 'function' ? child : null;
}

/** The text layer pdf.js drew for a page, if it has drawn one. */
export function textLayerOf(page: PageView): TextLayerInfo | null {
  // pdf.js wraps the layer in a builder in some versions and not in others.
  const builder = page.textLayer as { textLayer?: unknown } | undefined;
  const info = (builder && 'textLayer' in builder ? builder.textLayer : builder) as Partial<TextLayerInfo> | undefined;
  return info && Array.isArray(info.textContentItems) && Array.isArray(info.textDivs) ? info as TextLayerInfo : null;
}
