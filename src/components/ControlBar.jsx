/**
 * ControlBar — primary session controls: Start/Stop, input level meter and
 * the error alert with its user-facing hint. Purely presentational; all
 * actions come from usePipeline, all state from the store.
 */
import { AlertTriangle, Mic, Square, Zap, Brain } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { usePipeline } from '../hooks/usePipeline.js';
import LanguageSelect from './LanguageSelect.jsx';
import { SOURCE_LANGUAGES, TARGET_LANGUAGES } from '../lib/languages.js';
import { ASR } from '../lib/constants.js';

/**
 * Input level meter: a single gradient bar whose width tracks the smoothed
 * RMS level pushed by the orchestrator.
 *
 * @returns {JSX.Element|null} the meter, or null while idle
 */
function LevelMeter() {
  const level = useStore((s) => s.level);
  const running = useStore((s) => s.status !== 'idle' && s.status !== 'starting');
  if (!running) return null;
  return (
    <div
      className="mt-3"
      role="meter"
      aria-label="Input audio level"
      aria-valuenow={Math.round(level * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 transition-[width] duration-100"
          style={{ width: `${Math.round(level * 100)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Error alert with actionable hint (permission denied, no audio track, ...).
 *
 * @returns {JSX.Element|null} alert box, or null when no error
 */
function ErrorAlert() {
  const error = useStore((s) => s.error);
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mt-3 flex gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        <p className="font-medium">{error.message}</p>
        {error.hint && <p className="mt-1 text-rose-600/90 dark:text-rose-300/80">{error.hint}</p>}
      </div>
    </div>
  );
}

/**
 * Fast vs quality recognition mode (whisper-tiny vs whisper-base).
 * Switching downloads the other model ahead of time from the browser cache
 * (or the hub once), so the next session starts instantly.
 *
 * @returns {JSX.Element} segmented mode control
 */
function ModeToggle() {
  const mode = useStore((s) => s.settings.asrMode);
  const { loadModels } = usePipeline();

  /**
   * @param {string} next - 'fast' | 'quality'
   */
  const select = (next) => {
    if (next === mode) return;
    useStore.getState().updateSettings({ asrMode: next });
    loadModels({ asrMode: next }).catch(() => {
      useStore.getState().setError('Could not load the selected model.', null);
    });
  };

  const base =
    'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500';
  return (
    <div
      role="radiogroup"
      aria-label="Recognition mode"
      className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800"
    >
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'fast'}
        onClick={() => select('fast')}
        className={`${base} ${
          mode === 'fast'
            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        <Zap className="h-3.5 w-3.5" aria-hidden />
        Fast · ≈{ASR.APPROX_MODEL_MB.fast} MB
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'quality'}
        onClick={() => select('quality')}
        className={`${base} ${
          mode === 'quality'
            ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
        }`}
      >
        <Brain className="h-3.5 w-3.5" aria-hidden />
        Quality · ≈{ASR.APPROX_MODEL_MB.quality} MB
      </button>
    </div>
  );
}

/**
 * Session control card.
 *
 * @returns {JSX.Element} start/stop card with meter and error alert
 */
export default function ControlBar() {
  const status = useStore((s) => s.status);
  const { start, stop } = usePipeline();
  const running = status !== 'idle' && status !== 'starting';
  const starting = status === 'starting';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={running ? stop : start}
        aria-pressed={running}
        aria-keyshortcuts="Space"
        className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 ${
          running
            ? 'bg-rose-600 hover:bg-rose-500 dark:bg-rose-700 dark:hover:bg-rose-600'
            : 'bg-violet-600 hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400'
        } disabled:opacity-60`}
        disabled={starting}
      >
        {running ? (
          <Square className="h-4 w-4" aria-hidden />
        ) : (
          <Mic className="h-4 w-4" aria-hidden />
        )}
        {starting ? 'Starting…' : running ? 'Stop translation' : 'Start translation'}
      </button>
      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
        Pick the tab playing the video and tick “Share tab audio”. Shortcut: Space
      </p>
      <div className="mt-3 flex gap-2">
        <LanguageSelect
          id="source-language"
          label="Spoken language"
          value={useStore((s) => s.settings.sourceLang)}
          onChange={(code) => useStore.getState().updateSettings({ sourceLang: code })}
          includeAuto
          languages={SOURCE_LANGUAGES}
        />
        <LanguageSelect
          id="target-language"
          label="Translate to"
          value={useStore((s) => s.settings.targetLang)}
          onChange={(code) => useStore.getState().updateSettings({ targetLang: code })}
          languages={TARGET_LANGUAGES}
        />
      </div>
      <ModeToggle />
      <LevelMeter />
      <ErrorAlert />
    </div>
  );
}
