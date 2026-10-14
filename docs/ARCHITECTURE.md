# LiveVox Architecture

This document explains how LiveVox is put together: the streaming pipeline,
the threading model, the offline-first strategy and the conventions every
module follows. Read it before changing anything non-trivial.

## Design goals

1. **Real-time-ish translation of tab audio** — a spoken segment should come
   back as translated speech in ~3–6 s end-to-end (VAD segmentation, Whisper
   inference and NLLB inference dominate; hardware dependent).
2. **100 % client-side, zero keys, zero backend** — no paid API ever ships in
   a code path. The only optional network call is the MyMemory fallback,
   which is opt-in and OFF by default.
3. **Offline-first PWA** — after a one-time model download the installed app
   runs with the network unplugged.
4. **Responsive UI under load** — all ML inference lives in Web Workers so
   the main thread never runs a task longer than ~50 ms.

## System overview

```
 Browser tab playing video (YouTube, Netflix, local file …)
        │  getDisplayMedia({ audio })        ← user must tick “Share tab audio”
        ▼
┌────────────────────────── main thread ────────────────────────────────┐
│ AudioContext                                                           │
│   MediaStream ──► GainNode (originalGain: play-through + ducking)      │
│        │            └─► destination (speakers)                        │
│        └─► Resample AudioWorklet ──► 16 kHz mono Float32 frames       │
│                                            │                          │
│              ┌─────────────────────────────┴──────────────┐           │
│              ▼                                            ▼           │
│   Silero VAD (worklet + ONNX)                 energy VAD (fallback)   │
│              └──────────► speech segments ◄──────────────┘           │
│                                            │                          │
│   React UI  ◄── Zustand store ◄── orchestrator (callbacks)           │
└────────────────────────────────────────────│──────────────────────────┘
                                             ▼
              ┌──────── ASR worker (Whisper, Transformers.js) ─────────┐
              │  Float32 PCM ──► text + detected language               │
              └───────────────────────────────────│─────────────────────┘
                                                  ▼
       normalizer (disfluencies, punctuation, sentence merge)
                                                  ▼
              ┌────── translate worker (NLLB-200 distilled 600M) ──────┐
              │  engine chain: LRU cache → NLLB → Chrome Translator    │
              │               → MyMemory (opt-in, online only)         │
              └───────────────────────────────────│─────────────────────┘
                                                  ▼
       speechSynthesis TTS (queue, duration-fitted rate, stale-drop)
              start/end events ──► ducking ramps on originalGain
```

## Module map

