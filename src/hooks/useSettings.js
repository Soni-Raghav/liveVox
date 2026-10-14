/**
 * useSettings — convenience access to the persisted settings slice.
 *
 * Components may use fine-grained selectors directly on the store; this
 * hook bundles the common "read + patch" pattern and centralizes the theme
 * side effect so no component touches documentElement on its own.
 */
import { useCallback } from 'react';
import { useStore } from '../store/useStore.js';

/**
 * @returns {{settings: object, update: (patch: object) => void}} settings
 */
export function useSettings() {
  const settings = useStore((s) => s.settings);
  const update = useCallback((patch) => useStore.getState().updateSettings(patch), []);
  return { settings, update };
}

/**
 * Theme selector + setter that applies the class to <html> immediately.
 *
 * @returns {{theme: 'dark'|'light', setTheme: (t: string) => void}}
 */
export function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  const setTheme = useCallback((next) => {
    useStore.getState().updateSettings({ theme: next });
    useStore.getState().applyTheme();
  }, []);
  return { theme, setTheme };
}
