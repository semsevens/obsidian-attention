import { describe, expect, it } from 'vitest';
import { preferredTrack, tracksFor } from '../src/hosts/transcript/trackFor';

const VAULT = [
  'talks/talk.m4a',
  'talks/talk.srt',
  'talks/talk.whisper.json',
  'talks/talk.vtt',
  'talks/talk.m4a.anno.json',
  'talks/other.srt',
  'elsewhere/talk.srt',
];

const paths = (dir = '') => tracksFor(VAULT, 'talks/talk.m4a', dir).map(t => t.path);

describe('tracksFor', () => {
  it('finds the tracks that name this recording', () => {
    expect(paths().sort()).toEqual(['talks/talk.srt', 'talks/talk.vtt', 'talks/talk.whisper.json']);
  });

  it('reads the marker out of the filename', () => {
    const found = tracksFor(VAULT, 'talks/talk.m4a', '');
    expect(found.find(t => t.path.endsWith('whisper.json'))?.marker).toBe('whisper');
    expect(found.find(t => t.path.endsWith('talk.srt'))?.marker).toBe('');
  });

  // `talk.m4a.anno.json` starts with the same name and ends in .json, and is
  // this plugin's own file — it is not a transcription of anything.
  it('does not mistake a sidecar for a track', () => {
    expect(paths()).not.toContain('talks/talk.m4a.anno.json');
  });

  it('ignores a recording of another name', () => {
    expect(paths()).not.toContain('talks/other.srt');
  });

  it('stays in the recording’s own folder by default', () => {
    expect(paths()).not.toContain('elsewhere/talk.srt');
  });

  it('looks in the configured folder when there is one', () => {
    expect(paths('elsewhere')).toEqual(['elsewhere/talk.srt']);
    expect(paths('/elsewhere/')).toEqual(['elsewhere/talk.srt']);
  });

  it('finds nothing for a recording with no transcription', () => {
    expect(tracksFor(VAULT, 'talks/silent.m4a', '')).toEqual([]);
  });
});

describe('preferredTrack', () => {
  const found = tracksFor(VAULT, 'talks/talk.m4a', '');

  // This vault's own setting: prefer the plain, unmarked track.
  it('honours a preference for the unmarked track', () => {
    expect(preferredTrack(found, [''])).toBe('talks/talk.srt');
  });

  it('honours a preference for a named one', () => {
    expect(preferredTrack(found, ['whisper'])).toBe('talks/talk.whisper.json');
  });

  it('falls back to srt over vtt over json when nothing is configured', () => {
    expect(preferredTrack(found, [])).toBe('talks/talk.srt');
  });

  it('answers null for a recording with no track', () => {
    expect(preferredTrack([], ['whisper'])).toBeNull();
  });
});
