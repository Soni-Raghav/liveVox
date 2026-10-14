/**
 * PipWidget — compact mini-widget rendered into the Document
 * Picture-in-Picture window (portaled by App).
 *
 * Shows the language pair, live latency, pipeline status and a play/pause
 * (start/stop) control — the "always on top" companion while watching the
 * video in the other tab.
 */
import { Mic, MicOff } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { usePipeline } from '../hooks/usePipeline.js';
import { languageName } from '../lib/languages.js';

/**
 * @param {{onClose?: () => void}} [props]
 * @returns {JSX.Element} PiP content
 */
export default function PipWidget({ onClose }) {
  const sourceLang = useStore((s) => s.settings.sourceLang);
  const targetLang = useStore((s) => s.settings.targetLang);
  const latencyMs = useStore((s) => s.latencyMs);
  const status = useStore((s) => s.status);
  const running = status !== 'idle' && status !== 'starting' && status !== 'loading-models';
  const { start, stop } = usePipeline();

  const source = sourceLang === 'auto' ? 'AUTO' : languageName(sourceLang).split(' ')[0];
  const target = languageName(targetLang).split(' ')[0];

  const dotClasses =
    status === 'listening'
      ? 'bg-emerald-400'
      : status === 'translating'
        ? 'bg-violet-400'
        : status === 'loading-models'
          ? 'bg-amber-400'
          : 'bg-slate-500';

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-2 bg-slate-950 p-3 text-slate-100 select-none">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden className="flex items-end gap-0.5">
          <span className="h-1.5 w-0.5 rounded-sm bg-violet-500" />
          <span className="h-2.5 w-0.5 rounded-sm bg-violet-500" />
          <span className="h-3.5 w-0.5 rounded-sm bg-violet-400" />
          <span className="h-2.5 w-0.5 rounded-sm bg-violet-500" />
          <span className="h-1.5 w-0.5 rounded-sm bg-violet-500" />
        </span>
        <span>{source}</span>
        <span aria-hidden className="text-violet-400">
          →
        </span>
        <span>{target}</span>
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${dotClasses}`} aria-hidden />
          <span aria-live="polite">{status === 'loading-models' ? 'Loading' : status}</span>
        </span>
        {latencyMs !== null && (
          <span
            className="tabular-nums"
            aria-label={`latency ${Math.round(latencyMs / 100) / 10} seconds`}
          >
            {latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(1)} s` : `${latencyMs} ms`}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={running ? stop : start}
          aria-pressed={running}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${
            running ? 'bg-rose-600 hover:bg-rose-500' : 'bg-violet-600 hover:bg-violet-500'
          }`}
        >
          {running ? (
            <MicOff className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <Mic className="h-3.5 w-3.5" aria-hidden />
          )}
          {running ? 'Stop' : 'Start'}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
