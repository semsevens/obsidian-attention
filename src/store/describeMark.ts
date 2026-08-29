/**
 * A mark, written out so it can be pasted somewhere else.
 *
 * The panel shows a mark in the shape that suits reading a list; taking one
 * *out* of the plugin needs the parts a list leaves implicit — which file it
 * is in, and where in that file — or it arrives somewhere else as an
 * unattributed quotation.
 */

import { Annotation, isComment } from '../model';

export interface Described {
  /** What to put on the clipboard. */
  text: string;
}

export interface DescribeOptions {
  /** Vault-relative path of the file the mark is in. */
  targetPath: string;
  /** How to render a timestamp, so it matches what the panel shows. */
  when: (iso: string) => string;
  /** Seconds → `1:23`, for marks on a recording. */
  clock?: (seconds: number) => string;
}

export function describeMark(annotation: Annotation, options: DescribeOptions): Described {
  const { anchor } = annotation;
  const lines: string[] = [];

  // The quote first and as a blockquote: pasted into a note it should read as
  // the passage it is, not as a field in a record.
  for (const line of anchor.quote.split('\n')) lines.push(`> ${line}`);

  if (isComment(annotation)) {
    lines.push('');
    for (const line of (annotation.body ?? '').split('\n')) lines.push(line);
  }

  lines.push('');
  lines.push(`Source: ${options.targetPath}`);

  if (anchor.kind === 'transcript' && options.clock) {
    lines.push(`At: ${options.clock(anchor.start)}`);
  }

  const times = annotation.hits.map(options.when);
  lines.push(
    annotation.hits.length === 1
      ? `Marked: ${times[0]}`
      : `Marked ${annotation.hits.length}×: ${times.join(', ')}`,
  );

  return { text: lines.join('\n') };
}
