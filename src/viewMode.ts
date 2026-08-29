/**
 * Which mode a note opens in.
 *
 * Reading mode is the natural default for a plugin about attention: the raw
 * material you collect is there to be read and marked, not edited, and marks
 * live in a sidecar so reading mode costs nothing — you can highlight and
 * comment without ever leaving it.
 *
 * This is *not* read-only. Obsidian has no such thing: reading mode only picks
 * a view, and Ctrl+E still flips to editing. What it buys is that the raw
 * material stops inviting stray keystrokes.
 */

/** What a note should open as. `default` means: don't touch it. */
export type ViewModePreference = 'default' | 'reading' | 'live' | 'source';

export interface FolderViewMode {
  /** Vault-relative folder. Matches the folder itself and everything under it. */
  folder: string;
  mode: ViewModePreference;
}

/** The two fields Obsidian's markdown leaf state actually carries. */
export interface ViewModeTarget {
  mode: 'preview' | 'source';
  source: boolean;
}

export interface ViewModeSettings {
  /** Master switch: leave every note alone when off. */
  forceViewMode: boolean;
  /** Applied to anything no folder rule claims. */
  defaultViewMode: ViewModePreference;
  /** Exceptions, most specific folder wins. */
  folderViewModes: FolderViewMode[];
}

// The keys Force note view mode uses. Reading them means notes already carrying
// that frontmatter keep working after this takes over from it.
const UI_MODE_KEY = 'obsidianUIMode';
const EDITING_MODE_KEY = 'obsidianEditingMode';

const TARGETS: Record<Exclude<ViewModePreference, 'default'>, ViewModeTarget> = {
  reading: { mode: 'preview', source: false },
  live: { mode: 'source', source: false },
  source: { mode: 'source', source: true },
};

export function targetFor(pref: ViewModePreference): ViewModeTarget | null {
  return pref === 'default' ? null : TARGETS[pref];
}

/**
 * What this note should open as, or null to leave it alone.
 *
 * Precedence is most-specific-first: the note's own frontmatter, then the
 * deepest folder rule covering it, then the vault-wide default.
 */
export function resolveViewMode(
  path: string,
  frontmatter: Record<string, unknown> | null | undefined,
  settings: ViewModeSettings,
): ViewModeTarget | null {
  if (!settings.forceViewMode) return null;

  const declared = fromFrontmatter(frontmatter);
  if (declared) return declared;

  const rule = deepestRule(path, settings.folderViewModes);
  if (rule) return targetFor(rule.mode);

  return targetFor(settings.defaultViewMode);
}

/**
 * The note's own say, in Force note view mode's vocabulary.
 *
 * `obsidianEditingMode` alone is enough to mean editing: asking for live
 * preview while the note opens in reading mode is not a thing anyone means.
 */
function fromFrontmatter(fm: Record<string, unknown> | null | undefined): ViewModeTarget | null {
  if (!fm) return null;

  const editing = str(fm[EDITING_MODE_KEY]);
  const ui = str(fm[UI_MODE_KEY]);

  if (ui === 'preview') return TARGETS.reading;
  if (ui === 'source' || editing) {
    return editing === 'source' ? TARGETS.source : TARGETS.live;
  }
  return null;
}

/**
 * The rule whose folder sits deepest above this file.
 *
 * A vault with both `raw` and `raw/x` configured means the reader wants `raw/x`
 * treated as its own thing, so the longer match has to win regardless of the
 * order the rules happen to be listed in.
 */
function deepestRule(path: string, rules: readonly FolderViewMode[]): FolderViewMode | null {
  let best: FolderViewMode | null = null;
  for (const rule of rules) {
    const folder = normalizeFolder(rule.folder);
    if (folder === null || !covers(folder, path)) continue;
    if (!best || folder.length > normalizeFolder(best.folder)!.length) best = rule;
  }
  return best;
}

/** `''` and `/` both mean the vault root, and a trailing slash is noise. */
function normalizeFolder(folder: string): string | null {
  const trimmed = folder.trim().replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? null : trimmed;
}

function covers(folder: string, path: string): boolean {
  return path.startsWith(folder + '/');
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim().toLowerCase() : null;
}
