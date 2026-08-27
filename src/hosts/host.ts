import { Annotation, Anchor } from '../model';

/**
 * A surface that can be annotated.
 *
 * The two hosts — markdown files and the transcript panel of the Media
 * Transcript plugin — have nothing in common except this contract, which is
 * what keeps the CodeMirror machinery out of the transcript code and vice
 * versa. New hosts (PDF, canvas, …) only need to implement this.
 */
export interface AnnotationHost {
  readonly id: string;

  /** Which vault file the current surface annotates, if any. */
  currentTarget(): string | null;

  /** Turn whatever the user has selected into an anchor, or null if nothing. */
  captureSelection(): Anchor | null;

  /**
   * Paint these annotations onto the surface. Must be idempotent — hosts that
   * re-render for their own reasons (search highlighting, editor reflow) will
   * call this again with the same input.
   */
  render(annotations: Annotation[]): void;

  /** Scroll to an annotation and, where it makes sense, seek playback to it. */
  reveal(annotation: Annotation): void;

  detach(): void;
}
