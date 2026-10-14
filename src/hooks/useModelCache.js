/**
 * useModelCache — storage management for the on-device models.
 *
 * Reports Cache Storage usage (the models live in the 'transformers-cache'
 * of the Cache API), requests `navigator.storage.persist()` so the browser
 * will not evict downloaded models under pressure, and can delete the model
 * caches (the app shell's workbox precache is deliberately untouched).
 */
import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../lib/constants.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('modelCache');

/**
 * @typedef {Object} StorageInfo
 * @property {number|null} usage - bytes used by the origin
 * @property {number|null} quota - bytes granted
 * @property {boolean|null} persisted - persistent storage granted?
 */

/**
 * @returns {{storage: StorageInfo, refresh: () => void,
 *            requestPersist: () => Promise<void>, deleteModels: () => Promise<void>}}
 *   storage management API
 */
export function useModelCache() {
  const [storage, setStorage] = useState({ usage: null, quota: null, persisted: null });

  const refresh = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    try {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      setStorage({ usage, quota, persisted });
    } catch (error) {
      log.warn(`storage estimate failed: ${error.message}`);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Ask the browser for persistent storage (prevents eviction of the
   * downloaded models — critical for the offline promise).
   *
   * @returns {Promise<void>}
   */
  const requestPersist = useCallback(async () => {
    try {
      const granted = await navigator.storage?.persist?.();
      log.info(`persistent storage request: ${granted ? 'granted' : 'denied'}`);
    } catch (error) {
      log.warn(`persist request failed: ${error.message}`);
    }
    await refresh();
  }, [refresh]);

  /**
   * Delete the model caches (NOT the app shell). Loaded workers keep their
   * in-memory models until the page reloads — surfaced in the UI.
   *
   * @returns {Promise<void>}
   */
  const deleteModels = useCallback(async () => {
    if (typeof caches === 'undefined') return;
    const keys = await caches.keys();
    const doomed = keys.filter(
      (key) => key === STORAGE_KEYS.TRANSFORMERS_CACHE || key.startsWith('livevox-')
    );
    await Promise.all(doomed.map((key) => caches.delete(key)));
    log.info(`deleted model caches: ${doomed.join(', ') || '(none)'}`);
    await refresh();
  }, [refresh]);

  return { storage, refresh, requestPersist, deleteModels };
}
