/**
 * Vite configuration for LiveVox.
 *
 * Purpose:
 * - Bundles the React app and the two Web Workers (ASR + translation) as ES
 *   modules so they can import heavy ML libraries.
 * - Serves COOP/COEP headers in dev/preview so onnxruntime-web can use
 *   multi-threaded WASM; when headers are absent (e.g. GitHub Pages without
 *   the service-worker workaround) the app falls back to single-threaded WASM.
 * - Wires Vitest (jsdom + RTL setup file).
 * - The PWA plugin (vite-plugin-pwa) is added in `src/sw.js` + `pwa()` section
 *   below; see M8 in docs/ARCHITECTURE.md.
 *
 * The service worker source lives in `src/sw.js` and is built with the
 * `injectManifest` strategy (we need custom fetch handlers for COI headers
 * and Hugging Face model caching).
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Headers required for SharedArrayBuffer (multi-threaded WASM).
 * `credentialless` still allows CORS fetches of model files from
 * huggingface.co, unlike the stricter `require-corp`.
 */
const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

/**
 * Build the web app manifest. `base` is configurable through VITE_BASE so the
 * same config builds for GitHub Pages sub-paths (`/livevox/`).
 *
 * @param {string} base - Vite base URL (starts and ends with "/")
 * @returns {object} manifest for vite-plugin-pwa
 */
function buildManifest(base) {
  return {
    name: 'LiveVox — Real-time Video Translator',
    short_name: 'LiveVox',
    description:
      'Translate any playing video or audio in real time, fully on-device. Works offline after one-time model download.',
    lang: 'en',
    dir: 'ltr',
    theme_color: '#0f172a',
    background_color: '#0f172a',
    display: 'standalone',
    orientation: 'any',
    start_url: `${base}index.html`,
    scope: base,
    icons: [
      { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: `${base}icons/icon-maskable-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: `${base}icons/icon-maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

export default defineConfig({
  // Deploy workflow sets VITE_BASE to "/<repo-name>/" for GitHub Pages.
  base: process.env.VITE_BASE || '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Registration happens manually in src/lib/pwa.js (we need the
      // controllerchange reload dance for cross-origin isolation).
      injectRegister: false,
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: buildManifest(process.env.VITE_BASE || '/'),
      // injectManifest strategy: options below go to workbox-build's
      // injectManifest() call. The navigation fallback is implemented
      // manually in src/sw.js (we need COOP/COEP headers there).
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,onnx,mjs}'],
        // ORT WASM binaries are ~11–22 MB each; raise the precache size cap
        // so the app shell stays fully offline-capable.
        maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
      },
    }),
  ],
  // Workers must be ES modules so they can `import` the ML libraries.
  worker: { format: 'es' },
  // The ML libraries ship large WASM payloads and are only referenced from
  // workers; excluding them from dep pre-bundling keeps `vite dev` fast.
  optimizeDeps: { exclude: ['@huggingface/transformers', '@ricky0123/vad-web'] },
  server: {
    port: 5173,
    headers: { ...COI_HEADERS },
  },
  preview: {
    port: 4173,
    headers: { ...COI_HEADERS },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    // Never inline assets as data URIs: the AudioWorklet module must be a
    // real same-origin file for addModule(), and the service worker needs
    // real files to precache (Lighthouse/PWA + offline).
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
  },
});
