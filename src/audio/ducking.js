/**
 * Audio ducking — lower the original program audio while the translated
 * voice speaks, then restore it.
 *
 * WHY ramps instead of instant jumps: an instant gain change produces an
 * audible click; a 150 ms linear ramp sounds like a broadcast-engine duck.
 * Scheduled ramps are also sample-accurate on the audio thread.
 */
import { DUCKING } from '../lib/constants.js';

/**
 * Ramp a gain parameter to a target value.
 *
 * @param {GainNode} gainNode - node whose gain is automated
 * @param {number} target - final gain value
 * @param {number} rampMs - ramp duration in milliseconds
 * @returns {void}
 */
function rampGainTo(gainNode, target, rampMs) {
  const gain = gainNode.gain;
  const now = gainNode.context.currentTime;
  // Cancel any in-flight automation and anchor at the current value so the
  // new ramp starts from where the ear actually is.
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(gain.value, now);
  gain.linearRampToValueAtTime(target, now + rampMs / 1000);
}

/**
 * Duck the original audio (≈ -16 dB by default).
 *
 * @param {GainNode} duckGain - the ducking gain node
 * @param {{level?: number, rampMs?: number}} [options]
 * @returns {void}
 */
export function applyDuck(duckGain, { level = DUCKING.LEVEL, rampMs = DUCKING.RAMP_MS } = {}) {
  rampGainTo(duckGain, level, rampMs);
}

/**
 * Restore the original audio to full level.
 *
 * @param {GainNode} duckGain - the ducking gain node
 * @param {{rampMs?: number}} [options]
 * @returns {void}
 */
export function applyUnduck(duckGain, { rampMs = DUCKING.RAMP_MS } = {}) {
  rampGainTo(duckGain, 1, rampMs);
}
