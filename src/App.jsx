/**
 * LiveVox root component.
 *
 * Layout: header (logo, latency/status chips, settings), main area with the
 * control column (session controls, volume mixer, first-run model manager)
 * and the transcript panel. All pipeline logic lives in hooks; components
 * stay presentational.
 */
import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import ControlBar from './components/ControlBar.jsx';
import StatusChip from './components/StatusChip.jsx';
import LatencyBadge from './components/LatencyBadge.jsx';
import TranscriptPanel from './components/TranscriptPanel.jsx';
import VolumeMixer from './components/VolumeMixer.jsx';
import ModelManager from './components/ModelManager.jsx';
import SettingsDialog from './components/SettingsDialog.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useOnlineStatus } from './hooks/useOnlineStatus.js';
import { usePipeline } from './hooks/usePipeline.js';
import { useStore } from './store/useStore.js';

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
  useOnlineStatus();
  useKeyboardShortcuts({ onStart: start, onStop: stop, onToggleMute: toggleMute, isRunning });

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
              <LatencyBadge />
              <StatusChip />
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                aria-label="Open settings"
                aria-haspopup="dialog"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <Settings2 className="h-5 w-5" aria-hidden />
              </button>
            </div>
          </div>
        </header>

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
          Audio is processed entirely on this device and never stored.
        </footer>

        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      </div>
    </ErrorBoundary>
  );
}
