/**
 * LiveVox pipeline orchestrator (framework-agnostic).
 *
 * Wires the streaming pipeline for one capture session:
 *
 *   getDisplayMedia stream ──► audio graph (play-through + ducking + meter)
 *                        └──► resample worklet ──► frame buffer ──► energy VAD (fallback)
 *                        └──► Silero VAD (MicVAD)  ──► speech segments
 *                                │
 *                                ▼
 *                        ASR worker (Whisper)  ──► transcript segments (M2)
 *                        normalizer + translate worker (M3) + TTS (M4)
 *
 * The orchestrator never touches React or the store — it communicates
 * exclusively through constructor callbacks, which keeps it unit-testable
 * and lets `usePipeline` stay a thin adapter.
 */
import { AUDIO, ASR, VAD } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';
import { buildAudioGraph } from '../audio/capture.js';
import { FrameBuffer } from '../audio/frameBuffer.js';
import { startSileroVad } from '../audio/vad.js';
import { createEnergyVad } from '../audio/energyVad.js';
import { WorkerClient } from '../lib/workerClient.js';
import { detectLanguageFromText } from '../lib/languages.js';
// ?url: Vite emits the worklet as a raw asset — AudioWorklet.addModule loads it.
import resampleWorkletURL from '../audio/resample.worklet.js?url';

const log = createLogger('pipeline');

/** Minimal gain ramp for volume changes (avoids audible clicks). */
const VOLUME_RAMP_S = 0.02;
/** How often the max-segment splitter checks the current speech window. */
const SPLIT_CHECK_MS = 1000;

/**
 * @typedef {Object} PipelineCallbacks
 * @property {(status: string) => void} onStatus
 * @property {(message: string, hint?: string|null) => void} onError
 * @property {(level: number) => void} onLevel
 * @property {(segment: object) => void} addSegment
 * @property {(id: string, patch: object) => void} updateSegment
 * @property {(kind: 'asr'|'nllb'|'device', patch: object) => void} onModelEvent
 * @property {() => object} getSettings
 */

export class LiveVoxPipeline {
  /**
   * @param {PipelineCallbacks} callbacks
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    /** @type {ReturnType<typeof buildAudioGraph>|null} */
    this.graph = null;
    this.frameBuffer = new FrameBuffer();
    /** @type {{stop(): void, splitCurrentSpeech(): void, speechStartedAt: number|null}|null} */
    this.vad = null;
    this.energyVad = null;
    this.resamplerNode = null;
    this.meterTimer = null;
    this.splitTimer = null;
    /** Latched auto-detected source language (first speech segments). */
    this.detectedSource = null;
    /** Which ASR model is loaded in the worker. */
    this.asrLoaded = null;

