/**
 * PrivacyBanner — the "Audio never leaves your device" promise.
 *
 * Always visible in the footer. When the opt-in online fallback (MyMemory)
 * is enabled, an additional clearly-labelled notice is shown — the user
 * must never be surprised by network traffic.
 */
import { Lock, Globe } from 'lucide-react';
import { useStore } from '../store/useStore.js';

/**
 * @returns {JSX.Element} privacy footer
 */
export default function PrivacyBanner() {
  const myMemoryOptIn = useStore((s) => s.settings.myMemoryOptIn);
  const online = useStore((s) => s.online);

  return (
    <div className="flex flex-col gap-1" role="contentinfo">
      <p className="flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
        Audio never leaves your device. Nothing is recorded or stored.
      </p>
      {myMemoryOptIn && (
        <p
          className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400"
          aria-live="polite"
        >
          <Globe className="h-3.5 w-3.5" aria-hidden />
          Online fallback enabled: when on-device engines fail
          {online ? ' and you are online' : ''}, sentence text is sent to the free MyMemory service.
          Audio still never leaves your device.
        </p>
      )}
    </div>
  );
}