| Path                    | Responsibility                                                                                                                                                                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/audio/`            | Web Audio graph: `capture.js` (graph + getDisplayMedia constraints), `resample.worklet.js` (→ 16 kHz mono frames), `frameBuffer.js` (rolling PCM window), `vad.js` (Silero via vad-web), `energyVad.js` (fallback), `ducking.js` (gain ramps), `tts.js` (utterance queue)                     |
| `src/pipeline/`         | Framework-agnostic logic: `orchestrator.js` (wires everything), `queue.js` (BoundedQueue + backpressure), `syncEngine.js` (drift control, latency EMA), `normalizer.js` (sentence units), `glossary.js` (pre/post term replacement), `cache.js` (LRU), `mymemory.js` (opt-in online fallback) |
| `src/workers/`          | `asr.worker.js` (Whisper), `translate.worker.js` (NLLB chain) — each file starts with its full message protocol                                                                                                                                                                               |
| `src/hooks/`            | React adapters: `usePipeline`, `useAudioCapture`, `useTTS`, `useSettings`, `useOnlineStatus`, `useModelCache`, `useKeyboardShortcuts`, `useDocumentPiP`                                                                                                                                       |
| `src/components/`       | Presentational UI only — no pipeline logic                                                                                                                                                                                                                                                    |
| `src/lib/`              | `constants.js` (every tunable number), `logger.js` (the only `console` user), `languages.js` (ISO ↔ FLORES-200 mapping), `workerClient.js` (promise RPC over postMessage), `pwa.js` (SW registration + update flow), `exporters.js` (.txt/.srt)                                               |
| `src/store/useStore.js` | Zustand store; only `settings` + `glossary` persist to localStorage                                                                                                                                                                                                                           |
| `src/sw.js`             | Service worker (Workbox `injectManifest`): precache + COOP/COEP navigation headers                                                                                                                                                                                                            |

## Threading & message flow

- **Main thread** — React rendering, the Web Audio graph, Silero VAD
  callbacks, TTS dispatch, all user interaction.
- **AudioWorklet** (`resample.worklet.js`) — downmixes and downsamples to
  16 kHz mono in ~100 ms frames; posts Float32Array frames to the main
  thread (transferable, zero-copy).
- **ASR worker** — Whisper via Transformers.js. WebGPU when available,
  otherwise WASM (self-hosted binaries, single-threaded without
  cross-origin isolation).
- **Translate worker** — NLLB-200 distilled 600M + the fallback chain.

Workers speak a tiny correlated-RPC protocol
(`{type:'load'|'transcribe'|'translate'|…, id, payload}` →
`{type:'reply', id, ok, payload|error}` + uncorrelated
`{type:'notify', kind:'progress'|'status', payload}`), implemented once in
`src/lib/workerClient.js`. The exact message shapes are documented in the
header comment of each worker file — keep those comments in sync with any
protocol change.

## Backpressure & sync

Live speech arrives faster than it can be translated on slow hardware, so
the pipeline is deliberately lossy in a controlled way:

- `BoundedQueue` (ASR side) drops the _oldest_ pending segment when full and
  marks the transcript row `dropped` (spec: never let memory grow unbounded).
- The TTS queue cancels utterances older than `TTS.STALE_MS`.
- `SyncEngine` tracks end-to-end drift. Above `SYNC.MAX_DRIFT_MS` (default
  4 s, user-adjustable) it boosts TTS rate up to `SYNC.RATE_BOOST_MAX`
  (1.3×) and drops the oldest queued speech, keeping the translation a
  bounded-distance follower of the live audio.
- The latency badge shows a smoothed EMA of capture → spoken-translation
  time; realistic steady-state is 3–6 s.

## Ducking (audio mixing)

`originalGain` sits between the captured stream and the speakers. When an
utterance starts, `applyDuck` ramps the gain to `DUCKING.LEVEL` (0.15 ≈
−16 dB) over `DUCKING.RAMP_MS`; `applyUnduck` restores it when the
utterance ends. Both original and translated volumes are independent user
sliders; ducking itself can be toggled off.

## Offline & storage strategy

Three storage layers, all on-device:

1. **Workbox precache** (`src/sw.js`) — the app shell _including_ the
   self-hosted ONNX Runtime WASM binaries and Silero VAD files
   (`public/vendor/`, regenerated by `scripts/copy-assets.mjs` from
   `node_modules`). This is why the installed PWA boots with no network.
2. **`transformers-cache`** (Cache API, managed by Transformers.js) —
   Whisper and NLLB weights, downloaded once from the Hugging Face hub on
   the first-run Model Manager screen, with progress bars and retry.
   `navigator.storage.persist()` is requested so browsers do not evict
   the models under pressure; usage is visible in Settings → Storage.
3. **localStorage** — only preferences + glossary. Transcripts and audio
   are never stored anywhere.

While offline: the MyMemory fallback is disabled automatically, TTS voice
picking prefers `voice.localService === true`, and an Offline chip appears
in the header.

### Cross-origin isolation (multi-threaded WASM)

`SharedArrayBuffer` (⇒ threaded WASM) requires COOP/COEP headers, which
GitHub Pages cannot set. Instead of the coi-serviceworker hack, our own
service worker serves navigations with `COOP: same-origin` +
`COEP: credentialless` headers. On the very first visit the page loads
un-isolated; once the SW activates and claims the client, `src/lib/pwa.js`
reloads exactly once (sessionStorage-guarded) so the document picks up the
headers. If isolation still fails, both workers force
`numThreads = 1` — slower but fully functional. Netlify/Cloudflare Pages
deployments additionally get the headers on first load via
`public/_headers`.

### Updates

`registerType: 'prompt'` — a waiting worker never activates silently. The
UpdatePrompt toast offers Reload, which calls `applyUpdate()`:
SKIP_WAITING → controllerchange → one reload.

## Conventions (enforced in review)

- **No magic numbers** — every tunable lives in `src/lib/constants.js` with
  a WHY comment.
- **One logger** — `src/lib/logger.js` is the only module allowed to touch
  `console` (ESLint `no-console: error` + a file override).
- **JSDoc on every export**; file-header comments explain each module's
  role; worker files document their message protocol.
- **Small modules** (~150 lines), single responsibility: components are
  presentational, hooks are adapters, `src/pipeline` + `src/audio` are
  framework-free and unit-testable.
- **Plain JavaScript ES2022** — no TypeScript, per project spec.

## Testing

Unit tests (Vitest + jsdom + React Testing Library) live next to their
modules as `*.test.js(x)` and cover the deterministic core: queue
backpressure, sync engine drift math, normalizer, glossary replacement, LRU
cache, exporters, ducking ramps, capture constraints, TTS voice/rate
picking, languages mapping, logger and the update prompt. Run with
`npm test`. End-to-end behaviour (real audio, real models) is covered by
the manual test plan in the README.

## Performance budgets

- Main-thread tasks during inference: **< 50 ms** (all ML in workers).
- End-to-end latency target: **3–6 s** (badge turns amber > 3 s, red > 5 s).
- Memory: transcript capped at 500 segments, frame buffer at 35 s of PCM,
  queues bounded — nothing grows without limit during a long session.