    // The ASR worker lives for the whole app lifetime: models stay warm
    // across sessions so restarting the translation is instant.
    this.asrClient = new WorkerClient(new URL('../workers/asr.worker.js', import.meta.url), {
      name: 'asr',
      onCrash: () => this.callbacks.onError('Speech recognition worker crashed. Reload the page.', null),
    });
    this.asrClient.onNotify(({ kind, payload }) => {
      if (kind === 'progress' && payload.total > 0) {
        // Aggregate file progress as loaded/total bytes (0..1).
        this.callbacks.onModelEvent('asr', {
          status: 'downloading',
          progress: payload.loaded / payload.total,
        });
      }
    });
  }

  /** @returns {boolean} true while a capture session is active */
  get active() {
    return this.graph !== null;
  }

  /**
   * Ensure the ASR model for the current settings is loaded (idempotent).
   * Exposed so the ModelManager can trigger downloads before a session.
   *
   * @param {{asrMode?: string}} [overrides] - optional mode override
   * @returns {Promise<{modelId: string, device: string}>}
   */
  async ensureModels(overrides = {}) {
    const settings = this.callbacks.getSettings();
    const mode = overrides.asrMode ?? settings.asrMode;
    const modelId = ASR.MODELS[mode] ?? ASR.MODELS[ASR.DEFAULT_MODE];
    if (this.asrLoaded?.modelId === modelId) return this.asrLoaded;
    this.callbacks.onModelEvent('asr', { status: 'downloading', progress: 0, modelId });
    try {
      const result = await this.asrClient.send('load', { modelId, device: ASR.PREFERRED_DEVICE });
      this.asrLoaded = result;
      this.callbacks.onModelEvent('asr', { status: 'ready', progress: 1, modelId });
      this.callbacks.onModelEvent('device', result.device);
      log.info(`ASR ready: ${result.modelId} on ${result.device}`);
      return result;
    } catch (error) {
      this.callbacks.onModelEvent('asr', { status: 'error', progress: 0, modelId });
      throw error;
    }
  }

  /**
   * Start a session for an already-acquired stream.
   *
   * @param {MediaStream} stream
   * @returns {Promise<void>}
   */
  async start(stream) {
    if (this.graph) return; // idempotent: never double-build the graph
    const settings = this.callbacks.getSettings();
    this.graph = buildAudioGraph(stream, {
      initialVolume: settings.originalVolume,
      onStreamEnded: () => this.stop(),
    });
    this.detectedSource = null;
    this.frameBuffer.clear();

    // 1) ASR model must be ready before the first segment arrives.
    this.callbacks.onStatus('loading-models');
    try {
      await this.ensureModels();
    } catch (error) {
      this.graph.stop();
      this.graph = null;
      this.callbacks.onStatus('idle');
      this.callbacks.onError(
        'Could not load the speech recognition model.',
        'Check your internet connection for the one-time model download, then try again.'
      );
      log.error(`ASR model load failed: ${error.message}`);
      return;
    }

    // 2) Resample worklet: 16 kHz frames for the fallback VAD + buffer.
    const { audioContext, sourceNode } = this.graph;
    await audioContext.audioWorklet.addModule(resampleWorkletURL);
    this.resamplerNode = new AudioWorkletNode(audioContext, 'livevox-resampler');
    sourceNode.connect(this.resamplerNode);
    this.resamplerNode.port.onmessage = ({ data }) => {
      if (data.type !== 'frame') return;
      const ts = Date.now();
      this.frameBuffer.push(data.samples, ts);
      // Only fed when Silero failed — otherwise it would double-emit.
      this.energyVad?.pushFrame(data.samples, ts);
    };

    // 3) VAD: Silero preferred, energy fallback keeps the pipeline alive.
    try {
      this.vad = await startSileroVad({
        audioContext,
        stream,
        onSegment: (segment) => this.#handleSegment(segment),
      });
    } catch (error) {
      log.warn(`Silero VAD unavailable (${error.message}) — using energy fallback`);
      this.energyVad = createEnergyVad({
        onSegment: (segment) => this.#handleSegment(segment),
        slice: (from, to) => this.frameBuffer.slice(from, to),
      });
      this.vad = this.energyVad;
    }

    this.#startMeter();
    this.#startSegmentSplitter();
    this.callbacks.onStatus('listening');
    log.info('session started');
  }

  /** Stop the session: timers off, VAD down, graph down. Workers stay warm. */
  stop() {
    if (!this.graph) return;
    this.#stopMeter();
    this.#stopSegmentSplitter();
    this.vad?.stop();
    this.vad = null;
    this.energyVad = null;
    try {
      this.resamplerNode?.disconnect();
    } catch {
      // already disconnected
    }
    this.resamplerNode = null;
    this.frameBuffer.clear();
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

  // ---------------------------------------------------------------------------
  // Speech segment → ASR
  // ---------------------------------------------------------------------------

  /**
   * Handle one VAD speech segment: create a transcript entry and transcribe.
   *
   * @param {{audio: Float32Array, startedAt: number, endedAt: number, engine: string}} segment
   */
  async #handleSegment({ audio, startedAt, endedAt }) {
    if (!this.graph || !audio || audio.length < (AUDIO.TARGET_SAMPLE_RATE * VAD.MIN_SPEECH_MS) / 1000) {
      return; // sub-minimum blip
    }
    const id = crypto.randomUUID();
    this.callbacks.addSegment({
      id,
      startedAt,
      endedAt,
      sourceText: '',
      translatedText: '',
      partial: true,
      detectedLang: null,
      state: 'asr',
      latencyMs: null,
    });

    const language = this.#resolveSourceLanguage();
    try {
      const result = await this.asrClient.send(
        'transcribe',
        { audio, language },
        // Transfer the buffer: zero-copy, and the VAD has no use for it.
        { transfer: [audio.buffer] }
      );
      const detected = result.language ?? detectLanguageFromText(result.text)?.code ?? null;
      if (this.detectedSource === null && detected) {
        // Spec: auto language detection latches from the first segments.
        this.detectedSource = detected;
        log.info(`source language detected: ${detected}`);
      }
      this.callbacks.updateSegment(id, {
        sourceText: result.text,
        partial: false,
        detectedLang: detected,
        state: 'done',
      });
    } catch (error) {
      this.callbacks.updateSegment(id, { state: 'dropped' });
      log.error(`ASR failed for segment: ${error.message}`);
    }
  }

  /**
   * Which language to hand Whisper: explicit setting wins, then the latched
   * auto-detection, then null (Whisper's own detection head).
   *
   * @returns {string|null} ISO code or null
   */
  #resolveSourceLanguage() {
    const { sourceLang } = this.callbacks.getSettings();
    if (sourceLang && sourceLang !== 'auto') return sourceLang;
    return this.detectedSource ?? null;
  }

  /**
   * Split speech windows that exceed AUDIO.MAX_SEGMENT_MS so ASR latency
   * stays bounded on monologues (pause() flushes the segment, resume()
   * re-arms the detector).
   */
  #startSegmentSplitter() {
    this.splitTimer = setInterval(() => {
      const started = this.vad?.speechStartedAt;
      if (started === null || started === undefined) return;
      if (Date.now() - started >= AUDIO.MAX_SEGMENT_MS) {
        this.vad.splitCurrentSpeech();
      }
    }, SPLIT_CHECK_MS);
  }

  #stopSegmentSplitter() {
    if (this.splitTimer) {
      clearInterval(this.splitTimer);
      this.splitTimer = null;
    }
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
