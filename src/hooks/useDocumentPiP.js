/**
 * useDocumentPiP — Document Picture-in-Picture window management.
 *
 * Feature-detected (Chrome/Edge only). Opens a small always-on-top window
 * and copies the app's stylesheets into it so Tailwind classes render
 * identically. The React tree is portaled into the PiP document body by
 * the App; closing the PiP window (pagehide) resets the state.
 */
import { useCallback, useEffect, useState } from 'react';
import { createLogger } from '../lib/logger.js';

const log = createLogger('pip');

/** PiP window geometry (compact mini-widget). */
const PIP_WIDTH = 360;
const PIP_HEIGHT = 170;

/**
 * @returns {{supported: boolean, pipWindow: Window|null,
 *            open: () => Promise<void>, close: () => void}} PiP controls
 */
export function useDocumentPiP() {
  const [pipWindow, setPipWindow] = useState(null);
  const supported =
    typeof window !== 'undefined' && 'documentPictureInPicture' in window;

  /**
   * Copy all stylesheets of the main document into the PiP document so
   * Tailwind classes work without a second build.
   *
   * @param {Document} targetDoc - the PiP document
   */
  function copyStyles(targetDoc) {
    for (const sheet of document.styleSheets) {
      try {
        const css = [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
        const style = targetDoc.createElement('style');
        style.textContent = css;
        targetDoc.head.appendChild(style);
      } catch {
        // Cross-origin stylesheet: re-link it instead of inlining.
        const link = targetDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
      }
    }
  }

  const open = useCallback(async () => {
    if (!supported) return;
    try {
      const pip = await window.documentPictureInPicture.requestWindow({
        width: PIP_WIDTH,
        height: PIP_HEIGHT,
      });
      copyStyles(pip.document);
      pip.document.title = 'LiveVox';
      pip.document.body.className = 'bg-slate-950 m-0 overflow-hidden';
      pip.addEventListener('pagehide', () => setPipWindow(null));
      setPipWindow(pip);
      log.info('picture-in-picture window opened');
    } catch (error) {
      log.warn(`PiP request failed: ${error.message}`);
    }
  }, [supported]);

  const close = useCallback(() => {
    pipWindow?.close();
    setPipWindow(null);
  }, [pipWindow]);

  // Close the PiP window if the hook unmounts (app teardown).
  useEffect(() => close, [close]);

  return { supported, pipWindow, open, close };
}
