/**
 * StoragePanel — model storage usage, persistence request and deletion.
 * Shared by the ModelManager (first run) and the settings dialog.
 */
import { HardDrive, ShieldCheck, Trash2 } from 'lucide-react';
import { useModelCache } from '../hooks/useModelCache.js';

/**
 * @param {number|null} bytes
 * @returns {string} "412 MB" / "1.8 GB" / "—"
 */
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * @returns {JSX.Element} storage management card body
 */
export default function StoragePanel() {
  const { storage, refresh, requestPersist, deleteModels } = useModelCache();
  const percent =
    storage.usage && storage.quota ? Math.min(100, (storage.usage / storage.quota) * 100) : 0;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <HardDrive className="h-4 w-4" aria-hidden />
          Models on this device
        </span>
        <span className="tabular-nums text-slate-600 dark:text-slate-300">
          {formatBytes(storage.usage)}
          {storage.quota ? ` / ${formatBytes(storage.quota)}` : ''}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
        role="progressbar"
        aria-label="Storage used"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-violet-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap gap-2">
        {storage.persisted === false && (
          <button
            type="button"
            onClick={requestPersist}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Keep models (prevent auto-cleanup)
          </button>
        )}
        <button
          type="button"
          onClick={deleteModels}
          className="flex items-center gap-1.5 rounded-md border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete models
        </button>
        <button
          type="button"
          onClick={refresh}
          className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Refresh
        </button>
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Deleting removes downloaded weights; a reload is needed to clear models already in memory.
      </p>
    </div>
  );
}
