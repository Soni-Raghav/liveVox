/**
 * usePipeline — React adapter for the framework-agnostic orchestrator.
 *
 * Keeps a single orchestrator instance alive for the whole app lifetime
 * (models stay loaded across start/stop cycles) and exposes imperative
 * actions that components call: start, stop, volume control and — from
 * M2 on — model loading. All state flows through the Zustand store.
 */
import { useCallback, useRef } from 'react';
import { LiveVoxPipeline } from '../pipeline/orchestrator.js';
import { useStore } from '../store/useStore.js';
import { createLogger } from '../lib/logger.js';
import { useAudioCapture } from './useAudioCapture.js';

const log = createLogger('usePipeline');

/**
 * @returns {PipelineApi} imperative pipeline controls for the UI
 */
export function usePipeline() {
  const { requestTabAudio } = useAudioCapture();
  const orchestratorRef = useRef(null);

  if (!orchestratorRef.current) {
    orchestratorRef.current = new LiveVoxPipeline({
      onStatus: (status) => useStore.getState().setStatus(status),
      onError: (message, hint) => useStore.getState().setError(message, hint),
      onLevel: (level) => useStore.getState().setLevel(level),
      getSettings: () => useStore.getState().settings,
    });
  }

  const start = useCallback(async () => {
    const store = useStore.getState();
    if (orchestratorRef.current.active) return;
    store.setStatus('starting');
    const stream = await requestTabAudio();
    if (!stream) {
      store.setStatus('idle');
      return;
    }
    try {
      await orchestratorRef.current.start(stream);
    } catch (error) {
      log.error(`pipeline start failed: ${error.message}`);
      store.setError('Could not start the audio pipeline.', null);
      store.setStatus('idle');
    }
  }, [requestTabAudio]);

  const stop = useCallback(() => {
    orchestratorRef.current.stop();
  }, []);

  const setOriginalVolume = useCallback((volume) => {
    useStore.getState().updateSettings({ originalVolume: volume });
    orchestratorRef.current.setOriginalVolume(volume);
  }, []);

  return { start, stop, setOriginalVolume };
}

/**
 * @typedef {Object} PipelineApi
 * @property {() => Promise<void>} start
 * @property {() => void} stop
 * @property {(volume: number) => void} setOriginalVolume
 */
