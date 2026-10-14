/**
 * LiveVox root component.
 *
 * Layout: header (logo + status chips), main area with the control column
 * (session controls, volume mixer — M4) and the transcript panel (M2+).
 * All pipeline logic lives in hooks; components stay presentational.
 */
import ControlBar from './components/ControlBar.jsx';
import StatusChip from './components/StatusChip.jsx';
import LatencyBadge from './components/LatencyBadge.jsx';
import TranscriptPanel from './components/TranscriptPanel.jsx';
import VolumeMixer from './components/VolumeMixer.jsx';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { useOnlineStatus } from './hooks/useOnlineStatus.js';
import { usePipeline } from './hooks/usePipeline.js';

/**
 * Application shell.
 *
 * @returns {JSX.Element} the LiveVox UI
 */
export default function App() {
  const { start, stop, toggleMute, isRunning } = usePipeline();
  useOnlineStatus();
  useKeyboardShortcuts({ onStart: start, onStop: stop, onToggleMute: toggleMute, isRunning });

  return (
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
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
        <section aria-label="Controls" className="flex flex-col gap-4">
          <ControlBar />
          <VolumeMixer />
        </section>
        <section aria-label="Transcript">
          <TranscriptPanel />
        </section>
      </main>
    </div>
  );
}
