/**
 * Central tuning constants for the LiveVox pipeline.
 *
 * WHY: every "magic number" in the app lives here so behaviour can be tuned
 * in one place. Each entry documents its purpose and the value's effect on
 * latency / quality trade-offs. Modules must import from here instead of
 * inlining numbers.
 */

export const APP_NAME = 'LiveVox';
export const APP_VERSION = '1.0.0';

/** localStorage / Cache Storage keys (prefix avoids collisions). */
export const STORAGE_KEYS = {
  PREFERENCES: 'livevox:preferences',
  TRANSFORMERS_CACHE: 'transformers-cache',
  COI_RELOADED: 'livevox:coi-reloaded',
};

/**
 * Audio capture + preprocessing.
 * FRAME_MS=100 keeps the analysis path responsive without flooding the
 * worklet message channel (10 messages/s).
 */
export const AUDIO = {
  TARGET_SAMPLE_RATE: 16000,
  FRAME_MS: 100,
  FRAME_SAMPLES: 1600, // 16 kHz * 100 ms
  METER_POLL_MS: 100,
  METER_SMOOTHING: 0.65, // EMA factor for the level meter (higher = smoother)
  MAX_SEGMENT_MS: 28000, // cap segments below Whisper's 30 s window
  BUFFER_SECONDS: 35, // rolling 16 kHz frame buffer (max segment + margin)
};

/** Voice activity detection (Silero via @ricky0123/vad-web, energy fallback). */
export const VAD = {
  MODEL: 'v5',
  POSITIVE_SPEECH_THRESHOLD: 0.5,
  NEGATIVE_SPEECH_THRESHOLD: 0.35,
  REDEMPTION_MS: 600, // silence before a segment is closed (lower = snappier ASR)
  PRE_SPEECH_PAD_MS: 300, // lead-in kept before detected speech onset
  MIN_SPEECH_MS: 250, // discard shorter blips as noise (VAD "misfires")
  ENERGY_DBFS_THRESHOLD: -42, // fallback VAD trigger level (dBFS)
  MIN_SILENCE_MS: 500, // fallback VAD hysteresis
};

/** Automatic speech recognition (Whisper via Transformers.js). */
export const ASR = {
  MODELS: { fast: 'Xenova/whisper-tiny', quality: 'Xenova/whisper-base' },
  DEFAULT_MODE: 'fast',
  DTYPE: 'q8',
  CHUNK_LENGTH_S: 30,
  STRIDE_LENGTH_S: 5,
  CONTEXT_TOKENS: 512, // rolling transcript context (approx. tokens)
  PREFERRED_DEVICE: 'webgpu',
  APPROX_MODEL_MB: { fast: 45, quality: 80 },
};

/** Translation (NLLB-200 distilled + fallbacks). */
export const TRANSLATION = {
  NLLB_MODEL: 'Xenova/nllb-200-distilled-600M',
  NLLB_DTYPE: 'q8',
  APPROX_NLLB_MB: 600,
  CACHE_MAX_ENTRIES: 500,
  MYMEMORY: {
    URL: 'https://api.mymemory.translated.net/get',
    MAX_QUERY_BYTES: 480, // service rejects long queries (~500 B limit)
    MIN_INTERVAL_MS: 1200, // conservative pacing for the anonymous tier
    TIMEOUT_MS: 8000,
  },
};

/** Text-to-speech + audio ducking. */
export const TTS = {
  RATE_MIN: 0.8,
  RATE_MAX: 1.5,
  WORDS_PER_SECOND_AT_1X: 2.6, // rough estimate used to fit segment duration
  QUEUE_MAX: 8,
  STALE_MS: 9000, // pending utterances older than this are cancelled
};

/** Ducking: original audio is lowered while the translation speaks. */
export const DUCKING = {
  LEVEL: 0.15, // ≈ -16 dB
  RAMP_MS: 150,
};

/** Sync engine + backpressure limits. */
export const SYNC = {
  MAX_DRIFT_MS: 4000, // default user-adjustable "max drift"
  RATE_BOOST_MAX: 1.3, // TTS rate ceiling under drift
  LATENCY_EMA_ALPHA: 0.25, // smoothing for the latency badge
  MAX_ASR_QUEUE: 4,
  MAX_TTS_QUEUE: 8,
};

/** Sentence-level merging of ASR fragments. */
export const NORMALIZER = {
  MAX_SENTENCE_CHARS: 220, // force-flush a sentence at this length
  MAX_PAUSE_MS: 2500, // silence gap that flushes the merge buffer
};

/** First-run defaults (zero-config UX). */
export const DEFAULTS = {
  TARGET_LANG:
    typeof navigator !== 'undefined' && navigator.language ? navigator.language.slice(0, 2) : 'en',
  SOURCE_LANG: 'auto',
  MODE: ASR.DEFAULT_MODE,
  ORIGINAL_VOLUME: 1,
  TRANSLATED_VOLUME: 1,
  DUCKING_ENABLED: true,
};

/** UI limits. */
export const UI = {
  TRANSCRIPT_MAX_SEGMENTS: 500, // cap the in-memory transcript history
  LATENCY_GOOD_MS: 3000, // badge turns amber above this
  LATENCY_BAD_MS: 5000, // ...and red above this
};

/** Service-worker update prompt + offline toasts. */
export const PWA = {
  UPDATE_RELOAD_FALLBACK_MS: 2000, // safety-net reload if the waiting worker stalls
  OFFLINE_READY_TOAST_MS: 6000, // "ready for offline" toast duration
};
