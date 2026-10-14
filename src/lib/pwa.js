/**
 * Service worker registration + cross-origin-isolation bootstrap.
 *
 * WHY the reload dance: on the very first visit the page loads *without*
 * COOP/COEP headers (no service worker is in control yet). Our service
 * worker (src/sw.js) serves navigations with those headers, which enables
 * SharedArrayBuffer → multi-threaded WASM for onnxruntime-web. After the SW
 * activates and claims the client, we reload exactly once (guarded by
 * sessionStorage) so the document picks up the isolation headers. If the
 * browser cannot be isolated (e.g. no SW), the app falls back to
 * single-threaded WASM — see src/workers/asr.worker.js.
 */
import { registerSW } from 'virtual:pwa-register';
import { STORAGE_KEYS } from './constants.js';
import { createLogger } from './logger.js';

const log = createLogger('pwa');

/**
 * Register the service worker and wire the update prompt.
 *
 * @param {{onNeedRefresh?: Function, onOfflineReady?: Function}} [handlers]
 *   callbacks used by the UpdatePrompt toast
 * @returns {Function} update function that can trigger a reload
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

  registerSW({
    onNeedRefresh: handlers.onNeedRefresh,
    onOfflineReady: handlers.onOfflineReady,
    onRegisterError(error) {
      log.error(`service worker registration failed: ${error}`);
    },
  });

  return () => location.reload();
}
