/**
 * Normalizer — turns raw ASR fragments into clean, sentence-level units.
 *
 * Stages:
 *   1. stripDisfluencies — remove "um/uh/erm/…" fillers
 *   2. fixPunctuation    — whitespace, capitalization, terminal punctuation
 *   3. SentenceMerger    — accumulate fragments, emit complete sentences,
 *                          force-flush on length or pause, keep a rolling
 *                          ~512-token context (spec requirement) to help
 *                          fragment merging decisions
 *
 * Pure module — no browser APIs — fully unit-testable.
 */
import { ASR, NORMALIZER } from '../lib/constants.js';

/** Filler words (English core + common Romance/Germanic variants). */
const DISFLUENCY_PATTERN = /\b(?:u+m+h*|u+hm*|erm+|er+m|h+m+|mhm|euh+|äh+|ö+hm*|mm+)\b[,.]?\s*/giu;

/**
 * Remove spoken disfluencies ("um", "uh", "erm", ...).
 *
 * @param {string} text - raw ASR fragment
 * @returns {string} cleaned text
 */
export function stripDisfluencies(text) {
  if (!text) return '';
  return text.replace(DISFLUENCY_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Normalize whitespace, casing and terminal punctuation.
 *
 * @param {string} text - disfluency-free text
 * @returns {string} presentable text
 */
export function fixPunctuation(text) {
  if (!text) return '';
  let out = text.replace(/\s{2,}/g, ' ').trim();
  // " ," / " ." artefacts from ASR
  out = out.replace(/\s+([,.!?;:])/g, '$1');
  // collapse runs of identical terminal punctuation
  out = out.replace(/([!?])\1{1,}/g, '$1').replace(/\.{3,}/g, '…');
  // capitalize the first letter and after sentence enders
  out = out.replace(/(^|[.!?…]\s+)(\p{Ll})/gu, (m, p1, p2) => p1 + p2.toUpperCase());
  // English standalone "i"
  out = out.replace(/(^|\s)i(\s|'|$)/g, '$1I$2');
  // add a terminal period when the text ends in a letter or digit
  if (/\p{L}$/u.test(out) && !/[.!?……]$/.test(out)) out += '.';
  return out;
}

/**
 * Keep the last N words of a text (rolling context, ~512 tokens ≈ 385 words
 * at 1.33 tokens/word — see ASR.CONTEXT_TOKENS).
 *
 * @param {string} text - accumulated context text
 * @param {number} [maxTokens=ASR.CONTEXT_TOKENS] - token budget
 * @returns {string} trimmed context
 */
export function keepRollingContext(text, maxTokens = ASR.CONTEXT_TOKENS) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const maxWords = Math.floor(maxTokens / 1.33);
  if (words.length <= maxWords) return text;
  return words.slice(words.length - maxWords).join(' ');
}

/**
 * Sentence-level fragment merger.
 *
 * Emits a sentence when the buffer ends with terminal punctuation (and has
 * enough substance), when the buffer exceeds maxChars (word-boundary cut),
 * or when flushForPause() is called after a long silence gap. Completed
 * sentences update the rolling context.
 */
export class SentenceMerger {
  /**
   * @param {{maxChars?: number}} [options]
   */
  constructor(options = {}) {
    this.maxChars = options.maxChars ?? NORMALIZER.MAX_SENTENCE_CHARS;
    /** @type {string} */
    this.buffer = '';
    /** @type {string} */
    this.context = '';
    /** Last feed time (ms epoch) — drives pause-based flushes. */
    this.lastFeedAt = 0;
  }

  /**
   * Whether a fragment is pending in the buffer.
   *
   * @returns {boolean}
   */
  get pending() {
    return this.buffer.length > 0;
  }

  /**
   * Feed one normalized fragment; returns completed sentences.
   *
   * @param {string} fragment - normalized ASR fragment
   * @param {string} segmentId - segment the fragment came from (completed
   *   sentences are attributed to the segment of their LAST fragment)
   * @returns {Array<{text: string, segmentId: string}>} completed sentences
   */
  feed(fragment, segmentId) {
    this.lastFeedAt = Date.now();
    if (!fragment) return [];
    this.buffer = `${this.buffer} ${fragment}`.trim();
    return this.#extract(segmentId);
  }

  /**
   * Force-close the buffer (long pause / session stop).
   *
   * @param {string} [segmentId] - attribution for the flushed sentence
   * @returns {Array<{text: string, segmentId: string}>} flushed sentences
   */
  flushForPause(segmentId) {
    if (!this.pending) return [];
    const text = this.buffer;
    this.buffer = '';
    return this.#complete(text, segmentId);
  }

  /** Reset buffer, context and timing (new session). */
  reset() {
    this.buffer = '';
    this.context = '';
    this.lastFeedAt = 0;
  }

  /**
   * Split the buffer into complete sentences where possible.
   *
   * @param {string} segmentId - attribution for trailing sentences
   * @returns {Array<{text: string, segmentId: string}>}
   */
  #extract(segmentId) {
    /** @type {Array<{text: string, segmentId: string}>} */
    const emitted = [];
    // Split AFTER terminal punctuation. CJK enders included.
    const parts = this.buffer.split(/(?<=[.!?。！？])\s+/);
    let keep = '';
    for (const part of parts) {
      if (part === '') continue;
      if (/[.!?。！？]$/.test(part) && this.#isSubstantial(part)) {
        emitted.push(...this.#complete(part, segmentId));
      } else {
        // Incomplete tail (or too short) — keep buffering.
        keep = keep ? `${keep} ${part}` : part;
      }
    }
    this.buffer = keep;

    // Hard length cut: protects latency on run-on speech without punctuation.
    // (Guard counter: pathological input must never spin the loop.)
    let guard = 0;
    while (this.buffer.length > this.maxChars && guard < 10) {
      guard += 1;
      const cut = this.#cutAtSpace(this.buffer, this.maxChars);
      // Remove the emitted prefix from the buffer, then finalize it.
      this.buffer = this.buffer.slice(cut.length).trim();
      emitted.push(...this.#complete(cut, segmentId));
      if (cut.length === 0) break;
    }
    return emitted;
  }

  /**
   * A sentence needs some substance to be emitted on punctuation alone.
   *
   * @param {string} text
   * @returns {boolean}
   */
  #isSubstantial(text) {
    return text.replace(/\s/g, '').length >= 8 || text.trim().split(/\s+/).length >= 2;
  }

  /**
   * Cut text at the last word boundary at-or-before `limit`.
   *
   * @param {string} text
   * @param {number} limit
   * @returns {string} prefix (the remainder stays in the buffer)
   */
  #cutAtSpace(text, limit) {
    const slice = text.slice(0, limit + 1);
    const cut = slice.lastIndexOf(' ');
    return cut > 0 ? text.slice(0, cut) : text.slice(0, limit);
  }

  /**
   * Finalize a sentence: trim, update rolling context.
   *
   * @param {string} text
   * @param {string} [segmentId]
   * @returns {Array<{text: string, segmentId: string}>}
   */
  #complete(text, segmentId) {
    const clean = text.trim();
    if (!clean) return [];
    this.context = keepRollingContext(`${this.context} ${clean}`.trim());
    return segmentId ? [{ text: clean, segmentId }] : [];
  }
}
