/**
 * MyMemory translation API client (online-only, opt-in, no key).
 *
 * WHY so much care: the free anonymous tier is rate-limited and rejects
 * queries over ~500 bytes. We (1) split long text on sentence boundaries,
 * (2) pace requests with a minimum interval, (3) honour rate-limit
 * responses and (4) hard-timeout requests so a slow network can never
 * stall the TTS queue. Results are cached by the caller (LRU in the worker).
 */
import { TRANSLATION } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('mymemory');

/** Pacing state (module-level — one client per translate worker). */
let lastRequestAt = 0;

/**
 * Sleep helper.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Split text into chunks within the byte budget, preferring sentence ends.
 *
 * @param {string} text - text to split
 * @param {number} maxBytes - byte budget per chunk
 * @returns {string[]} chunks (concatenation === original text, spaces apart)
 */
export function splitForMyMemory(text, maxBytes = TRANSLATION.MYMEMORY.MAX_QUERY_BYTES) {
  const encoder = new TextEncoder();
  const chunks = [];
  let remaining = text.trim();
  while (encoder.encode(remaining).length > maxBytes && remaining.length > 0) {
    // Try the last sentence end within the budget, else last space, else cut.
    const window = remaining.slice(0, maxBytes);
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
    if (cut <= 0) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = maxBytes;
    chunks.push(remaining.slice(0, cut + 1).trim());
    remaining = remaining.slice(cut + 1).trim();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

/**
 * Translate one chunk via MyMemory.
 *
 * @param {{text: string, srcLang: string, tgtLang: string, signal: AbortSignal}} options
 * @returns {Promise<string>} translated chunk
 * @throws on HTTP/rate-limit/network errors
 */
async function translateChunk({ text, srcLang, tgtLang, signal }) {
  const params = new URLSearchParams({
    q: text,
    langpair: `${srcLang}|${tgtLang}`,
  });
  const url = `${TRANSLATION.MYMEMORY.URL}?${params.toString()}`;
  const response = await fetch(url, { signal });
  if (response.status === 429) {
    throw new Error('MyMemory rate limit reached — try again shortly');
  }
  if (!response.ok) {
    throw new Error(`MyMemory HTTP ${response.status}`);
  }
  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated) {
    throw new Error(data?.responseDetails || 'MyMemory returned no translation');
  }
  // MyMemory occasionally uppercases on MYMEMORY WARNING responses.
  return translated;
}

/**
 * Translate text via MyMemory with pacing, chunking and timeout.
 *
 * @param {{text: string, srcLang: string, tgtLang: string}} options
 * @returns {Promise<string>} full translated text
 */
export async function myMemoryTranslate({ text, srcLang, tgtLang }) {
  const chunks = splitForMyMemory(text);
  /** @type {string[]} */
  const results = [];
  for (const chunk of chunks) {
    // Pacing: wait out the minimum interval between requests.
    const wait = lastRequestAt + TRANSLATION.MYMEMORY.MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TRANSLATION.MYMEMORY.TIMEOUT_MS);
    try {
      results.push(await translateChunk({ text: chunk, srcLang, tgtLang, signal: controller.signal }));
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`MyMemory timed out after ${TRANSLATION.MYMEMORY.TIMEOUT_MS} ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  log.debug(`translated ${chunks.length} chunk(s)`);
  return results.join(' ');
}
