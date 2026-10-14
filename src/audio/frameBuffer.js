/**
 * FrameBuffer — rolling buffer of 16 kHz frames with timestamps.
 *
 * WHY: when the Silero VAD is unavailable (e.g. its WASM files failed to
 * load), the energy-based fallback VAD needs to reconstruct the speech
 * segment audio from the resampler's frame stream. Frames are kept for a
 * bounded time (AUDIO.BUFFER_SECONDS) so memory cannot grow unbounded.
 * Pure data structure — fully unit-testable without a browser.
 */
import { AUDIO } from '../lib/constants.js';

export class FrameBuffer {
  /**
   * @param {number} [maxSeconds=AUDIO.BUFFER_SECONDS] - rolling window size
   */
  constructor(maxSeconds = AUDIO.BUFFER_SECONDS) {
    /** @type {Array<{ts: number, samples: Float32Array}>} */
    this.frames = [];
    this.maxSamples = maxSeconds * AUDIO.TARGET_SAMPLE_RATE;
    this.totalSamples = 0;
  }

  /**
   * Append a frame.
   *
   * @param {Float32Array} samples - 16 kHz mono frame
   * @param {number} ts - timestamp (ms epoch) of frame emission
   */
  push(samples, ts) {
    this.frames.push({ ts, samples });
    this.totalSamples += samples.length;
    // Drop oldest frames until we are back within the window.
    while (this.totalSamples > this.maxSamples && this.frames.length > 1) {
      this.totalSamples -= this.frames[0].samples.length;
      this.frames.shift();
    }
  }

  /**
   * Concatenate all samples between two timestamps.
   *
   * @param {number} fromTs - start timestamp (ms epoch, inclusive)
   * @param {number} toTs - end timestamp (ms epoch, exclusive)
   * @returns {Float32Array} contiguous audio in [ -1, 1 ]
   */
  slice(fromTs, toTs) {
    const parts = this.frames.filter((f) => f.ts >= fromTs && f.ts < toTs);
    const length = parts.reduce((n, f) => n + f.samples.length, 0);
    const out = new Float32Array(length);
    let offset = 0;
    for (const part of parts) {
      out.set(part.samples, offset);
      offset += part.samples.length;
    }
    return out;
  }

  /** Drop all buffered frames. */
  clear() {
    this.frames = [];
    this.totalSamples = 0;
  }
}
