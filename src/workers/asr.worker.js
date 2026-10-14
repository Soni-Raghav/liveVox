/**
 * ASR worker — Whisper speech recognition via Transformers.js.
 *
 * Runs entirely off the main thread so inference never blocks the UI
 * (acceptance criterion: no main-thread task over 50 ms during inference).
 *
 * MESSAGE PROTOCOL
 * ----------------
 * Receives (from the orchestrator):
 *   { type: 'load',       id, payload: { modelId: string, device: 'webgpu'|'wasm' } }
 *   { type: 'transcribe', id, payload: { audio: Float32Array(16 kHz mono),
 *                                        language: string|null } }
 *   { type: 'reset',      id, payload: {} }
 * Sends (replies, correlated by id):
 *   { type: 'reply', id, ok: true,  payload: { text, language } }        (transcribe)
 *   { type: 'reply', id, ok: true,  payload: { modelId, device } }       (load)
 *   { type: 'reply', id, ok: false, error: 'message' }                   (any failure)
 * Sends (notifications, uncorrelated):
 *   { type: 'notify', kind: 'progress', payload: { file, progress, loaded, total } }
 *   { type: 'notify', kind: 'status',   payload: { stage, detail } }
 *
 * Transformers.js is configured for:
 *   - self-hosted ONNX Runtime WASM (env.backends.onnx.wasm.wasmPaths)
 *   - browser Cache API persistence (env.useBrowserCache) — models survive
 *     reloads and work offline afterwards
 *   - remote-only weights: downloaded from the Hugging Face hub
 *     (env.allowLocalModels = false — nothing is shipped in /models/)
 *   - single-threaded WASM when the page is not cross-origin isolated
 *     (no SharedArrayBuffer ⇒ no threads; see src/sw.js for the COI flow)
 */
import { env, pipeline } from '@huggingface/transformers';
import { ASR } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('asr');

// --- Transformers.js environment configuration (see header comment) ------
// Model weights are NOT shipped with the app — they download from the HF hub
// on first run and persist in the Cache API. allowLocalModels must stay off:
// hosts with SPA fallbacks serve index.html (HTTP 200) for /models/* probes,
// which breaks the config JSON parse and kills the whole model load.
env.allowLocalModels = false;
env.useBrowserCache = true;
// Self-hosted ORT WASM binaries (scripts/copy-assets.mjs) — no CDN needed.
env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}vendor/ort/`;
// WHY the isolation check: SharedArrayBuffer requires COOP/COEP. Without it
// ORT would try to spawn threads and fail; force single-threaded instead.
if (typeof globalThis.crossOriginIsolated === 'undefined' || !globalThis.crossOriginIsolated) {
  env.backends.onnx.wasm.numThreads = 1;
}

/** @type {import('@huggingface/transformers').AutomaticSpeechRecognitionPipeline|null} */
let asrPipeline = null;
/** Key of the currently loaded model ("modelId:device") to avoid reloads. */
let loadedKey = null;

/**
 * Reply helper.
 *
 * @param {{id: number}} request - original request
 * @param {boolean} ok
 * @param {object} [payload] - reply payload
 * @param {string} [error] - error message when !ok
 */
function reply(request, ok, payload = {}, error = undefined) {
  self.postMessage({ type: 'reply', id: request.id, ok, payload, error });
}

/**
 * Notification helper.
 *
 * @param {string} kind - 'progress' | 'status'
 * @param {object} payload - notification payload
 */
function notify(kind, payload) {
  self.postMessage({ type: 'notify', kind, payload });
}

/**
 * Resolve the execution device before building a pipeline. A requested
 * 'webgpu' is downgraded to 'wasm' unless an actual GPU adapter can be
 * obtained — attempting WebGPU without one poisons the ORT environment for
 * the whole worker ("no available backend found"), taking the in-code WASM
 * retry down with it.
 *
 * @param {string} [requested] - 'webgpu' | 'wasm' | undefined
 * @returns {Promise<'webgpu'|'wasm'|string>} device that is safe to use
 */
async function resolveDevice(requested = ASR.PREFERRED_DEVICE) {
  if (requested !== 'webgpu') return requested;
  try {
    const adapter = await navigator.gpu?.requestAdapter?.();
    return adapter ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

/**
 * Load (or reuse) the ASR pipeline. WebGPU is attempted first when requested;
 * on failure we transparently fall back to WASM — quality is identical for
 * these model sizes, only speed differs.
 *
 * @param {string} modelId - e.g. 'Xenova/whisper-tiny'
 * @param {string} [device] - 'webgpu' | 'wasm'
 * @returns {Promise<{modelId: string, device: string}>} actually loaded config
 */
async function loadPipeline(modelId, device = ASR.PREFERRED_DEVICE) {
  device = await resolveDevice(device);
  const key = `${modelId}:${device}`;
  if (loadedKey === key) return { modelId, device };

  notify('status', { stage: 'loading', detail: modelId });
  const progress_callback = (data) => {
    if (data.status === 'progress') {
      notify('progress', {
        file: data.file,
        progress: data.progress,
        loaded: data.loaded,
        total: data.total,
      });
    }
  };

  let pipelineOptions = { dtype: ASR.DTYPE, device, progress_callback };
  try {
    asrPipeline = await pipeline('automatic-speech-recognition', modelId, pipelineOptions);
  } catch (error) {
    if (device === 'webgpu') {
      log.warn(`WebGPU load failed (${error.message}) — retrying with WASM`);
      device = 'wasm';
      pipelineOptions = { ...pipelineOptions, device };
      asrPipeline = await pipeline('automatic-speech-recognition', modelId, pipelineOptions);
    } else {
      throw error;
    }
  }
  loadedKey = `${modelId}:${device}`;
  notify('status', { stage: 'ready', detail: `${modelId} on ${device}` });
  return { modelId, device };
}

/**
 * Transcribe one speech segment.
 *
 * @param {Float32Array} audio - 16 kHz mono samples in [-1, 1]
 * @param {string|null} language - ISO code, or null for auto-detection
 * @returns {Promise<{text: string, language: string|null}>}
 */
async function transcribe(audio, language) {
  if (!asrPipeline) throw new Error('ASR pipeline not loaded');
  const options = {
    task: 'transcribe',
    chunk_length_s: ASR.CHUNK_LENGTH_S,
    stride_length_s: ASR.STRIDE_LENGTH_S,
  };
  // Passing no `language` lets Whisper use its own detection head; the
  // orchestrator additionally confirms with detectLanguageFromText.
  if (language && language !== 'auto') options.language = language;
  const output = await asrPipeline(audio, options);
  return {
    text: (output.text ?? '').trim(),
    language: output.language ?? null,
  };
}

self.onmessage = async (event) => {
  const request = event.data;
  try {
    switch (request.type) {
      case 'load':
        reply(request, true, await loadPipeline(request.payload.modelId, request.payload.device));
        break;
      case 'transcribe':
        reply(request, true, await transcribe(request.payload.audio, request.payload.language));
        break;
      case 'reset':
        // Drop the loaded pipeline (used when the model is switched).
        asrPipeline = null;
        loadedKey = null;
        reply(request, true, {});
        break;
      default:
        reply(request, false, {}, `unknown message type: ${request.type}`);
    }
  } catch (error) {
    reply(request, false, {}, error.message ?? String(error));
  }
};
