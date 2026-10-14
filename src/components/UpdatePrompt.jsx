/**
 * UpdatePrompt — PWA update & offline-ready toasts (registerType: 'prompt').
 *
 * Two toasts live here:
 * - `UpdatePrompt` (default export): a new service worker is WAITING and
 *   never activates on its own. Persistent toast with a Reload action that
 *   calls applyUpdate(); dismissable for users who prefer the old version
 *   until their next visit.
 * - `OfflineReadyToast`: purely informational, self-dismissing confirmation
 *   that the app shell (and self-hosted runtime assets) are fully cached.
 */
import { CloudDownload, RefreshCw, X } from 'lucide-react';
import { applyUpdate } from '../lib/pwa.js';

/** Shared toast surface styling. */
const TOAST =
  'fixed z-50 flex items-center gap-3 rounded-xl border border-slate-700 ' +
  'bg-slate-900/95 px-4 py-3 text-sm text-slate-100 shadow-xl backdrop-blur ' +
  'dark:border-slate-700 dark:bg-slate-900/95';

/**
 * The "Update available" toast. The Reload button activates the waiting
 * service worker and reloads (see src/lib/pwa.js applyUpdate).
 *
 * @param {{onDismiss?: () => void}} [props]
 * @returns {JSX.Element} toast
 */
export default function UpdatePrompt({ onDismiss }) {
  return (
    <div role="alert" className={`${TOAST} bottom-4 right-4`} data-testid="update-prompt">
      <RefreshCw className="h-4 w-4 shrink-0 text-violet-400" aria-hidden />
      <p>A new version of LiveVox is available.</p>
      <button
        type="button"
        onClick={applyUpdate}
        className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        Reload
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss update notification"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * The "ready to work offline" toast — shown once after the app shell has
 * been precached, auto-dismissed by the App after PWA.OFFLINE_READY_TOAST_MS.
 *
 * @param {{onDismiss?: () => void}} [props]
 * @returns {JSX.Element} toast
 */
export function OfflineReadyToast({ onDismiss }) {
  return (
    <div role="status" className={`${TOAST} bottom-4 left-1/2 -translate-x-1/2`}>
      <CloudDownload className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
      <p>LiveVox is cached and ready to work offline.</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss offline-ready notification"
          className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
