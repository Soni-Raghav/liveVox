/**
 * App entry point.
 * - Mounts the React root (no StrictMode: double-invoked effects would
 *   re-trigger getDisplayMedia permission prompts and duplicate the audio
 *   graph; every hook is written to be idempotent on its own instead).
 * - Boots the service worker registration + COI reload logic (src/lib/pwa.js).
 * - The persisted theme is applied from the settings store (see useStore).
 */
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import './index.css';
import App from './App.jsx';
import { initPWA } from './lib/pwa.js';

const root = createRoot(document.getElementById('root'));
root.render(<App />);

initPWA();
