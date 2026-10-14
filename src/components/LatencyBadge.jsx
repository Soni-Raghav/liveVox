/**
 * LatencyBadge — live end-to-end latency indicator (capture → voice onset).
 * Colours: green under 3 s, amber under 5 s, red above.
 */
import { Gauge } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { UI } from '../lib/constants.js';

/**
 * Pick badge colours for a latency value.
 *
 * @param {number} latencyMs
 * @returns {string} Tailwind classes
 */
function badgeClasses(latencyMs) {
  if (latencyMs < UI.LATENCY_GOOD_MS) {
    return 'border-emerald-300 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400';
  }
  if (latencyMs < UI.LATENCY_BAD_MS) {
    return 'border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400';
  }
  return 'border-rose-300 text-rose-600 dark:border-rose-800 dark:text-rose-400';
}

/**
 * @param {number} latencyMs
 * @returns {string} human-readable "2.4 s"
 */
function formatLatency(latencyMs) {
  return latencyMs >= 1000 ? `${(latencyMs / 1000).toFixed(1)} s` : `${Math.round(latencyMs)} ms`;
}

/**
 * @returns {JSX.Element|null} badge, hidden until a session produced speech
 */
export default function LatencyBadge() {
  const latencyMs = useStore((s) => s.latencyMs);
  if (latencyMs === null || latencyMs === undefined) return null;
  return (
    <span
      role="status"
      aria-label={`Live latency ${formatLatency(latencyMs)}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums ${badgeClasses(
        latencyMs
      )}`}
    >
      <Gauge className="h-3.5 w-3.5" aria-hidden />
      {formatLatency(latencyMs)}
    </span>
  );
}
