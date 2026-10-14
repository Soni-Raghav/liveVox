/**
 * LiveVox pipeline orchestrator (framework-agnostic).
 *
 * Owns the audio graph and, milestone by milestone, the streaming pipeline:
 *   capture → resample (AudioWorklet) → VAD → ASR worker → normalizer →
 *   translate worker → TTS → ducking, governed by the sync engine.
 *
 * The orchestrator never touches React or the store — it communicates
 * exclusively through the callbacks passed to the constructor, which keeps
 * it unit-testable and lets `usePipeline` be a thin adapter.
 */
import { AUDIO } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';
import { buildAudioGraph } from '../audio/capture.js';

const log = createLogger('pipeline');

/**
 * @typedef {Object} PipelineCallbacks
 * @property {(status: string) => void} onStatus
 * @property {(message: string, hint?: string|null) => void} onError
 * @property {(level: number) => void} onLevel
 * @property {() => object} getSettings
 */

/** Minimal gain ramp time for volume changes (avoids audible clicks). */
const VOLUME_RAMP_S = 0.02;

export class LiveVoxPipeline {
  /**
   * @param {PipelineCallbacks} callbacks
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    /** @type {ReturnType<typeof buildAudioGraph>|null} */
    this.graph = null;
    this.meterTimer = null;
  }

  /** @returns {boolean} true while a capture session is active */
  get active() {
    return this.graph !== null;
  }

  /**
   * Start a session for an already-acquired stream.
   *
   * @param {MediaStream} stream
   * @returns {Promise<void>}
   */
  async start(stream) {
    if (this.graph) return; // idempotent: never double-build the graph
    const { originalVolume } = this.callbacks.getSettings();
    this.graph = buildAudioGraph(stream, {
      initialVolume: originalVolume,
      onStreamEnded: () => this.stop(),
    });
    this.#startMeter();
    this.callbacks.onStatus('listening');
    log.info('session started');
  }

  /** Stop the session: meter off, graph down, status back to idle. */
  stop() {
    if (!this.graph) return;
    this.#stopMeter();
    this.graph.stop();
    this.graph = null;
    this.callbacks.onStatus('idle');
    this.callbacks.onLevel(0);
    log.info('session stopped');
  }

  /**
   * Set the user-facing "original audio" volume with a short ramp.
   *
   * @param {number} volume 0..1
   */
  setOriginalVolume(volume) {
    if (!this.graph) return;
    const { volumeGain, audioContext } = this.graph;
    volumeGain.gain.setTargetAtTime(volume, audioContext.currentTime, VOLUME_RAMP_S);
  }

  /** Poll the analyser and push smoothed levels to the UI. */
  #startMeter() {
    this.#stopMeter();
    this.meterTimer = setInterval(() => {
      if (!this.graph) return;
      this.callbacks.onLevel(this.graph.getLevel());
    }, AUDIO.METER_POLL_MS);
  }

  #stopMeter() {
    if (this.meterTimer) {
      clearInterval(this.meterTimer);
      this.meterTimer = null;
    }
  }
}
