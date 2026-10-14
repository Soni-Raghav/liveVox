/**
 * StatusChip — compact pipeline status indicator for the header.
 * States: idle / starting / loading models / listening / translating.
 */
import { AudioLines, Download, Languages, Loader2, MicOff } from 'lucide-react';
import { useStore } from '../store/useStore.js';

/** @typedef {{label: string, icon: JSX.Element, classes: string}} StatusVisual */

/**
 * Map a pipeline status onto label, icon and colour classes.
 *
 * @param {string} status
 * @returns {StatusVisual} visual descriptor
 */
function statusVisual(status) {
  switch (status) {
    case 'starting':
      return {
        label: 'Starting',
        icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
        classes: 'border-slate-300 text-slate-600 dark:border-slate-700 dark:text-slate-300',
      };
    case 'loading-models':
      return {
        label: 'Loading models',
        icon: <Download className="h-3.5 w-3.5 animate-bounce" aria-hidden />,
        classes: 'border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400',
      };
    case 'listening':
      return {
        label: 'Listening',
        icon: <AudioLines className="h-3.5 w-3.5" aria-hidden />,
        classes:
          'border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400',
      };
    case 'translating':
      return {
        label: 'Translating',
        icon: <Languages className="h-3.5 w-3.5" aria-hidden />,
        classes: 'border-violet-300 text-violet-600 dark:border-violet-800 dark:text-violet-400',
      };
    default:
      return {
        label: 'Idle',
        icon: <MicOff className="h-3.5 w-3.5" aria-hidden />,
        classes: 'border-slate-300 text-slate-500 dark:border-slate-700 dark:text-slate-400',
      };
  }
}

/**
 * @returns {JSX.Element} status chip with icon and label
 */
export default function StatusChip() {
  const status = useStore((s) => s.status);
  const visual = statusVisual(status);
  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${visual.classes}`}
    >
      {visual.icon}
      {visual.label}
    </span>
  );
}
