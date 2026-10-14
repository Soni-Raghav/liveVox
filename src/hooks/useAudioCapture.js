/**
 * useAudioCapture — acquisition of the tab-audio stream (permission UX).
 *
 * Owns exactly one responsibility: call getDisplayMedia and translate any
 * failure into a user-actionable error in the store. The stream is handed
 * to the pipeline orchestrator (see usePipeline) which builds the graph.
 */
import { useCallback } from 'react';
import { requestTabAudioStream } from '../audio/capture.js';
import { useStore } from '../store/useStore.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('useAudioCapture');

/**
 * Request tab audio; on failure stores a friendly error and returns null.
 *
 * @returns {Promise<MediaStream|null>} the captured stream, or null on error
 */
export function useAudioCapture() {
  const requestTabAudio = useCallback(async () => {
    const { setError, clearError } = useStore.getState();
    clearError();
    try {
      return await requestTabAudioStream();
    } catch (error) {
      // CaptureError already carries a hint; other errors get a generic one.
      const message = error.message ?? 'Unknown capture failure';
      setError(message, error.hint ?? null);
      log.error(`capture failed: ${message}`);
      return null;
    }
  }, []);

  return { requestTabAudio };
}
