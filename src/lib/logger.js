/**
 * Central logger for LiveVox.
 *
 * WHY: the app forbids bare `console.*` (ESLint rule) so every log line goes
 * through this module. That gives us (1) a uniform format, (2) an in-memory
 * ring buffer the ErrorBoundary can dump for diagnostics, and (3) a single
 * place to silence debug output in production builds.
 */

const RING_SIZE = 300;
const buffer = [];

const isDev =
  typeof import.meta !== 'undefined' && !!import.meta.env && import.meta.env.DEV;

/**
 * Append an entry to the ring buffer and mirror it to the console.
 *
 * @param {string} level - one of 'debug' | 'info' | 'warn' | 'error'
 * @param {string} tag - module tag, e.g. 'capture', 'asr'
 * @param {string} message - human readable message
 */
function push(level, tag, message) {
  const entry = { t: new Date().toISOString(), level, tag, message };
  buffer.push(entry);
  if (buffer.length > RING_SIZE) buffer.shift();
  // Debug output is noisy in production; keep it dev-only.
  if (level === 'debug' && !isDev) return;
  const fn = level === 'debug' ? 'log' : level;
  console[fn](`[${entry.tag}] ${message}`);
}

/**
 * Create a tagged logger.
 *
 * @param {string} tag - short module name shown in every line
 * @returns {{debug: Function, info: Function, warn: Function, error: Function}}
 *   leveled log functions
 * @example
 * const log = createLogger('capture');
 * log.info('tab audio stream started');
 */
export function createLogger(tag) {
  return {
    debug: (message) => push('debug', tag, message),
    info: (message) => push('info', tag, message),
    warn: (message) => push('warn', tag, message),
    error: (message) => push('error', tag, message),
  };
}

/**
 * Return the most recent log entries (for the error boundary / diagnostics).
 *
 * @param {number} [limit=100] - maximum number of entries to return
 * @returns {Array<{t: string, level: string, tag: string, message: string}>}
 */
export function getRecentLogs(limit = 100) {
  return buffer.slice(-limit);
}

/** Empty the ring buffer (used by tests). */
export function clearLogs() {
  buffer.length = 0;
}
