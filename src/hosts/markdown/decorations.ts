import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { StateEffect, Extension, Range } from '@codemirror/state';
import { App, MarkdownView, editorInfoField } from 'obsidian';
import { Annotation, MarkdownAnchor, isComment } from '../../model';
import { resolveMarkdown } from '../../anchor/resolveAnchor';
import { paintQuote } from '../paintQuote';
import { paintImages } from '../paintImage';
import { Change } from '../../anchor/repair';
import { asEl } from '../../dom';

/**
 * Highlights for Live Preview and source mode.
 *
 * These are CodeMirror decorations — a rendering layer over the document. The
 * file's bytes are untouched; turn the plugin off and the note is exactly as it
 * was.
 */

/** Dispatched when annotations change without the document changing. */
export const refreshAnnotations = StateEffect.define<void>();

export type Provider = (path: string) => readonly Annotation[];

/** Told about edits so anchors can be carried through them. */
export type EditListener = (path: string, changes: Change[], text: string) => void;

/** Told when an anchor was found somewhere other than where it was stored. */
export type DriftListener = (
  path: string, id: string, anchor: MarkdownAnchor,
  text: string, at: { from: number; to: number },
) => void;

let onEdit: EditListener | null = null;
let onDrift: DriftListener | null = null;

export function setEditListener(listener: EditListener | null): void {
  onEdit = listener;
}

export function setDriftListener(listener: DriftListener | null): void {
  onDrift = listener;
}

function build(view: EditorView, provider: Provider): DecorationSet {
  const path = view.state.field(editorInfoField, false)?.file?.path;
  if (!path) return Decoration.none;

  const annotations = provider(path);
  if (annotations.length === 0) return Decoration.none;

  const doc = view.state.doc.toString();
  const ranges: Range<Decoration>[] = [];

  for (const a of annotations) {
    if (a.anchor.kind !== 'markdown') continue;
    const at = resolveMarkdown(doc, a.anchor);
    // A null resolution is an orphan — deliberately draw nothing rather than
    // guess, and let the review panel surface it for re-anchoring.
    if (!at || at.from === at.to) continue;
    // Found somewhere else: record where, so the next read is a lookup rather
    // than another search of the whole document.
    if (at.how !== 'exact') onDrift?.(path, a.id, a.anchor, doc, at);
    ranges.push(
      Decoration.mark({
        class: isComment(a) ? 'at-hl at-hl-comment' : 'at-hl',
        attributes: { 'data-at-id': a.id },
      }).range(at.from, at.to),
    );
  }

  // `true` sorts for us, which matters because resolution can return ranges in
  // any order and overlapping highlights are normal.
  return Decoration.set(ranges, true);
}

export function annotationDecorations(provider: Provider): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, provider);
      }

      update(u: ViewUpdate) {
        const refreshed = u.transactions.some(t =>
          t.effects.some(e => e.is(refreshAnnotations)),
        );
        if (u.docChanged) reportEdit(u);
        if (u.docChanged || u.viewportChanged || refreshed) {
          this.decorations = build(u.view, provider);
        }
      }
    },
    { decorations: v => v.decorations },
  );
}

/**
 * Hand this edit to whoever is keeping anchors current.
 *
 * CodeMirror knows precisely what moved; passing that on lets an anchor be
 * carried through the change instead of hunted for afterwards.
 */
function reportEdit(u: ViewUpdate): void {
  if (!onEdit) return;
  const path = u.state.field(editorInfoField, false)?.file?.path;
  if (!path) return;

  const changes: Change[] = [];
  u.changes.iterChanges((fromA, toA, fromB, toB) => { changes.push({ fromA, toA, fromB, toB }); });
  if (changes.length > 0) onEdit(path, changes, u.state.doc.toString());
}

/**
 * Nudge every open editor to repaint.
 *
 * `editor.cm` is the underlying EditorView. It isn't in the public typings, but
 * it is stable and is how plugins reach CodeMirror; the optional chaining below
 * keeps a future rename from throwing.
 */
export function repaintEditors(app: App, provider?: Provider): void {
  app.workspace.getLeavesOfType('markdown').forEach(leaf => {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const cm = (view.editor as unknown as { cm?: EditorView }).cm;
    cm?.dispatch({ effects: refreshAnnotations.of() });
    if (provider) paintRenderedWidgets(view, provider);
  });
}

/**
 * Paint the parts of Live Preview that CodeMirror decorations can't reach.
 *
 * Tables, callouts and embeds are rendered as widgets: Obsidian builds their
 * DOM itself, and a mark decoration over the source range behind one has no
 * effect on what's drawn. They pick marks up when the widget is *built* — which
 * is why a mark inside a table only appeared after reopening the note.
 *
 * Painting the rendered DOM directly fills that gap, and needs no knowledge of
 * which widgets exist: paintQuote skips text already inside a mark, so
 * everything CodeMirror handled is left alone and only widget content is
 * touched.
 */
function paintRenderedWidgets(view: MarkdownView, provider: Provider): void {
  const path = view.file?.path;
  const content = asEl(view.contentEl.querySelector('.cm-content'));
  if (!path || !content) return;

  const annotations = provider(path);
  paintImages(content, annotations);
  for (const a of annotations) {
    if (a.anchor.kind !== 'markdown') continue;
    paintQuote(content, a);
  }
}
