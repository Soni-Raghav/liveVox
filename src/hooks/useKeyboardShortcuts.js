/**
 * useKeyboardShortcuts — global keyboard access to the golden actions.
 *
 * Shortcuts (ignored while typing in form fields):
 *   Space  start / stop the session
 *   M      mute / unmute the translated voice
 *
 * Handlers are passed in as props so the hook stays presentational-safe and
 * testable; it never imports the pipeline itself.
 */
import { useEffect } from 'react';

/** Elements where global shortcuts must not apply. */
const TEXT_INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * @typedef {Object} ShortcutHandlers
 * @property {() => void} onStart
 * @property {() => void} onStop
 * @property {() => void} onToggleMute
 */

/**
 * Install global keyboard shortcuts for the given handlers.
 *
 * @param {ShortcutHandlers & {isRunning?: () => boolean}} handlers
 * @returns {void}
 */
export function useKeyboardShortcuts({ onStart, onStop, onToggleMute, isRunning }) {
  useEffect(() => {
    /**
     * @param {KeyboardEvent} event
     * @returns {void}
     */
    function onKeyDown(event) {
      const target = event.target;
      if (target instanceof HTMLElement && TEXT_INPUT_TAGS.has(target.tagName)) return;
      if (target instanceof HTMLElement && target.isContentEditable) return;

      if (event.code === 'Space') {
        // Space also scrolls the page — always swallow it here.
        event.preventDefault();
        if (isRunning?.()) onStop();
        else onStart();
      } else if (event.code === 'KeyM') {
        event.preventDefault();
        onToggleMute?.();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStart, onStop, onToggleMute, isRunning]);
}
