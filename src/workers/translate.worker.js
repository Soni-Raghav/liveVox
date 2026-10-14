/**
 * Translation worker — the NLLB / Chrome Translator / MyMemory engine chain.
 *
 * Engine order per request (governed by the `engine` field, default 'auto'):
 *   1. LRU translation cache (exact text + language pair + glossary version)
 *   2. NLLB-200 distilled 600M (Transformers.js) — primary, offline, quantized
 *   3. Chrome built-in Translator API — feature-detected alternative
 *   4. MyMemory — ONLINE-ONLY, opt-in, rate-limited fallback
 *
 * MESSAGE PROTOCOL
 * ----------------
 * Receives (from the orchestrator):
 *   { type: 'load',       id, payload: { loadNllb: boolean } }
 *   { type: 'translate',  id, payload: { text, srcLang, tgtLang, engine,
 *                                        glossary, useMyMemory } }
 *   { type: 'clearCache', id, payload: {} }
 * Sends (replies, correlated by id):
 *   { type: 'reply', id, ok: true,  payload: { text, engine, cached } }
 *   { type: 'reply', id, ok: false, error: 'message' }
 * Sends (notifications):
 *   { type: 'notify', kind: 'progress', payload: { file, progress, loaded, total } }
 *   { type: 'notify', kind: 'status',   payload: { stage, detail } }
 *
 * All heavy inference runs here, off the main thread. Transformers.js is
 * configured identically to the ASR worker (self-hosted ORT WASM, browser
 * cache, single-threaded without cross-origin isolation).
 */
import { env, pipeline } from '@huggingface/transformers';
import { TRANSLATION } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';
import { LRUCache } from '../pipeline/cache.js';
import { applyGlossaryPost, applyGlossaryPre } from '../pipeline/glossary.js';
import { myMemoryTranslate } from '../pipeline/mymemory.js';
import { detectLanguageFromText, isoToFlores } from '../lib/languages.js';

const log = createLogger('translate');

// --- Transformers.js environment (mirrors asr.worker.js) -----------------
env.allowLocalModels = true;
env.useBrowserCache = true;
env.localModelPath = `${import.meta.env.BASE_URL}models/`;
env.backends.onnx.wasm.wasmPaths = `${import.meta.env.BASE_URL}vendor/ort/`;
if (typeof globalThis.crossOriginIsolated === 'undefined' || !globalThis.crossOriginIsolated) {
  env.backends.onnx.wasm.numThreads = 1;
}

/** NLLB pipeline (lazy — loaded on 'load' with loadNllb: true). */
let nllb = null;
/** LRU translation cache. */
const cache = new LRUCache(TRANSLATION.CACHE_MAX_ENTRIES);
/** Cached Chrome Translator instances per language pair. */
const chromeTranslators = new Map();

/**
 * Deterministic fingerprint of the active glossary (cache key component —
 * the pre-pass changes engine input, so results must not be reused across
 * different glossaries).
 *
 * @param {Array<{source: string, target: string}>} entries
 * @returns {string} stable fingerprint
 */
function glossaryFingerprint(entries) {
  if (!entries || entries.length === 0) return '0';
  return entries
    .map((e) => `${e.source}>${e.target}`)
    .sort()
    .join('~');
}

/**
 * Reply / notify helpers (see protocol in the header comment).
 */
function reply(request, ok, payload = {}, error = undefined) {
  self.postMessage({ type: 'reply', id: request.id, ok, payload, error });
}
function notify(kind, payload) {
  self.postMessage({ type: 'notify', kind, payload });
}

/**
 * Load the NLLB-200 distilled 600M pipeline (quantized).
 *
 * @returns {Promise<void>}
 */
async function loadNllb() {
  if (nllb) return;
  notify('status', { stage: 'loading', detail: TRANSLATION.NLLB_MODEL });
  nllb = await pipeline('translation', TRANSLATION.NLLB_MODEL, {
    dtype: TRANSLATION.NLLB_DTYPE,
    progress_callback: (data) => {
      if (data.status === 'progress') {
        notify('progress', {
          file: data.file,
          progress: data.progress,
          loaded: data.loaded,
          total: data.total,
        });
      }
    },
  });
  notify('status', { stage: 'ready', detail: TRANSLATION.NLLB_MODEL });
}

/**
 * NLLB translation with FLORES code mapping.
 *
 * @param {string} text - prepared source text
 * @param {string} srcLang - ISO code
 * @param {string} tgtLang - ISO code
 * @returns {Promise<string>} translated text
 */
async function nllbTranslate(text, srcLang, tgtLang) {
  const srcFlores = isoToFlores(srcLang);
  const tgtFlores = isoToFlores(tgtLang);
  if (!srcFlores || !tgtFlores) {
    throw new Error(`unsupported language pair ${srcLang}->${tgtLang} for NLLB`);
  }
  const output = await nllb(text, { src_lang: srcFlores, tgt_lang: tgtFlores });
  const translated = Array.isArray(output) ? output[0]?.translation_text : output?.translation_text;
  return (translated ?? '').trim();
}

