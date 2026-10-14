/**
 * LiveVox global Zustand store.
 *
 * Slices:
 * - `session`    runtime pipeline state (status, error, level, latency)
 * - `transcripts` the live transcript segments (see {@link TranscriptSegment})
 * - `models`     download state of the on-device ASR / NLLB models
 * - `settings`   user preferences — PERSISTED to localStorage
 * - `glossary`   custom term mappings — PERSISTED
 *
 * Only `settings` and `glossary` survive reloads: transcripts are ephemeral
 * by design ("audio never leaves your device", nothing is stored on disk).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULTS, SYNC, UI, VAD } from '../lib/constants.js';

/**
 * @typedef {Object} TranscriptSegment
 * @property {string} id
 * @property {number} startedAt  - VAD speech start (ms epoch)
 * @property {number} endedAt    - VAD speech end (ms epoch)
 * @property {string} sourceText
 * @property {string} translatedText
 * @property {boolean} partial   - true while the segment is still evolving
 * @property {string|null} detectedLang - ISO code detected by ASR/text heuristics
 * @property {'vad'|'asr'|'normalize'|'translate'|'tts'|'done'|'dropped'} state
 * @property {number|null} latencyMs - capture → TTS start when spoken
 */

/**
 * @typedef {Object} ModelEntry
 * @property {'idle'|'downloading'|'ready'|'error'} status
 * @property {number} progress - 0..1 aggregated file progress
 * @property {string|null} modelId
 */

const initialSettings = {
  sourceLang: DEFAULTS.SOURCE_LANG,
  targetLang: DEFAULTS.TARGET_LANG,
  asrMode: DEFAULTS.MODE, // 'fast' | 'quality' (whisper-tiny vs whisper-base)
  translationEngine: 'auto', // 'auto' | 'nllb' | 'chrome'
  ttsVoiceURI: null, // null = pick best voice for the target language
  ttsBaseRate: 1,
  maxDriftMs: SYNC.MAX_DRIFT_MS,
  theme: 'dark',
  myMemoryOptIn: false, // online-only fallback, OFF by default (privacy)
  originalVolume: DEFAULTS.ORIGINAL_VOLUME,
  translatedVolume: DEFAULTS.TRANSLATED_VOLUME,
  duckingEnabled: DEFAULTS.DUCKING_ENABLED,
};

const initialModels = {
  ready: false,
  asr: /** @type {ModelEntry} */ ({ status: 'idle', progress: 0, modelId: null }),
  nllb: /** @type {ModelEntry} */ ({ status: 'idle', progress: 0, modelId: null }),
  device: null, // 'webgpu' | 'wasm' once known
};

/**
 * Truncate the transcript list so long sessions cannot grow unbounded.
 *
 * @param {TranscriptSegment[]} segments
 * @returns {TranscriptSegment[]} trimmed list (max UI.TRANSCRIPT_MAX_SEGMENTS)
 */
function capSegments(segments) {
  return segments.length > UI.TRANSCRIPT_MAX_SEGMENTS
    ? segments.slice(segments.length - UI.TRANSCRIPT_MAX_SEGMENTS)
    : segments;
}

export const useStore = create(
  persist(
    (set, get) => ({
      // ---- session (runtime, never persisted) ----
      status: 'idle', // idle | starting | listening | translating | loading-models
      error: null, // { message, hint }
      level: 0, // 0..1 smoothed input level for the meter
      latencyMs: null,
      online: true,
      transcripts: /** @type {TranscriptSegment[]} */ ([]),
      models: initialModels,
      vadModel: VAD.MODEL,

      // ---- PWA lifecycle (runtime, never persisted) ----
      pwaNeedRefresh: false, // a waiting service worker offers an update
      pwaOfflineReady: false, // app shell precached, offline install ready

      // ---- persisted preferences ----
      settings: initialSettings,
      glossary: /** @type {Array<{id: string, source: string, target: string}>} */ ([]),

      // ---- session actions ----
      setStatus: (status) => set({ status }),
      setError: (message, hint = null) => set({ error: { message, hint } }),
      clearError: () => set({ error: null }),
      setLevel: (level) => set({ level }),
      setLatency: (latencyMs) => set({ latencyMs }),
      setOnline: (online) => set({ online }),
      setVadModel: (model) => set({ vadModel: model }),

      // ---- transcript actions ----
      addSegment: (segment) =>
        set((s) => ({ transcripts: capSegments([...s.transcripts, segment]) })),
      updateSegment: (id, patch) =>
        set((s) => ({
          transcripts: s.transcripts.map((seg) => (seg.id === id ? { ...seg, ...patch } : seg)),
        })),
      clearTranscripts: () => set({ transcripts: [] }),

      // ---- model actions ----
      setModels: (patch) => set((s) => ({ models: { ...s.models, ...patch } })),
      setModelEntry: (key, patch) =>
        set((s) => ({
          models: { ...s.models, [key]: { ...s.models[key], ...patch } },
        })),

      // ---- settings actions ----
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      // ---- glossary actions ----
      addGlossaryEntry: (source, target) =>
        set((s) => ({
          glossary: [...s.glossary, { id: crypto.randomUUID(), source, target }],
        })),
      updateGlossaryEntry: (id, patch) =>
        set((s) => ({
          glossary: s.glossary.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      removeGlossaryEntry: (id) =>
        set((s) => ({ glossary: s.glossary.filter((e) => e.id !== id) })),
      setGlossary: (entries) => set({ glossary: entries }),

      /**
       * Apply the persisted theme to <html>. Called once from main.jsx and
       * whenever the theme setting changes.
       */
      applyTheme: () => {
        const { theme } = get().settings;
        document.documentElement.classList.toggle('dark', theme === 'dark');
      },
    }),
    {
      name: 'livevox:preferences',
      version: 1,
      // Only preferences survive a reload — never transcripts or audio.
      partialize: (state) => ({ settings: state.settings, glossary: state.glossary }),
    }
  )
);

/** Selector helpers keep components from re-rendering on unrelated slices. */
export const selectSettings = (s) => s.settings;
export const selectIsRunning = (s) => s.status !== 'idle' && s.status !== 'loading-models';
