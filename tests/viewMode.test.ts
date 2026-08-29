import { describe, expect, it } from 'vitest';
import { resolveViewMode, ViewModeSettings } from '../src/viewMode';

const READING = { mode: 'preview', source: false };
const LIVE = { mode: 'source', source: false };
const SOURCE = { mode: 'source', source: true };

function settings(over: Partial<ViewModeSettings> = {}): ViewModeSettings {
  return {
    forceViewMode: true,
    defaultViewMode: 'reading',
    folderViewModes: [],
    ...over,
  };
}

describe('the master switch', () => {
  it('leaves every note alone when off', () => {
    const s = settings({ forceViewMode: false, folderViewModes: [{ folder: 'raw', mode: 'reading' }] });
    expect(resolveViewMode('raw/a.md', { obsidianUIMode: 'preview' }, s)).toBeNull();
  });
});

describe('the vault-wide default', () => {
  it('opens anything no rule claims in reading mode', () => {
    expect(resolveViewMode('anywhere/a.md', null, settings())).toEqual(READING);
  });

  it('touches nothing when the default is "default"', () => {
    expect(resolveViewMode('a.md', null, settings({ defaultViewMode: 'default' }))).toBeNull();
  });
});

describe('folder rules', () => {
  const s = settings({
    defaultViewMode: 'reading',
    folderViewModes: [{ folder: 'journal', mode: 'live' }],
  });

  it('claims files under the folder', () => {
    expect(resolveViewMode('journal/2026-08-29.md', null, s)).toEqual(LIVE);
  });

  it('claims files nested deeper', () => {
    expect(resolveViewMode('journal/2026/08.md', null, s)).toEqual(LIVE);
  });

  it('leaves the rest to the default', () => {
    expect(resolveViewMode('raw/x/a.md', null, s)).toEqual(READING);
  });

  it('does not match a folder that merely shares a prefix', () => {
    expect(resolveViewMode('journalism/a.md', null, s)).toEqual(READING);
  });

  it('does not claim a file that is named like the folder', () => {
    expect(resolveViewMode('journal.md', null, s)).toEqual(READING);
  });

  it('lets the deepest folder win, whatever order the rules are in', () => {
    const nested = settings({
      folderViewModes: [
        { folder: 'raw/drafts', mode: 'live' },
        { folder: 'raw', mode: 'reading' },
      ],
    });
    expect(resolveViewMode('raw/drafts/a.md', null, nested)).toEqual(LIVE);
    expect(resolveViewMode('raw/x/a.md', null, nested)).toEqual(READING);
  });

  it('ignores blank folders and stray slashes', () => {
    const messy = settings({
      defaultViewMode: 'default',
      folderViewModes: [
        { folder: '  ', mode: 'live' },
        { folder: '/raw/x/', mode: 'source' },
      ],
    });
    expect(resolveViewMode('raw/x/a.md', null, messy)).toEqual(SOURCE);
    expect(resolveViewMode('elsewhere/a.md', null, messy)).toBeNull();
  });
});

// The keys are Force note view mode's, so notes already carrying them keep
// working when this takes over.
describe('frontmatter, which outranks every rule', () => {
  const s = settings({ folderViewModes: [{ folder: 'raw', mode: 'reading' }] });

  it('opens a note in editing when it asks to', () => {
    expect(resolveViewMode('raw/a.md', { obsidianUIMode: 'source' }, s)).toEqual(LIVE);
  });

  it('opens a note in reading when it asks to', () => {
    const editing = settings({ defaultViewMode: 'live' });
    expect(resolveViewMode('a.md', { obsidianUIMode: 'preview' }, editing)).toEqual(READING);
  });

  it('reads obsidianEditingMode on its own as a request to edit', () => {
    expect(resolveViewMode('raw/a.md', { obsidianEditingMode: 'source' }, s)).toEqual(SOURCE);
    expect(resolveViewMode('raw/a.md', { obsidianEditingMode: 'live' }, s)).toEqual(LIVE);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(resolveViewMode('a.md', { obsidianUIMode: ' Preview ' }, settings({ defaultViewMode: 'live' })))
      .toEqual(READING);
  });

  it('falls through when the value is empty or not a string', () => {
    expect(resolveViewMode('raw/a.md', { obsidianUIMode: '' }, s)).toEqual(READING);
    expect(resolveViewMode('raw/a.md', { obsidianUIMode: 42 }, s)).toEqual(READING);
  });

  it('falls through when the note has no frontmatter at all', () => {
    expect(resolveViewMode('raw/a.md', undefined, s)).toEqual(READING);
  });
});
