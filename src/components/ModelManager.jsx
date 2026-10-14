/**
 * ModelManager — first-run "download offline models" screen.
 *
 * Shows per-model size, live download progress (aggregated bytes across the
 * model's files), retry on failure, and a skip path (the first session then
 * downloads on demand). NLLB can be excluded to save ~600 MB — translation
 * then relies on Chrome's built-in Translator / the opt-in MyMemory fallback
 * (both need connectivity, hence the offline warning).
 */
import { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, SkipForward } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { usePipeline } from '../hooks/usePipeline.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import StoragePanel from './StoragePanel.jsx';
import { ASR, TRANSLATION } from '../lib/constants.js';

/**
 * One model row with progress.
 *
 * @param {{label: string, sizeMb: number, status: string, progress: number,
 *          hint?: string}} props
 * @returns {JSX.Element} row
 */
function ModelRow({ label, sizeMb, status, progress, hint }) {
  const downloading = status === 'downloading';
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          ≈{sizeMb} MB
          {status === 'ready' && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />}
          {status === 'error' && <AlertCircle className="h-4 w-4 text-rose-500" aria-hidden />}
          {downloading && <span className="tabular-nums">{Math.round(progress * 100)}%</span>}
        </span>
      </div>
      {downloading && (
        <div
          className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
          role="progressbar"
          aria-label={`${label} download progress`}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-violet-500 transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * @returns {JSX.Element} model download card
 */
export default function ModelManager() {
  const models = useStore((s) => s.models);
  const asrMode = useStore((s) => s.settings.asrMode);
  const { loadModels } = usePipeline();
  const online = useOnlineStatus();
  const [includeNllb, setIncludeNllb] = useState(true);
  const [busy, setBusy] = useState(false);

  /**
   * Trigger (or retry) the downloads for the current selections.
   */
  const download = () => {
    setBusy(true);
    loadModels({ loadNllb: includeNllb })
      .catch(() => {
        /* failures are reflected in the per-model status rows */
      })
      .finally(() => setBusy(false));
  };

  const skip = () => useStore.getState().setModels({ ready: true });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold">Download offline models</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        One-time download. After this, LiveVox translates fully offline — audio never leaves your
        device.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <ModelRow
          label="Speech recognition (Whisper)"
          sizeMb={asrMode === 'quality' ? ASR.APPROX_MODEL_MB.quality : ASR.APPROX_MODEL_MB.fast}
          status={models.asr.status}
          progress={models.asr.progress}
          hint={`Mode: ${asrMode} — switchable in the controls above.`}
        />
        <ModelRow
          label="Translation (NLLB-200, all 200 languages)"
          sizeMb={TRANSLATION.APPROX_NLLB_MB}
          status={includeNllb ? models.nllb.status : 'idle'}
          progress={models.nllb.progress}
          hint="Skip to rely on Chrome's built-in Translator (online) or the opt-in online fallback."
        />
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includeNllb}
            onChange={(event) => setIncludeNllb(event.target.checked)}
            className="h-4 w-4 accent-violet-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
          />
          Download the offline translation model (~{TRANSLATION.APPROX_NLLB_MB} MB)
        </label>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Silero VAD (~2 MB) is bundled with the app and needs no download.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={download}
          disabled={busy || !online}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
        >
          <Download className="h-4 w-4" aria-hidden />
          {busy ? 'Downloading…' : online ? 'Download models' : 'Offline — reconnect to download'}
        </button>
        <button
          type="button"
          onClick={skip}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <SkipForward className="h-4 w-4" aria-hidden />
          Skip for now
        </button>
      </div>
      <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
        <StoragePanel />
      </div>
    </div>
  );
}
