/**
 * Silero VAD wrapper (via @ricky0123/vad-web).
 *
 * Drives MicVAD against the captured tab-audio stream. vad-web's `getStream`
 * option lets us feed a getDisplayMedia stream instead of the microphone;
 * `onSpeechEnd` hands us the exact audio (16 kHz Float32Array) that Whisper
 * expects, so no second resampling stage is needed on this path.
 *
 * All asset URLs point at our self-hosted /vendor files — after the first
 * app load the VAD works fully offline. If MicVAD fails to initialize, the
 * caller falls back to the energy VAD (energyVad.js).
 */
import { MicVAD } from '@ricky0123/vad-web';
import { VAD } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('vad');

/**
 * @typedef {Object} VadHandle
 * @property {() => void} stop - destroy the VAD
 * @property {() => void} splitCurrentSpeech - force-close the current speech
 *   segment (used by the max-segment-length splitter)
 * @property {'silero'} engine
 */

/**
 * Start the Silero VAD on a live stream.
 *
 * @param {{audioContext: AudioContext, stream: MediaStream, onSegment: Function,
 *          onSpeechStart?: Function, onMisfire?: Function}} options
 * @returns {Promise<VadHandle>} handle with stop/split controls
 * @throws when the VAD (model or WASM) fails to initialize
 */
export async function startSileroVad({
  audioContext,
  stream,
  onSegment,
  onSpeechStart,
  onMisfire,
}) {
  /** @type {{ts: number|null}} speech window start, shared with the callbacks */
  const speechStart = { ts: null };

  const base = `${import.meta.env.BASE_URL}vendor/`;
  const vad = await MicVAD.new({
    model: VAD.MODEL,
    // Self-hosted worklet bundle + Silero .onnx + ORT WASM (see copy-assets).
    baseAssetPath: `${base}vad/`,
    onnxWASMBasePath: `${base}ort/`,
    // Reuse our AudioContext (MicVAD will not close it on destroy).
    audioContext,
    getStream: async () => stream,
    // The stream is managed by our own graph — nothing to pause/resume.
    pauseStream: async () => {},
    resumeStream: async (s) => s,
    startOnLoad: true,
    // Tunables (see constants.js): 0.5/0.35 avoids music false-positives,
    // short redemption keeps segment latency low.
    positiveSpeechThreshold: VAD.POSITIVE_SPEECH_THRESHOLD,
    negativeSpeechThreshold: VAD.NEGATIVE_SPEECH_THRESHOLD,
    redemptionMs: VAD.REDEMPTION_MS,
    preSpeechPadMs: VAD.PRE_SPEECH_PAD_MS,
    minSpeechMs: VAD.MIN_SPEECH_MS,
    // pause() flushes the current segment — required for long-speech splits.
    submitUserSpeechOnPause: true,
    onSpeechStart: () => {
      speechStart.ts = Date.now();
      onSpeechStart?.();
    },
    onSpeechEnd: (audio) => {
      const startedAt = speechStart.ts ?? Date.now();
      speechStart.ts = null;
      onSegment({
        audio,
        startedAt,
        endedAt: Date.now(),
        engine: 'silero',
      });
    },
    onVADMisfire: () => onMisfire?.(),
  });

  log.info('Silero VAD started (self-hosted assets)');

  return {
    engine: 'silero',
    /** Timestamp (ms epoch) of the current speech window start, or null. */
    get speechStartedAt() {
      return speechStart.ts;
    },
    stop() {
      try {
        vad.destroy();
      } catch (error) {
        log.warn(`vad destroy failed: ${error.message}`);
      }
    },
    /**
     * Force-close the current speech segment: pause() flushes it (because
     * submitUserSpeechOnPause is true), resume() re-arms the detector. Both
     * are async internally but safe to fire-and-forget here.
     */
    splitCurrentSpeech() {
      if (speechStart.ts === null) return;
      vad.pause();
      vad.resume();
    },
  };
}
