import { EditorView, Decoration, DecorationSet, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { StateEffect, Extension, Range } from '@codemirror/state';
import { App, MarkdownView, editorInfoField } from 'obsidian';
import { Annotation } from '../../model';
import { resolve } from '../../anchor/textQuote';
import { isComment } from '../../model';

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

function build(view: EditorView, provider: Provider): DecorationSet {
  const path = view.state.field(editorInfoField, false)?.file?.path;
  if (!path) return Decoration.none;

  const annotations = provider(path);
  if (annotations.length === 0) return Decoration.none;

  const doc = view.state.doc.toString();
  const ranges: Range<Decoration>[] = [];

  for (const a of annotations) {
    if (a.anchor.kind !== 'markdown') continue;
    const at = resolve(doc, a.anchor);
    // A null resolution is an orphan — deliberately draw nothing rather than
    // guess, and let the review panel surface it for re-anchoring.
    if (!at || at.from === at.to) continue;
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
        if (u.docChanged || u.viewportChanged || refreshed) {
          this.decorations = build(u.view, provider);
        }
      }
    },
    { decorations: v => v.decorations },
  );
}

/**
 * Nudge every open editor to repaint.
 *
 * `editor.cm` is the underlying EditorView. It isn't in the public typings, but
 * it is stable and is how plugins reach CodeMirror; the optional chaining below
 * keeps a future rename from throwing.
 */
export function repaintEditors(app: App): void {
  app.workspace.getLeavesOfType('markdown').forEach(leaf => {
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    const cm = (view.editor as unknown as { cm?: EditorView }).cm;
    cm?.dispatch({ effects: refreshAnnotations.of() });
  });
}
