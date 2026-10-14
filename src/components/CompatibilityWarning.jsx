/**
 * CompatibilityWarning — browser capability check banner (dismissible).
 *
 * Firefox and Safari cannot reliably capture TAB audio (Firefox captures
 * window audio only on some platforms, Safari lacks getDisplayMedia audio
 * entirely), so they get a prominent nudge to Chrome/Edge. Missing
 * AudioWorklet/WebAssembly makes the app unusable and is reported as an
 * error. A missing SharedArrayBuffer is benign — the ML workers fall back
 * to single-threaded WASM.
 */
import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { createLogger } from '../lib/logger.js';

const log = createLogger('compat');

/**
 * Detect browser capability issues.
 *
 * @returns {{level: 'error'|'warn', message: string}[]} issues (empty = OK)
 */
export function detectCompatibilityIssues() {
  /** @type {{level: 'error'|'warn', message: string}[]} */
  const issues = [];
  if (typeof navigator === 'undefined') return issues;

  if (!navigator.mediaDevices?.getDisplayMedia) {
    issues.push({
      level: 'error',
      message:
        'This browser cannot share tab audio (getDisplayMedia is missing). Use Chrome or Edge on desktop.',
    });
  }
  if (typeof AudioWorkletNode === 'undefined') {
    issues.push({
      level: 'error',
      message: 'AudioWorklet is not supported — real-time audio analysis cannot run here.',
    });
  }
  if (typeof WebAssembly === 'undefined') {
    issues.push({
      level: 'error',
      message: 'WebAssembly is not supported — the on-device AI models cannot run.',
    });
  }

  const ua = navigator.userAgent;
  const isFirefox = ua.includes('Firefox');
  const isSafari = /^((?!chrome|android|crios|edg).)*safari/i.test(ua);
  if (issues.length === 0 && (isFirefox || isSafari)) {
    issues.push({
      level: 'warn',
      message: `${isFirefox ? 'Firefox' : 'Safari'} has limited tab-audio capture. For the full LiveVox experience use Chrome or Edge on desktop.`,
    });
  }

  if (issues.length > 0) log.warn(`compatibility issues: ${issues.map((i) => i.level).join(',')}`);
  return issues;
}

/**
 * @returns {JSX.Element|null} dismissible banner (null when all good)
 */
export default function CompatibilityWarning() {
  const [dismissed, setDismissed] = useState(false);
  const issues = detectCompatibilityIssues();
  if (dismissed || issues.length === 0) return null;

  return (
    <div role="alert" className="mx-auto mt-3 max-w-6xl px-4">
      <div
        className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
          issues[0].level === 'error'
            ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300'
            : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300'
        }`}
      >
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>{issues.map((issue) => issue.message).join(' ')}</p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss compatibility warning"
          className="ml-auto rounded p-1 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-current dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
