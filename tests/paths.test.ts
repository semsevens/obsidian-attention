import { describe, it, expect } from 'vitest';
import {
  sidecarPathFor,
  targetPathFor,
  isSidecarPath,
  SIDECAR_SUFFIX,
} from '../src/store/paths';

describe('sidecar naming', () => {
  it('appends the suffix to the full filename, extension included', () => {
    expect(sidecarPathFor('notes/lecture.mp4')).toBe('notes/lecture.mp4.anno.json');
    expect(sidecarPathFor('周报.md')).toBe('周报.md.anno.json');
  });

  it('gives same-named media in different formats separate sidecars', () => {
    // The whole reason the original extension is kept: a vault routinely holds
    // both, and they must not share one annotation file.
    expect(sidecarPathFor('lecture.mp4')).not.toBe(sidecarPathFor('lecture.m4a'));
  });

  it('round-trips, including filenames that already contain dots', () => {
    for (const path of [
      'lecture.mp4',
      'a/b/v1.2.final.mp4',
      '周报.md',
      'no-extension',
      'weird.name.with.many.dots.wav',
    ]) {
      expect(targetPathFor(sidecarPathFor(path))).toBe(path);
    }
  });

  it('rejects paths that are not sidecars', () => {
    expect(targetPathFor('lecture.mp4')).toBeNull();
    expect(targetPathFor('lecture.whisper.json')).toBeNull();
    expect(isSidecarPath('lecture.whisper.json')).toBe(false);
  });

  it('refuses a bare suffix and a sidecar of a sidecar', () => {
    expect(targetPathFor(SIDECAR_SUFFIX)).toBeNull();
    expect(targetPathFor(sidecarPathFor(sidecarPathFor('a.md')))).toBeNull();
  });
});

describe('coexistence with obsidian-media-transcript', () => {
  // That plugin claims a media file's subtitles with this pattern, and globally
  // registers `.json`. If our sidecar matched, it would show up as a bogus
  // subtitle track named "anno" and fail to parse. Pin the invariant here so a
  // future change to SIDECAR_SUFFIX can't silently break it.
  const subtitleRegex = (base: string) =>
    new RegExp(`^${base}(?:\\.([^.]+))?\\.(?:srt|vtt|json)$`);

  it('is not mistaken for a subtitle track of its own media', () => {
    expect(subtitleRegex('lecture').test('lecture.mp4.anno.json')).toBe(false);
    // Sanity: the pattern really does match what it is meant to.
    expect(subtitleRegex('lecture').test('lecture.whisper.json')).toBe(true);
    expect(subtitleRegex('lecture').test('lecture.srt')).toBe(true);
  });

  it('is not mistaken for a subtitle of a *markdown* note either', () => {
    expect(subtitleRegex('周报').test('周报.md.anno.json')).toBe(false);
  });
});
