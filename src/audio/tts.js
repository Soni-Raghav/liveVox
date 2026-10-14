/**
 * TTS manager — queue of speechSynthesis utterances with voice selection,
 * duration-fitting rate control and stale-utterance cancellation.
 *
 * Design notes:
 * - We manage our own queue and only `speak()` the head, because
 *   speechSynthesis has no API to cancel a single queued utterance.
 * - Rate auto-adjust: the translated sentence should take roughly as long
 *   as the original speech did, within TTS.RATE_MIN..RATE_MAX (0.8..1.5).
 * - Cloud voices (voice.localService === false, e.g. "Google" voices in
 *   Chrome) are excluded when offline — they would fail silently.
 * - Ducking is driven by onSpeakingChange(true/false) around utterance
 *   start/end (see orchestrator + ducking.js).
 */
import { TTS } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('tts');

/**
 * Compute the utterance rate that fits a text into a target duration.
 *
 * @param {{text: string, targetDurationMs: number, baseRate?: number,
 *          driftBoost?: number}} options
 * @returns {number} rate clamped to TTS.RATE_MIN..TTS.RATE_MAX
 */
export function computeRate({ text, targetDurationMs, baseRate = 1, driftBoost = 1 }) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSec = words / TTS.WORDS_PER_SECOND_AT_1X;
  const targetSec = Math.max(targetDurationMs / 1000, 0.5);
  const fit = estimatedSec / targetSec;
  return Math.min(TTS.RATE_MAX, Math.max(TTS.RATE_MIN, baseRate * fit * driftBoost));
}

/**
 * @typedef {Object} TtsJob
 * @property {string} id - owning transcript segment id
 * @property {string} text - translated text to speak
 * @property {string} lang - target language ISO code
 * @property {boolean} [localOnly] - restrict to on-device voices (offline)
 * @property {number} targetDurationMs - how long the original speech took
 * @property {number} [driftBoost] - sync-engine rate multiplier (default 1)
 * @property {() => void} [onStart] - fired when the utterance starts
 * @property {() => void} [onEnd] - fired when it finishes or errors
 */

export class TtsManager {
  /**
   * @param {{onSpeakingChange?: (speaking: boolean) => void,
   *          onNoVoice?: (lang: string) => void}} [handlers]
   */
  constructor(handlers = {}) {
    this.onSpeakingChange = handlers.onSpeakingChange;
    this.onNoVoice = handlers.onNoVoice;
    this.supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    /** @type {TtsJob[]} */
    this.queue = [];
    /** @type {SpeechSynthesisUtterance|null} */
    this.current = null;
    this.voices = this.supported ? window.speechSynthesis.getVoices() : [];
    this.volume = 1;
    this.baseRate = 1;
    this.droppedCount = 0;
    this.speaking = false;
    if (this.supported) {
      // Voice lists populate asynchronously in Chrome.
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this.voices = window.speechSynthesis.getVoices();
      });
    } else {
      log.warn('speechSynthesis unavailable — TTS disabled');
    }
  }

  /** @returns {number} queued + currently speaking utterances */
  get queueLength() {
    return this.queue.length + (this.current ? 1 : 0);
  }

  /**
   * Volume for future utterances (0..1). Active utterances keep their own.
   *
   * @param {number} volume
   */
  setVolume(volume) {
    this.volume = volume;
  }

  /**
   * Pick the best voice for a language. Prefers on-device voices (latency
   * and offline), honours an explicit user choice when it still exists.
   *
   * @param {string} lang - ISO code ('en', 'pt'...)
   * @param {{localOnly?: boolean}} [options] - offline restricts to local
   * @returns {SpeechSynthesisVoice|null} voice or null when none matches
   */
  pickVoice(lang, { localOnly = false } = {}) {
    const prefix = lang.slice(0, 2).toLowerCase();
    let candidates = this.voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
    if (candidates.length === 0) return null;
    if (localOnly) {
      // Cloud voices would silently fail offline — never use them.
      candidates = candidates.filter((v) => v.localService);
      if (candidates.length === 0) return null;
    } else {
      const local = candidates.filter((v) => v.localService);
      if (local.length > 0) candidates = local;
    }
    if (this.voiceURI) {
      const chosen = candidates.find((v) => v.voiceURI === this.voiceURI);
      if (chosen) return chosen;
    }
    return candidates[0];
  }

  /**
   * Enqueue an utterance (bounded — drops when the queue is already full).
   *
   * @param {TtsJob} job
   * @returns {boolean} true when enqueued
   */
  enqueue(job) {
    if (!this.supported) return false;
    if (this.queue.length >= TTS.QUEUE_MAX) {
      this.droppedCount += 1;
      log.warn(`TTS queue full — dropped segment (total dropped: ${this.droppedCount})`);
      return false;
    }
    job.queuedAt = Date.now();
    this.queue.push(job);
    if (!this.current) this.#speakNext();
    return true;
  }

  /**
   * Drop queued jobs older than the staleness threshold (latency guard).
   *
   * @param {number} [now] - injectable clock (tests)
   * @returns {number} number of dropped jobs
   */
  flushStale(now = Date.now()) {
    const before = this.queue.length;
    this.queue = this.queue.filter((job) => now - job.queuedAt < TTS.STALE_MS);
    return before - this.queue.length;
  }

  /** Cancel everything (session stop / settings change). */
  cancelAll() {
    if (this.supported) window.speechSynthesis.cancel();
    this.queue = [];
    this.current = null;
    this.#updateSpeaking(false);
  }

  /**
   * Speak the head of the queue.
   *
   * @returns {void}
   */
  #speakNext() {
    const job = this.queue.shift();
    if (!job) return;
    const voice = this.pickVoice(job.lang, { localOnly: job.localOnly });
    if (!voice) {
      this.onNoVoice?.(job.lang);
      job.onEnd?.();
      return this.#speakNext(); // keep the queue moving
    }
    const utterance = new SpeechSynthesisUtterance(job.text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.volume = this.volume;
    utterance.rate = computeRate({
      text: job.text,
      targetDurationMs: job.targetDurationMs,
      baseRate: this.baseRate,
      driftBoost: job.driftBoost ?? 1,
    });

    const finish = () => {
      if (this.current === utterance) this.current = null;
      job.onEnd?.();
      // Only report "stopped speaking" when nothing else is queued, so
      // ducking does not flicker between consecutive sentences.
      if (this.queue.length === 0) this.#updateSpeaking(false);
      this.#speakNext();
    };
    utterance.onstart = () => {
      job.onStart?.();
      this.#updateSpeaking(true);
    };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      log.warn(`utterance error: ${event.error}`);
      finish();
    };

    this.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * @param {boolean} speaking
   */
  #updateSpeaking(speaking) {
    if (this.speaking === speaking) return;
    this.speaking = speaking;
    this.onSpeakingChange?.(speaking);
  }
}
