/**
 * useOnlineStatus — keeps `store.online` in sync with connectivity.
 *
 * WHY event + polling hybrid: `navigator.onLine` only flips on network
 * interface changes; the online/offline events catch the common cases. The
 * pipeline uses this to auto-disable the online-only MyMemory fallback.
 */
import { useEffect } from 'react';
import { useStore } from '../store/useStore.js';

/**
 * Subscribes to connectivity changes while mounted.
 *
 * @returns {boolean} current online state (also mirrored in the store)
 */
export function useOnlineStatus() {
  useEffect(() => {
    const store = useStore.getState();
    store.setOnline(navigator.onLine);

    const update = () => useStore.getState().setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return useStore((s) => s.online);
}