/**
 * Chrome built-in Translator API (feature-detected alternative).
 *
 * @param {string} text - prepared source text
 * @param {string} srcLang - ISO code
 * @param {string} tgtLang - ISO code
 * @returns {Promise<string|null>} translated text, or null when the API is
 *   unavailable for this pair (caller falls through to the next engine)
 */
async function chromeTranslate(text, srcLang, tgtLang) {
  if (typeof globalThis.Translator === 'undefined') return null;
  const key = `${srcLang}>${tgtLang}`;
  let translator = chromeTranslators.get(key);
  if (!translator) {
    // 'available' = model already on device; anything else would need a
    // (large) download — treat as unavailable and fall through to NLLB.
    const availability = await globalThis.Translator.availability({
      sourceLanguage: srcLang,
      targetLanguage: tgtLang,
    });
    if (availability !== 'available') return null;
    translator = await globalThis.Translator.create({
      sourceLanguage: srcLang,
      targetLanguage: tgtLang,
    });
    chromeTranslators.set(key, translator);
  }
  return translator.translate(text);
}

/**
 * MyMemory wrapper with the worker-side offline guard.
 *
 * @param {string} text - prepared source text
 * @param {string} srcLang - ISO code
 * @param {string} tgtLang - ISO code
 * @returns {Promise<string>}
 */
async function myMemoryWithGuards(text, srcLang, tgtLang) {
  // Workers see the same navigator.onLine as the main thread.
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('offline — MyMemory disabled');
  }
  return myMemoryTranslate({ text, srcLang, tgtLang });
}

/**
 * Translate one sentence through the engine chain.
 *
 * @param {{text: string, srcLang: string, tgtLang: string, engine: string,
 *          glossary: Array<{source: string, target: string}>,
 *          useMyMemory: boolean}} payload - request payload
 * @returns {Promise<{text: string, engine: string, cached: boolean}>}
 */
async function translate(payload) {
  const rawText = payload.text?.trim();
  if (!rawText) return { text: '', engine: 'noop', cached: false };

  const srcLang =
    payload.srcLang && payload.srcLang !== 'auto'
      ? payload.srcLang.slice(0, 2)
      : (detectLanguageFromText(rawText)?.code ?? 'en');
  const tgtLang = payload.tgtLang.slice(0, 2);
  if (srcLang === tgtLang) {
    // Nothing to do — pass through (keeps TTS timing consistent).
    return { text: rawText, engine: 'passthrough', cached: false };
  }

  // 1) Cache (glossary fingerprint in the key: the pre-pass changes the
  //    engine input, so cached results must not leak across glossaries).
  const cacheKey = `${srcLang}|${tgtLang}|${glossaryFingerprint(payload.glossary)}|${rawText}`;
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return { text: hit, engine: 'cache', cached: true };

  // 2) Glossary pre-pass.
  const prepared = applyGlossaryPre(rawText, payload.glossary);

  /** @type {string|null} */
  let translated = null;
  let engine = null;
  const errors = [];

  const wantNllb = payload.engine !== 'chrome' && nllb !== null;
  const wantChrome = payload.engine === 'chrome' || payload.engine === 'auto' || !wantNllb;

  // 3) NLLB — primary.
  if (wantNllb) {
    try {
      translated = await nllbTranslate(prepared, srcLang, tgtLang);
      engine = 'nllb';
    } catch (error) {
      errors.push(`nllb: ${error.message}`);
    }
  }

  // 4) Chrome Translator — alternative.
  if (translated === null && wantChrome) {
    try {
      translated = await chromeTranslate(prepared, srcLang, tgtLang);
      if (translated !== null) engine = 'chrome';
    } catch (error) {
      errors.push(`chrome: ${error.message}`);
    }
  }

  // 5) MyMemory — opt-in, online-only fallback.
  if (translated === null && payload.useMyMemory) {
    try {
      translated = await myMemoryWithGuards(prepared, srcLang, tgtLang);
      engine = 'mymemory';
    } catch (error) {
      errors.push(`mymemory: ${error.message}`);
    }
  }

  if (translated === null || translated === '') {
    throw new Error(
      errors.length > 0
        ? `all engines failed (${errors.join('; ')})`
        : 'no translation engine available'
    );
  }

  // 6) Glossary post-pass + cache.
  const finalText = applyGlossaryPost(translated, payload.glossary);
  cache.set(cacheKey, finalText);
  return { text: finalText, engine, cached: false };
}

self.onmessage = async (event) => {
  const request = event.data;
  try {
    switch (request.type) {
      case 'load':
        if (request.payload.loadNllb) await loadNllb();
        reply(request, true, { nllbReady: nllb !== null });
        break;
      case 'translate':
        reply(request, true, await translate(request.payload));
        break;
      case 'clearCache':
        cache.clear();
        reply(request, true, { size: cache.size });
        break;
      default:
        reply(request, false, {}, `unknown message type: ${request.type}`);
    }
  } catch (error) {
    reply(request, false, {}, error.message ?? String(error));
  }
};

log.debug('translate worker ready');
