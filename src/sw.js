/**
 * LiveVox service worker (built with Workbox `injectManifest`).
 *
 * Responsibilities:
 * 1. Precache the entire app shell (HTML, JS, CSS, fonts, icons AND the
 *    self-hosted ONNX Runtime WASM + Silero VAD files in /vendor) so the
 *    installed PWA works fully offline.
 * 2. Serve navigation requests with COOP/COEP headers so the page becomes
 *    cross-origin isolated (SharedArrayBuffer → multi-threaded WASM). This
 *    replaces the coi-serviceworker workaround with a single service worker
 *    so it cannot conflict with the PWA registration.
 * 3. Accept the SKIP_WAITING message from the "Update available" prompt
 *    (registerType: 'prompt' — updates never apply silently).
 *
 * Model weights from huggingface.co are cached by Transformers.js itself
 * (Cache API, name 'transformers-cache') — caching them here as well would
 * double storage usage, so we deliberately do not add runtime routes for HF.
 */
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

precacheAndRoute(self.__WB_MANIFEST);

/**
 * Clone a response and attach cross-origin isolation headers.
 *
 * @param {Response} response - original response
 * @returns {Response} response with COOP/COEP headers set
 */
function withCoiHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  // credentialless keeps CORS fetches of model files working while isolated.
  headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Serve the cached app shell for navigations, with isolation headers.
const shellHandler = createHandlerBoundToURL('index.html');
registerRoute(
  new NavigationRoute(async ({ event, request }) => {
    const response = await shellHandler.handle({ event, request });
    return withCoiHeaders(response);
  })
);

// Take over existing clients on first activation so the page can reload once
// into an isolated context (see src/lib/pwa.js).
self.addEventListener('activate', () => {
  self.clients.claim();
});

// The update prompt asks the waiting worker to take over immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
