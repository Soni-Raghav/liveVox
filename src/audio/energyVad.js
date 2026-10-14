/**
 * Energy-based fallback VAD.
 *
 * WHY a fallback: the Silero VAD depends on onnxruntime-web WASM booting
 * correctly on the main thread. In hardened browsers or if the self-hosted
 * assets are missing we still want speech segmentation — a plain RMS
 * threshold with hysteresis is cruder (music will trigger it) but keeps the
 * pipeline alive. The orchestrator only feeds frames here when Silero
 * failed to start.
 *
 * Consumes the resample worklet's 100 ms frames and reconstructs segments
 * from the shared FrameBuffer.
 */
import { VAD } from '../lib/constants.js';
import { rmsToDbfs } from './capture.js';

/**
 * @typedef {Object} EnergyVadHandle
 * @property {(samples: Float32Array, ts: number) => void} pushFrame
 * @property {() => void} splitCurrentSpeech
 * @property {'energy'} engine
 */

/**
 * Create the energy VAD state machine.
 *
 * @param {{onSegment: Function, slice: (fromTs: number, toTs: number) => Float32Array}} options
 * @returns {EnergyVadHandle} handle to feed frames into
 */
export function createEnergyVad({ onSegment, slice }) {
  const threshold = VAD.ENERGY_DBFS_THRESHOLD;
  let speaking = false;
  let startedAt = 0;
  let lastAboveThreshold = 0;
  let silenceStart = 0;

  /**
   * Feed one 100 ms frame; may emit a segment.
   *
   * @param {Float32Array} samples - 16 kHz mono frame
   * @param {number} ts - frame timestamp (ms epoch)
   */
  function pushFrame(samples, ts) {
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const dbfs = rmsToDbfs(Math.sqrt(sum / samples.length));
    const loud = dbfs > threshold;

    if (speaking) {
      if (loud) {
        lastAboveThreshold = ts;
      } else if (silenceStart === 0) {
        silenceStart = ts;
      } else if (ts - silenceStart >= VAD.MIN_SILENCE_MS) {
        // Close the segment after the hysteresis window.
        const endedAt = lastAboveThreshold;
        speaking = false;
        silenceStart = 0;
        onSegment({
          audio: slice(startedAt, endedAt),
          startedAt,
          endedAt,
          engine: 'energy',
        });
      }
    } else if (loud) {
      speaking = true;
      startedAt = ts;
      lastAboveThreshold = ts;
      silenceStart = 0;
    }
  }

  return {
    engine: 'energy',
    /** Timestamp (ms epoch) of the current speech window start, or null. */
    get speechStartedAt() {
      return speaking ? startedAt : null;
    },
    pushFrame,
    /** Force-close the current speech window (max segment length). */
    splitCurrentSpeech() {
      if (!speaking) return;
      const endedAt = lastAboveThreshold;
      speaking = false;
      silenceStart = 0;
      onSegment({ audio: slice(startedAt, endedAt), startedAt, endedAt, engine: 'energy' });
    },
  };
}
