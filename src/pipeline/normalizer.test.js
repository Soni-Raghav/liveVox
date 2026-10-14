/**
 * Unit tests for the text normalizer.
 */
import { describe, expect, it } from 'vitest';
import {
  fixPunctuation,
  keepRollingContext,
  SentenceMerger,
  stripDisfluencies,
} from './normalizer.js';

describe('stripDisfluencies', () => {
  it('removes common fillers', () => {
    expect(stripDisfluencies('um I think uh we should go')).toBe('I think we should go');
    expect(stripDisfluencies('Erm yes')).toBe('yes');
    expect(stripDisfluencies('hmm let me see')).toBe('let me see');
  });

  it('leaves real words intact', () => {
    expect(stripDisfluencies('the umbrella is under the umbrella stand')).toBe(
      'the umbrella is under the umbrella stand'
    );
    // "summer" must not lose its "um".
    expect(stripDisfluencies('summer in summer')).toBe('summer in summer');
  });

  it('handles empty input', () => {
    expect(stripDisfluencies('')).toBe('');
  });
});

describe('fixPunctuation', () => {
  it('capitalizes and terminates sentences', () => {
    expect(fixPunctuation('hello world')).toBe('Hello world.');
    expect(fixPunctuation('  it is fine.  ')).toBe('It is fine.');
  });

  it('fixes spacing before punctuation and collapses repeats', () => {
    expect(fixPunctuation('wait , really ?')).toBe('Wait, really?');
    expect(fixPunctuation('wow!!!')).toBe('Wow!');
  });

  it('capitalizes after sentence enders and standalone i', () => {
    // (terminal period is appended — see the first test)
    expect(fixPunctuation('one. two three')).toBe('One. Two three.');
    expect(fixPunctuation('i think i can')).toBe('I think I can.');
  });
});

describe('keepRollingContext', () => {
  it('returns short text unchanged', () => {
    expect(keepRollingContext('one two three', 512)).toBe('one two three');
  });
  it('trims to the token budget from the start', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`);
    const kept = keepRollingContext(words.join(' '), 512).split(' ');
    // 512 tokens / 1.33 ≈ 384 words (floor)
    expect(kept.length).toBe(384);
    expect(kept[kept.length - 1]).toBe('w499');
  });
});

describe('SentenceMerger', () => {
  it('emits a sentence once terminal punctuation arrives', () => {
    const merger = new SentenceMerger();
    expect(merger.feed('the plan is', 'seg1')).toEqual([]);
    const out = merger.feed('simple.', 'seg1');
    expect(out).toEqual([{ text: 'the plan is simple.', segmentId: 'seg1' }]);
    expect(merger.pending).toBe(false);
  });

  it('attributes the sentence to the segment of the last fragment', () => {
    const merger = new SentenceMerger();
    merger.feed('hello there and', 'seg1');
    const out = merger.feed('welcome.', 'seg2');
    expect(out[0].segmentId).toBe('seg2');
    expect(out[0].text).toBe('hello there and welcome.');
  });

  it('force-cuts run-on text at the max length', () => {
    const merger = new SentenceMerger({ maxChars: 40 });
    const long = 'word '.repeat(20).trim(); // 100 chars
    const out = merger.feed(long, 'seg1');
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].text.length).toBeLessThanOrEqual(41);
    // Whatever was not emitted stays buffered.
    expect(merger.pending).toBe(true);
  });

  it('flushes on pause', () => {
    const merger = new SentenceMerger();
    merger.feed('trailing thought', 'seg1');
    const out = merger.flushForPause('seg1');
    expect(out).toEqual([{ text: 'trailing thought', segmentId: 'seg1' }]);
  });

  it('maintains a rolling context across sentences', () => {
    const merger = new SentenceMerger();
    merger.feed('first sentence here.', 'a');
    merger.feed('second sentence there.', 'b');
    expect(merger.context).toContain('first sentence here.');
    expect(merger.context).toContain('second sentence there.');
  });

  it('reset clears everything', () => {
    const merger = new SentenceMerger();
    merger.feed('partial', 'a');
    merger.reset();
    expect(merger.pending).toBe(false);
    expect(merger.context).toBe('');
  });
});
