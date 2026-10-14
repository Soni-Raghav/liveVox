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
import { AUDIO, ASR, NORMALIZER, VAD } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';
import { buildAudioGraph } from '../audio/capture.js';
import { FrameBuffer } from '../audio/frameBuffer.js';
import { startSileroVad } from '../audio/vad.js';
import { createEnergyVad } from '../audio/energyVad.js';
import { applyDuck, applyUnduck } from '../audio/ducking.js';
import { TtsManager } from '../audio/tts.js';
import { languageName } from '../lib/languages.js';
import { WorkerClient } from '../lib/workerClient.js';
import { detectLanguageFromText } from '../lib/languages.js';
import { fixPunctuation, SentenceMerger, stripDisfluencies } from './normalizer.js';
import { TTS as TTS_CONSTANTS, SYNC } from '../lib/constants.js';
import { BoundedQueue } from './queue.js';
import { SyncEngine } from './syncEngine.js';
// ?url: Vite emits the worklet as a raw asset — AudioWorklet.addModule loads it
// (worklets must be self-contained single files, and this one is).
import resampleWorkletURL from '../audio/resample.worklet.js?url';
// ?worker: Vite bundles these into self-contained module worker chunks with
// resolved imports. A plain new URL() asset copy would keep bare specifiers
// like "@huggingface/transformers" and crash the worker at startup.
import AsrWorker from '../workers/asr.worker.js?worker';
import TranslateWorker from '../workers/translate.worker.js?worker';

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
 * @property {() => Array<{source: string, target: string}>} [getGlossary]
 * @property {(segmentId: string) => number} [getSegmentStartedAt]
 * @property {(latencyMs: number) => void} [onLatency]
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
    /** Whether the NLLB pipeline is loaded in the translate worker. */
    this.nllbReady = false;
    /** Sentence merger state (normalized fragments → sentences). */
    this.merger = new SentenceMerger();
    /** Translated text accumulated per segment id (sentence appends). */
    this.translations = new Map();
    /** Warned about missing TTS voices for these languages (once each). */
    this.noVoiceWarned = new Set();

    // Sync engine: stage timestamps, smoothed latency, drift control.
    this.sync = new SyncEngine();
    // TTS rate multiplier while over the drift budget (reset each tick).
    this.currentDriftBoost = 1;
    // Bounded ASR queue: a slow Whisper must never let segments pile up —
    // the oldest work is sacrificed when the budget is blown (spec §3.9).
    this.asrQueue = new BoundedQueue(SYNC.MAX_ASR_QUEUE, {
      onDrop: (job) => {
        this.callbacks.updateSegment(job.id, { state: 'dropped' });
        log.warn(`ASR queue overflow — dropped segment (age ${Date.now() - job.startedAt} ms)`);
      },
    });
    this.asrBusy = false;
    this.busyCount = 0;

    // TTS: utterance queue + ducking trigger. Voice selection, rate fitting
    // and volume are pulled from settings at dispatch time.
    this.tts = new TtsManager({
      onSpeakingChange: (speaking) => this.#setDucking(speaking),
      onNoVoice: (lang) => this.#warnNoVoice(lang),
    });

    // The ASR worker lives for the whole app lifetime: models stay warm
    // across sessions so restarting the translation is instant.
    this.asrClient = new WorkerClient(AsrWorker, {
      name: 'asr',
      onCrash: () =>
        this.callbacks.onError('Speech recognition worker crashed. Reload the page.', null),
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

    // Translation worker: NLLB / Chrome Translator / MyMemory chain.
    this.translateClient = new WorkerClient(TranslateWorker, {
      name: 'translate',
      onCrash: () => this.callbacks.onError('Translation worker crashed. Reload the page.', null),
    });
    this.translateClient.onNotify(({ kind, payload }) => {
      if (kind === 'progress' && payload.total > 0) {
        this.callbacks.onModelEvent('nllb', {
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
   * Ensure the ASR (and NLLB) models for the current settings are loaded
   * (idempotent). ASR failure is fatal for a session; NLLB failure is not —
   * the translation chain falls back to Chrome Translator / MyMemory.
   * Exposed so the ModelManager can trigger downloads before a session.
   *
   * @param {{asrMode?: string, loadNllb?: boolean}} [overrides]
   * @returns {Promise<{modelId: string, device: string}>}
   */
  async ensureModels(overrides = {}) {
    const settings = this.callbacks.getSettings();
    const mode = overrides.asrMode ?? settings.asrMode;
    const loadNllb = overrides.loadNllb ?? settings.translationEngine !== 'chrome';
    const modelId = ASR.MODELS[mode] ?? ASR.MODELS[ASR.DEFAULT_MODE];

    // Download ASR and NLLB in parallel — cuts first-run wait time.
    const asrPromise =
      this.asrLoaded?.modelId === modelId
        ? Promise.resolve(this.asrLoaded)
        : this.#loadAsr(modelId);
    const nllbPromise = this.nllbReady
      ? Promise.resolve()
      : loadNllb
        ? this.#loadNllb()
        : Promise.resolve();

    await Promise.allSettled([asrPromise, nllbPromise]);
    return this.asrLoaded;
  }

  /**
   * @param {string} modelId
   * @returns {Promise<{modelId: string, device: string}>}
   */
  async #loadAsr(modelId) {
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
   * @returns {Promise<void>}
   */
  async #loadNllb() {
    this.callbacks.onModelEvent('nllb', { status: 'downloading', progress: 0 });
    try {
      await this.translateClient.send('load', { loadNllb: true });
      this.nllbReady = true;
      this.callbacks.onModelEvent('nllb', { status: 'ready', progress: 1 });
      log.info('NLLB ready');
    } catch (error) {
      // Non-fatal: Chrome Translator / MyMemory keep translation alive.
      this.callbacks.onModelEvent('nllb', { status: 'error', progress: 0 });
      log.warn(`NLLB load failed (translation falls back): ${error.message}`);
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
    this.merger.reset();
    this.translations.clear();
    this.asrQueue.clear();
    this.sync.reset();
    this.currentDriftBoost = 1;

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

  /** Stop the session: timers off, VAD down, TTS off, graph down. Workers stay warm. */
  stop() {
    if (!this.graph) return;
    this.#stopMeter();
    this.#stopSegmentSplitter();
    this.tts.cancelAll();
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
    // Flush any sentence still buffered before the session ends, so the
    // transcript does not silently lose the speaker's last words.
    this.#flushPendingSentence();
    this.merger.reset();
    this.sync.reset();
    this.callbacks.onLatency?.(null);
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
  // TTS + ducking
  // ---------------------------------------------------------------------------

  /**
   * Speak a translated sentence. Rate/voice/volume settings are read here
   * so mid-session setting changes apply to the next utterance.
   *
   * @param {{segmentId: string, text: string, sourceText: string}} options
   */
  #speakTranslated({ segmentId, text, sourceText }) {
    const settings = this.callbacks.getSettings();
    this.tts.volume = settings.translatedVolume;
    this.tts.baseRate = settings.ttsBaseRate;
    this.tts.voiceURI = settings.ttsVoiceURI;

    // Target duration = estimated spoken duration of the SOURCE sentence,
    // so the translated voice keeps the original's cadence.
    const sourceWords = sourceText.trim().split(/\s+/).filter(Boolean).length;
    const targetDurationMs = (sourceWords / TTS_CONSTANTS.WORDS_PER_SECOND_AT_1X) * 1000;

    this.tts.enqueue({
      id: segmentId,
      text,
      lang: settings.targetLang,
      // Cloud voices fail silently offline — restrict to local ones.
      localOnly: !navigator.onLine,
      targetDurationMs,
      driftBoost: this.currentDriftBoost ?? 1,
      onStart: () => {
        // End-to-end latency: capture (VAD start) → voice onset, smoothed
        // by the sync engine for the badge and recorded on the row.
        const raw = this.sync.ttsStarted(segmentId);
        if (raw !== null) {
          this.callbacks.updateSegment(segmentId, { latencyMs: raw, state: 'tts' });
          this.callbacks.onLatency?.(this.sync.ewmaLatencyMs);
        }
      },
    });
  }

  /**
   * Duck (or restore) the original audio while the translation speaks.
   *
   * @param {boolean} speaking - whether a translated utterance is active
   */
  #setDucking(speaking) {
    if (!this.graph) return;
    const settings = this.callbacks.getSettings();
    if (!settings.duckingEnabled) {
      applyUnduck(this.graph.duckGain);
      return;
    }
    if (speaking) applyDuck(this.graph.duckGain);
    else applyUnduck(this.graph.duckGain);
  }

  /**
   * Surface a missing-voice problem once per language (never spam).
   *
   * @param {string} lang - ISO code with no usable TTS voice
   */
  #warnNoVoice(lang) {
    if (this.noVoiceWarned.has(lang)) return;
    this.noVoiceWarned.add(lang);
    const offline = !navigator.onLine;
    this.callbacks.onError(
      `No ${languageName(lang)} voice is available${offline ? ' offline' : ''} on this system.`,
      offline
        ? 'Some voices are cloud-based. Install a local voice for this language in your OS settings, or reconnect.'
        : 'Install a voice for this language in your OS settings to hear the translation.'
    );
  }

  // ---------------------------------------------------------------------------
  // Speech segment → ASR (bounded queue) → normalize → merge → translate
  // ---------------------------------------------------------------------------

  /**
   * Handle one VAD speech segment: register it, enqueue for ASR and start
   * the single-flight drain. Backpressure lives in the queue, not here.
   *
   * @param {{audio: Float32Array, startedAt: number, endedAt: number, engine: string}} segment
   */
  #handleSegment({ audio, startedAt, endedAt }) {
    if (
      !this.graph ||
      !audio ||
      audio.length < (AUDIO.TARGET_SAMPLE_RATE * VAD.MIN_SPEECH_MS) / 1000
    ) {
      return; // sub-minimum blip
    }
    const id = crypto.randomUUID();
    this.sync.startSegment(id, startedAt);
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
    const enqueued = this.asrQueue.enqueue({ id, audio, startedAt, endedAt });
    if (!enqueued) {
      // Newest-policy rejection is not expected here, but stay consistent.
      this.callbacks.updateSegment(id, { state: 'dropped' });
    }
    this.#drainAsrQueue();
  }

  /**
   * Single-flight ASR processing: at most one Whisper call in flight; the
   * next queued job is picked up in the `finally` of the previous one, so
   * ordering is preserved and the queue absorbs bursts.
   */
  #drainAsrQueue() {
    if (this.asrBusy) return;
    const job = this.asrQueue.dequeue();
    if (!job) return;
    this.asrBusy = true;
    this.#beginBusy();
    this.#processAsrJob(job).finally(() => {
      this.asrBusy = false;
      this.#endBusy();
      this.#drainAsrQueue();
    });
  }

  /**
   * Transcribe, normalize and translate one segment.
   *
   * @param {{id: string, audio: Float32Array}} job
   */
  async #processAsrJob({ id, audio }) {
    const language = this.#resolveSourceLanguage();
    try {
      const result = await this.asrClient.send(
        'transcribe',
        { audio, language },
        // Transfer the buffer: zero-copy, and the VAD has no use for it.
        { transfer: [audio.buffer] }
      );
      this.sync.record(id, 'asr');
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
        state: 'normalize',
      });

      // Normalize → merge into sentences → translate (sequentially, in
      // order, so the transcript and TTS queue stay chronological).
      const normalized = fixPunctuation(stripDisfluencies(result.text));
      const sentences = this.merger.feed(normalized, id);
      for (const sentence of sentences) {
        await this.#translateSentence(sentence);
      }
      this.callbacks.updateSegment(id, { state: 'done' });
    } catch (error) {
      this.callbacks.updateSegment(id, { state: 'dropped' });
      log.error(`ASR failed for segment: ${error.message}`);
    }
  }

  /**
   * Translate one sentence through the translate worker and append the
   * result to the owning segment's translated text.
   *
   * @param {{text: string, segmentId: string}} sentence
   */
  async #translateSentence({ text, segmentId }) {
    const settings = this.callbacks.getSettings();
    const srcLang = this.#resolveSourceLanguage() ?? 'auto';
    const payload = {
      text,
      srcLang,
      tgtLang: settings.targetLang,
      engine: settings.translationEngine,
      glossary: this.callbacks.getGlossary?.() ?? [],
      // MyMemory is opt-in AND automatically disabled while offline.
      useMyMemory: settings.myMemoryOptIn && navigator.onLine,
    };
    try {
      const result = await this.translateClient.send('translate', payload);
      const previous = this.translations.get(segmentId) ?? '';
      const joined = previous ? `${previous} ${result.text}` : result.text;
      this.translations.set(segmentId, joined);
      this.callbacks.updateSegment(segmentId, {
        translatedText: joined,
        state: 'translate',
      });
      log.debug(`translated via ${result.engine}${result.cached ? ' (cached)' : ''}`);
      // Speak the translated sentence (ducking rides along via the TTS
      // manager's speaking-change events).
      this.#speakTranslated({
        segmentId,
        text: result.text,
        sourceText: text,
      });
    } catch (error) {
      // Translation failures keep the transcript usable (source-only row).
      log.error(`translation failed: ${error.message}`);
      this.callbacks.updateSegment(segmentId, { state: 'done' });
    }
  }

  /**
   * Flush a sentence that has been waiting in the merger across a long
   * pause (its translation lands on the most recent segment row).
   *
   * @param {string|null} [segmentId] - optional explicit attribution
   */
  #flushPendingSentence(segmentId = null) {
    if (!this.merger.pending) return;
    const lastSegmentId =
      segmentId ?? (this.translations.size > 0 ? [...this.translations.keys()].pop() : null);
    const sentences = this.merger.flushForPause(lastSegmentId);
    for (const sentence of sentences) {
      // Fire-and-forget: called from a timer, cannot await.
      this.#translateSentence(sentence).catch((error) =>
        log.error(`flush translation failed: ${error.message}`)
      );
    }
  }

  /**
   * Track in-flight work for the status chip ('listening' ↔ 'translating').
   */
  #beginBusy() {
    this.busyCount += 1;
    if (this.graph && this.busyCount === 1) this.callbacks.onStatus('translating');
  }

  #endBusy() {
    this.busyCount = Math.max(0, this.busyCount - 1);
    if (this.graph && this.busyCount === 0) this.callbacks.onStatus('listening');
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
   * Periodic housekeeping: split over-long speech windows, flush merger
   * sentences pending across a long pause, and run the drift controller.
   */
  #startSegmentSplitter() {
    this.splitTimer = setInterval(() => {
      const started = this.vad?.speechStartedAt;
      if (
        started !== null &&
        started !== undefined &&
        Date.now() - started >= AUDIO.MAX_SEGMENT_MS
      ) {
        this.vad.splitCurrentSpeech();
      }
      const idleMs = this.merger.lastFeedAt > 0 ? Date.now() - this.merger.lastFeedAt : 0;
      if (this.merger.pending && idleMs >= NORMALIZER.MAX_PAUSE_MS) {
        this.#flushPendingSentence();
      }
      this.#driftTick();
    }, SPLIT_CHECK_MS);
  }

  /**
   * Drift controller (spec §3.9): when lag exceeds the max drift budget,
   * drop the oldest queued segments, raise the TTS rate (≤ 1.3x) and flush
   * stale TTS jobs. Runs once per second while a session is active.
   */
  #driftTick() {
    if (!this.graph) return;
    this.sync.maxDriftMs = this.callbacks.getSettings().maxDriftMs;
    const pendingAges = this.asrQueue.toArray().map((job) => Date.now() - job.startedAt);
    const assessment = this.sync.assess({ pendingAges });
    if (assessment.dropCount > 0) {
      this.asrQueue.dropOldest(assessment.dropCount);
      log.warn(`drift control: dropped ${assessment.dropCount} stale segment(s)`);
    }
    this.currentDriftBoost = assessment.driftBoost;
    if (assessment.flushTts) {
      const flushed = this.tts.flushStale();
      if (flushed > 0) log.warn(`drift control: cancelled ${flushed} stale TTS job(s)`);
    }
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
