/**
 * OfflineChip — connectivity indicator for the header.
 *
 * Rendered only when the browser reports offline (store.online is kept in
 * sync by the online/offline events in useOnlineStatus). While offline the
 * pipeline relies entirely on the on-device engines and local TTS voices;
 * the opt-in MyMemory fallback is disabled automatically.
 */
import { WifiOff } from 'lucide-react';
import { useStore } from '../store/useStore.js';

/**
 * @returns {JSX.Element|null} the offline chip, or null when online
 */
export default function OfflineChip() {
  const online = useStore((s) => s.online);
  if (online) return null;
  return (
    <span
      role="status"
      title="Offline — on-device engines only"
      className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white/60 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-300"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      Offline
    </span>
  );
}
