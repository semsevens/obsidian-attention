import { describe, expect, it } from 'vitest';
import { ownerOfMarks } from '../src/hosts/transcript/owner';

describe('ownerOfMarks', () => {
  it('files a mark under the subtitle track it was read from', () => {
    expect(ownerOfMarks('talk.m4a', 'talk.srt')).toBe('talk.srt');
  });

  it('tells two transcriptions of one recording apart', () => {
    expect(ownerOfMarks('talk.m4a', 'talk.whisper.json'))
      .not.toBe(ownerOfMarks('talk.m4a', 'talk.srt'));
  });

  it('falls back to the recording when there is no track file', () => {
    expect(ownerOfMarks('talk.m4a', '')).toBe('talk.m4a');
    expect(ownerOfMarks('talk.m4a', '   ')).toBe('talk.m4a');
  });
});
