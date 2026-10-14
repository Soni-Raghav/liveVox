/**
 * Unit tests for the transcript exporters.
 */
import { describe, expect, it } from 'vitest';
import { formatSrtTime, toSrt, toTxt } from './exporters.js';

const SEGMENTS = [
  {
    startedAt: 1000000,
    endedAt: 1003200,
    sourceText: 'Bonjour le monde.',
    translatedText: 'Hello world.',
  },
  {
    startedAt: 1005000,
    endedAt: 1007000,
    sourceText: 'Au revoir.',
    translatedText: 'Goodbye.',
  },
];

describe('formatSrtTime', () => {
  it('formats zero as "00:00:00,000"', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
  });
  it('formats hours, minutes, seconds and millis with padding', () => {
    expect(formatSrtTime(3661500)).toBe('01:01:01,500');
  });
});

describe('toSrt', () => {
  it('numbers cues from 1 and uses the first segment as the zero point', () => {
    const srt = toSrt(SEGMENTS);
    const [cue1, cue2] = srt.trim().split('\n\n');
    expect(cue1.split('\n')[0]).toBe('1');
    expect(cue1).toContain('00:00:00,000 --> 00:00:03,200');
    expect(cue1.split('\n')[2]).toBe('Hello world.');
    expect(cue2.split('\n')[0]).toBe('2');
    expect(cue2).toContain('00:00:05,000 --> 00:00:07,000');
    expect(cue2.split('\n')[2]).toBe('Goodbye.');
  });

  it('falls back to the source text when no translation exists', () => {
    const srt = toSrt([
      { startedAt: 500, endedAt: 1500, sourceText: 'Original', translatedText: '' },
    ]);
    expect(srt).toContain('Original');
  });

  it('returns an empty string without usable segments', () => {
    expect(toSrt([])).toBe('');
    expect(toSrt([{ startedAt: 0, endedAt: 0, sourceText: '', translatedText: '' }])).toBe('');
  });
});

describe('toTxt', () => {
  it('includes timestamps, source and translation', () => {
    const txt = toTxt(SEGMENTS);
    expect(txt).toContain('00:00:00  Bonjour le monde.');
    expect(txt).toContain('→ Hello world.');
    expect(txt).toContain('00:00:05  Au revoir.');
  });
});
