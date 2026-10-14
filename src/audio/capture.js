/**
 * Tab-audio capture and the playback audio graph.
 *
 * WHY this shape: getDisplayMedia({video:true, audio:{...}}) is the only
 * browser API that can tap another tab's audio. The video track is stopped
 * immediately (we never need it) and the audio track is routed through:
 *
 *   MediaStreamSource → volumeGain (user slider) → duckGain (auto ducking)
 *                     → AudioContext.destination (user hears the original)
 *   MediaStreamSource → analyser (level meter, pre-duck)
 *
 * All capture-related *tunables* live in src/lib/constants.js.
 */
import { AUDIO } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('capture');

/** Machine-readable capture failure codes. */
export const CaptureErrorCode = {
  NO_AUDIO_TRACK: 'NO_AUDIO_TRACK',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  UNSUPPORTED: 'UNSUPPORTED',
};

/** User-facing guidance for every failure code. */
export const CAPTURE_ERROR_HINTS = {
  [CaptureErrorCode.NO_AUDIO_TRACK]:
    'No audio was shared. Click Start again, choose the tab playing the video, and tick the "Share tab audio" checkbox at the bottom of the picker.',
  [CaptureErrorCode.PERMISSION_DENIED]:
    'Screen/tab sharing was denied. Click Start again and allow the permission when Chrome asks for it.',
  [CaptureErrorCode.UNSUPPORTED]:
    'This browser cannot capture tab audio. Use Chrome or Edge on desktop (Firefox/Safari have limited tab-audio capture).',
};

/**
 * Error thrown by the capture layer, carrying a code + user-facing hint.
 */
export class CaptureError extends Error {
  /**
   * @param {string} code - one of {@link CaptureErrorCode}
   * @param {string} [message] - developer message (defaults to the code)
   */
  constructor(code, message) {
    super(message ?? code);
    this.name = 'CaptureError';
    this.code = code;
    this.hint = CAPTURE_ERROR_HINTS[code] ?? null;
  }
}

/**
 * Request a display-capture stream containing audio (the video track is
 * stopped right away — only audio matters to LiveVox).
 *
 * @returns {Promise<MediaStream>} stream with at least one audio track
 * @throws {CaptureError} on unsupported browser, denied permission or
 *   sharing without audio
 */
export async function requestTabAudioStream() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new CaptureError(CaptureErrorCode.UNSUPPORTED);
  }
  let stream;
  try {
    // suppressLocalAudioPlayback: the shared tab is muted locally so audio is
    // heard exactly once — through LiveVox's own graph, where we can duck it.
    // All audio "enhancements" are disabled: ASR wants the raw signal.
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        suppressLocalAudioPlayback: true,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      throw new CaptureError(CaptureErrorCode.PERMISSION_DENIED, error.message);
    }
    throw error;
  }

  const audioTracks = stream.getAudioTracks();
  if (audioTracks.length === 0) {
    // The user shared without ticking "Share tab audio" — nothing we can use.
    stream.getTracks().forEach((t) => t.stop());
    throw new CaptureError(
      CaptureErrorCode.NO_AUDIO_TRACK,
      'getDisplayMedia returned no audio track'
    );
  }

  // We never display anything: stop the video track to release the preview.
  stream.getVideoTracks().forEach((t) => t.stop());
  log.info(`tab audio track acquired (${stream.id})`);
  return stream;
}

/**
 * RMS → dBFS conversion (level math shared with tests).
 *
 * @param {number} rms - root-mean-square of samples in [-1, 1]
 * @returns {number} dBFS value (0 = full scale)
 */
export function rmsToDbfs(rms) {
  return 20 * Math.log10(rms + 1e-9);
}

/**
 * Map a dBFS value onto a 0..1 meter scale between floorDb and 0.
 *
 * @param {number} dbfs - dBFS value from {@link rmsToDbfs}
 * @param {number} [floorDb=-60] - level mapped to 0 on the meter
 * @returns {number} normalized 0..1 (clamped)
 */
export function dbfsToNormalized(dbfs, floorDb = -60) {
  const span = 0 - floorDb;
  return Math.min(1, Math.max(0, (dbfs - floorDb) / span));
}

/**
 * Build the playback/metering graph for a captured stream.
 *
 * @param {MediaStream} stream - stream from {@link requestTabAudioStream}
 * @param {{initialVolume?: number, onStreamEnded?: Function}} [options]
 * @returns {AudioGraph} live graph handle
 */
export function buildAudioGraph(stream, options = {}) {
  const audioContext = new AudioContext({ latencyHint: 'interactive' });
  // Browsers can suspend contexts created outside a user gesture — the
  // Start button IS the gesture, but resume defensively anyway.
  if (audioContext.state === 'suspended') audioContext.resume();

  const sourceNode = audioContext.createMediaStreamSource(stream);
  const volumeGain = audioContext.createGain(); // user "original volume" slider
  volumeGain.gain.value = options.initialVolume ?? 1;
  const duckGain = audioContext.createGain(); // automated by ducking.js
  duckGain.gain.value = 1;
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;

  sourceNode.connect(volumeGain);
  volumeGain.connect(duckGain);
  duckGain.connect(audioContext.destination);
  sourceNode.connect(analyser); // meter BEFORE ducking = input level

  const meterBuffer = new Uint8Array(analyser.fftSize);
  let smoothing = AUDIO.METER_SMOOTHING;

  /** @typedef {{audioContext: AudioContext, sourceNode: AudioNode, volumeGain: GainNode, duckGain: GainNode, analyser: AnalyserNode, getLevel: Function, stop: Function}} AudioGraph */
  const graph = {
    audioContext,
    sourceNode,
    volumeGain,
    duckGain,
    analyser,

    /**
     * Current input level (0..1), RMS-based with light EMA smoothing.
     *
     * @returns {number} smoothed normalized level
     */
    getLevel() {
      analyser.getByteTimeDomainData(meterBuffer);
      let sum = 0;
      for (let i = 0; i < meterBuffer.length; i += 1) {
        const v = (meterBuffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / meterBuffer.length);
      const level = dbfsToNormalized(rmsToDbfs(rms));
      smoothing = smoothing * AUDIO.METER_SMOOTHING + level * (1 - AUDIO.METER_SMOOTHING);
      return smoothing;
    },

    /** Tear the graph down and close the context. */
    stop() {
      try {
        sourceNode.disconnect();
        volumeGain.disconnect();
        duckGain.disconnect();
        analyser.disconnect();
      } catch {
        // disconnect() throws if a node was already unlinked — harmless.
      }
      stream.getTracks().forEach((t) => t.stop());
      audioContext.close();
      log.info('audio graph stopped');
    },
  };

  // The user can end sharing from Chrome's own "Stop sharing" bar — surface
  // it so the pipeline can shut down cleanly instead of running on silence.
  stream.getAudioTracks().forEach((track) =>
    track.addEventListener('ended', () => options.onStreamEnded?.())
  );

  return graph;
}
