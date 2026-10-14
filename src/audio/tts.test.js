/**
 * Unit tests for TTS rate fitting and voice selection (pure parts).
 */
import { describe, expect, it } from 'vitest';
import { computeRate, TtsManager } from './tts.js';

describe('computeRate', () => {
  it('returns ~1 when the translation fits the original duration', () => {
    // 13 words ≈ 5 s of speech at 2.6 w/s; original segment 5 s.
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    expect(computeRate({ text, targetDurationMs: 5000 })).toBeCloseTo(1, 1);
  });

  it('speeds up when the translation is longer than the original', () => {
    const text = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    expect(computeRate({ text, targetDurationMs: 3000 })).toBeGreaterThan(1.2);
  });

  it('slows down (down to RATE_MIN) when there is plenty of time', () => {
    const text = 'short line';
    expect(computeRate({ text, targetDurationMs: 10000 })).toBe(0.8);
  });

  it('clamps to RATE_MAX regardless of drift boost', () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    expect(computeRate({ text, targetDurationMs: 1000, driftBoost: 1.3 })).toBe(1.5);
  });

  it('honours the user base rate within the clamp', () => {
    expect(
      computeRate({ text: 'hello there friend', targetDurationMs: 1200, baseRate: 1.2 })
    ).toBeGreaterThan(1);
  });
});

describe('TtsManager.pickVoice', () => {
  const voices = [
    { voiceURI: 'cloud-en', lang: 'en-US', localService: false },
    { voiceURI: 'local-en', lang: 'en-GB', localService: true },
    { voiceURI: 'local-es', lang: 'es-ES', localService: true },
  ];

  it('prefers local voices for the language', () => {
    const manager = new TtsManager();
    manager.voices = voices;
    expect(manager.pickVoice('en').voiceURI).toBe('local-en');
  });

  it('honours an explicit user voice choice', () => {
    const manager = new TtsManager();
    manager.voices = voices;
    manager.voiceURI = 'local-es';
    expect(manager.pickVoice('es').voiceURI).toBe('local-es');
  });

  it('returns null when offline and only cloud voices exist', () => {
    const manager = new TtsManager();
    manager.voices = [voices[0]]; // cloud-only English
    expect(manager.pickVoice('en', { localOnly: true })).toBeNull();
  });

  it('returns null for an unknown language', () => {
    const manager = new TtsManager();
    manager.voices = voices;
    expect(manager.pickVoice('xx')).toBeNull();
  });
});

describe('TtsManager queue bounds', () => {
  it('enqueue is a safe no-op without speechSynthesis support', () => {
    const manager = new TtsManager(); // jsdom: window.speechSynthesis undefined
    expect(manager.supported).toBe(false);
    expect(manager.enqueue({ id: 's', text: 'hi', lang: 'en', targetDurationMs: 1000 })).toBe(
      false
    );
    expect(manager.queueLength).toBe(0);
  });
});
