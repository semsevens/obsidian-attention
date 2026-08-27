import { moment } from 'obsidian';

/**
 * Obsidian exports moment typed as the module namespace, which TypeScript
 * doesn't see as callable even though it is. Narrow it to what's used here
 * rather than casting at each call site.
 */
interface MomentLike {
  isValid(): boolean;
  format(fmt: string): string;
  fromNow(): string;
  from(other: MomentLike): string;
}
const asMoment = moment as unknown as (input?: string | number) => MomentLike;

/**
 * How a mark's timestamp is shown.
 *
 * `format` is a moment format string — the same vocabulary Obsidian uses for
 * daily note filenames, so there is nothing new to learn. Empty falls back to
 * a relative time, which is locale-aware: a Chinese vault gets 三天前 rather
 * than a hardcoded English string.
 */
export function formatWhen(iso: string, format = '', now?: number): string {
  const m = asMoment(iso);
  if (!m.isValid()) return iso;
  if (format.trim().length > 0) return m.format(format);
  return now === undefined ? m.fromNow() : m.from(asMoment(now));
}

/** Offered in settings as a starting point. */
export const TIME_FORMAT_EXAMPLES = [
  'YYYY-MM-DD HH:mm:ss',
  'YYYY-MM-DD HH:mm',
  'YYYY-MM-DD',
];
