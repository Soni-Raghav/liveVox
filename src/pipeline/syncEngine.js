/**
 * SyncEngine — end-to-end latency tracking and drift control.
 *
 * Responsibilities (spec §8 / §3.9):
 * - Record per-segment stage timestamps: capture → ASR → translate → TTS.
 * - Maintain an exponentially-smoothed live latency value for the badge.
 * - Assess drift once per tick: when lag exceeds the max drift budget
 *   (default 4 s) recommend dropping the oldest queued segments and
 *   raising the TTS rate (up to SYNC.RATE_BOOST_MAX = 1.3x).
 *
 * The clock is injectable so tests are deterministic.
 */
import { SYNC } from '../lib/constants.js';

export class SyncEngine {
  /**
   * @param {{maxDriftMs?: number, rateBoostMax?: number, emaAlpha?: number,
   *          now?: () => number}} [options]
   */
  constructor(options = {}) {
    this.maxDriftMs = options.maxDriftMs ?? SYNC.MAX_DRIFT_MS;
    this.rateBoostMax = options.rateBoostMax ?? SYNC.RATE_BOOST_MAX;
    this.emaAlpha = options.emaAlpha ?? SYNC.LATENCY_EMA_ALPHA;
    this.now = options.now ?? Date.now;
    /** @type {Map<string, {captureTs: number, stages: Object<string, number>}>} */
    this.segments = new Map();
    /** @type {number|null} */
    this.ewmaLatencyMs = null;
  }

  /**
   * Start tracking a segment at capture (VAD speech start) time.
   *
   * @param {string} id - segment id
   * @param {number} captureTs - ms epoch
   */
  startSegment(id, captureTs) {
    this.segments.set(id, { captureTs, stages: {} });
    // Bound the tracking map (long sessions).
    if (this.segments.size > 200) {
      this.segments.delete(this.segments.keys().next().value);
    }
  }

  /**
   * Record a stage timestamp for a segment.
   *
   * @param {string} id - segment id
   * @param {'asr'|'translate'|'tts'} stage - pipeline stage
   */
  record(id, stage) {
    const segment = this.segments.get(id);
    if (!segment) return;
    segment.stages[stage] = this.now();
  }

  /**
   * Mark TTS onset: update the smoothed latency and return the raw value.
   *
   * @param {string} id - segment id
   * @returns {number|null} raw capture→voice latency in ms (null if unknown)
   */
  ttsStarted(id) {
    const segment = this.segments.get(id);
    if (!segment) return null;
    this.record(id, 'tts');
    const latency = this.now() - segment.captureTs;
    this.ewmaLatencyMs =
      this.ewmaLatencyMs === null
        ? latency
        : this.ewmaLatencyMs * (1 - this.emaAlpha) + latency * this.emaAlpha;
    return latency;
  }

  /**
   * Latency of a finished segment (for the transcript row).
   *
   * @param {string} id
   * @returns {number|null} ms, or null when the segment is unknown
   */
  segmentLatency(id) {
    const segment = this.segments.get(id);
    if (!segment?.stages.tts) return null;
    return segment.stages.tts - segment.captureTs;
  }

  /**
   * Assess current drift and recommend corrective action.
   *
   * @param {{pendingAges: number[]}} input - ages (ms) of queued work
   * @returns {{dropCount: number, driftBoost: number, flushTts: boolean}}
   */
  assess({ pendingAges }) {
    const oldestPending = pendingAges.length > 0 ? Math.max(...pendingAges) : 0;
    const lag = Math.max(this.ewmaLatencyMs ?? 0, oldestPending);
    const excess = lag - this.maxDriftMs;
    return {
      // Segments whose queue age already blew the budget get dropped.
      dropCount: pendingAges.filter((age) => age > this.maxDriftMs).length,
      // Gentle boost: +0.5x of the relative excess, capped at 1.3x.
      driftBoost:
        excess <= 0 ? 1 : Math.min(this.rateBoostMax, 1 + (excess / this.maxDriftMs) * 0.5),
      flushTts: excess > 0,
    };
  }

  /** Reset all tracking (new session). */
  reset() {
    this.segments.clear();
    this.ewmaLatencyMs = null;
  }
}
