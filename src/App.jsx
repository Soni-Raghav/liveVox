/**
 * LiveVox root component.
 *
 * Layout: header (logo, latency/status chips, PiP toggle, settings),
 * compatibility banner, main area with the control column (session controls,
 * volume mixer, first-run model manager) and the transcript panel, privacy
 * footer. When Document Picture-in-Picture is supported, the PipWidget is
 * portaled into the always-on-top mini window so the user can control
 * LiveVox while watching the source video in the other tab.
 *
 * All pipeline logic lives in hooks; components stay presentational.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PictureInPicture2, Settings2 } from 'lucide-react';
import CompatibilityWarning from './components/CompatibilityWarning.jsx';
import ControlBar from './components/ControlBar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import LatencyBadge from './components/LatencyBadge.jsx';
import ModelManager from './components/ModelManager.jsx';
import OfflineChip from './components/OfflineChip.jsx';
import PipWidget from './components/PipWidget.jsx';
import PrivacyBanner from './components/PrivacyBanner.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import StatusChip from './components/StatusChip.jsx';
import TranscriptPanel from './components/TranscriptPanel.jsx';
import UpdatePrompt, { OfflineReadyToast } from './components/UpdatePrompt.jsx';
import VolumeMixer from './components/VolumeMixer.jsx';
import { useDocumentPiP } from './hooks/useDocumentPiP.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useOnlineStatus } from './hooks/useOnlineStatus.js';
import { usePipeline } from './hooks/usePipeline.js';
import { PWA } from './lib/constants.js';
import { useStore } from './store/useStore.js';

/** Shared classes for the compact icon buttons in the header. */
const ICON_BUTTON =
  'rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 ' +
  'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';

/**
 * Application shell.
 *
 * @returns {JSX.Element} the LiveVox UI
 */
export default function App() {
  const { start, stop, toggleMute, isRunning } = usePipeline();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const modelsReady = useStore((s) => s.models.ready);
  const theme = useStore((s) => s.settings.theme);
  const pwaNeedRefresh = useStore((s) => s.pwaNeedRefresh);
  const pwaOfflineReady = useStore((s) => s.pwaOfflineReady);
  const pip = useDocumentPiP();
  useOnlineStatus();
  useKeyboardShortcuts({ onStart: start, onStop: stop, onToggleMute: toggleMute, isRunning });

  // The update toast is dismissable but does not auto-hide (a waiting
  // worker stays waiting); the offline-ready toast is informational only.
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [offlineToastDone, setOfflineToastDone] = useState(false);
  const showOfflineToast = pwaOfflineReady && !offlineToastDone;

  useEffect(() => {
    if (!showOfflineToast) return undefined;
    const timer = setTimeout(() => setOfflineToastDone(true), PWA.OFFLINE_READY_TOAST_MS);
    return () => clearTimeout(timer);
  }, [showOfflineToast]);

  // Keep <html class="dark"> in sync with the persisted theme.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-2 font-semibold">
              <span aria-hidden className="flex items-end gap-0.5">
                <span className="h-2 w-1 rounded-sm bg-violet-500" />
                <span className="h-3.5 w-1 rounded-sm bg-violet-500" />
                <span className="h-5 w-1 rounded-sm bg-violet-400" />
                <span className="h-3.5 w-1 rounded-sm bg-violet-500" />
                <span className="h-2 w-1 rounded-sm bg-violet-500" />
              </span>
              LiveVox
            </div>
            <div className="ml-auto flex items-center gap-2">
              <OfflineChip />
              <LatencyBadge />
              <StatusChip />
              {pip.supported && (
                <button
                  type="button"
                  onClick={() => (pip.pipWindow ? pip.close() : pip.open())}
                  aria-label={
                    pip.pipWindow ? 'Close mini player window' : 'Open mini player window'
                  }
                  aria-pressed={Boolean(pip.pipWindow)}
                  title="Mini player (always on top)"
                  className={ICON_BUTTON}
                >
                  <PictureInPicture2 className="h-5 w-5" aria-hidden />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Open settings"
                aria-haspopup="dialog"
                className={ICON_BUTTON}
              >
                <Settings2 className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        </header>

        <CompatibilityWarning />

        <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <section aria-label="Controls" className="flex flex-col gap-4">
            {!modelsReady && <ModelManager />}
            <ControlBar />
            <VolumeMixer />
          </section>
          <section aria-label="Transcript">
            <TranscriptPanel />
          </section>
        </main>

        <footer className="mx-auto max-w-6xl px-4 pb-6 text-xs text-slate-500 dark:text-slate-400">
          <PrivacyBanner />
        </footer>

        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

        {/* PWA toasts: update prompt (persistent, action required) and the
            one-time offline-ready confirmation. */}
        {pwaNeedRefresh && !updateDismissed && (
          <UpdatePrompt onDismiss={() => setUpdateDismissed(true)} />
        )}
        {showOfflineToast && <OfflineReadyToast onDismiss={() => setOfflineToastDone(true)} />}

        {/* Portal the mini widget into the Document-PiP window. */}
        {pip.pipWindow &&
          createPortal(<PipWidget onClose={pip.close} />, pip.pipWindow.document.body)}
      </div>
    </ErrorBoundary>
  );
}
