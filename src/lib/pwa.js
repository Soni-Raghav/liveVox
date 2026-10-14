/**
 * Service worker registration + cross-origin-isolation bootstrap.
 *
 * WHY the reload dance: on the very first visit the page loads *without*
 * COOP/COEP headers (no service worker is in control yet). Our service
 * worker (src/sw.js) serves navigations with those headers, which enables
 * SharedArrayBuffer → multi-threaded WASM for onnxruntime-web. After the SW
 * activates and claims the client, we reload exactly once (guarded by
 * sessionStorage) so the document picks up the isolation headers. If the
 * browser cannot be isolated, the app falls back to single-threaded WASM —
 * see src/workers/asr.worker.js.
 *
 * Updates use registerType 'prompt': a waiting worker NEVER activates on its
 * own. applyUpdate() — called by the UpdatePrompt "Reload" button — tells it
 * to skip waiting and reloads the page, either from the controllerchange
 * event or from a safety-net timer.
 */
import { registerSW } from 'virtual:pwa-register';
import { PWA, STORAGE_KEYS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('pwa');

/** update() from registerSW — sends SKIP_WAITING to the waiting worker. */
let updateFn = null;
/** True while we are waiting for an update to take over (expect a reload). */
let expectingUpdate = false;

/**
 * Register the service worker and wire the update prompt callbacks.
 *
 * @param {{onNeedRefresh?: Function, onOfflineReady?: Function}} [handlers]
 *   callbacks used by the UpdatePrompt toast and the offline-ready toast
 * @returns {void}
 */
export function initPWA(handlers = {}) {
  let reloadedThisSession = false;
  try {
    reloadedThisSession = sessionStorage.getItem(STORAGE_KEYS.COI_RELOADED) === '1';
  } catch {
    // sessionStorage can throw in hardened privacy modes — degrade quietly.
  }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (expectingUpdate) {
        log.info('updated service worker took control — reloading');
        location.reload();
        return;
      }
      if (reloadedThisSession) return;
      reloadedThisSession = true;
      try {
        sessionStorage.setItem(STORAGE_KEYS.COI_RELOADED, '1');
      } catch {
        /* ignore */
      }
      log.info('service worker took control — reloading once for COOP/COEP');
      location.reload();
    });
  }

  const { update } = registerSW({
    onNeedRefresh: handlers.onNeedRefresh,
    onOfflineReady: handlers.onOfflineReady,
    onRegisterError(error) {
      log.error(`service worker registration failed: ${error}`);
    },
  });
  updateFn = update;
}

/**
 * Activate a waiting service worker and reload into the new version.
 *
 * @returns {void}
 */
export function applyUpdate() {
  if (!updateFn) {
    // No worker to update (e.g. SW unsupported) — a plain reload is the
    // closest equivalent and always safe.
    location.reload();
    return;
  }
  expectingUpdate = true;
  updateFn();
  // Safety net: if the waiting worker never takes over (rare), reload anyway.
  setTimeout(() => location.reload(), PWA.UPDATE_RELOAD_FALLBACK_MS);
}
