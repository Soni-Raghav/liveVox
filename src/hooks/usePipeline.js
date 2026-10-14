/**
 * usePipeline — React adapter for the framework-agnostic orchestrator.
 *
 * Keeps a single orchestrator instance alive for the whole app lifetime
 * (models stay loaded across start/stop cycles) and exposes imperative
 * actions for the UI: start, stop, volume control, model loading. All state
 * flows through the Zustand store.
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
      addSegment: (segment) => useStore.getState().addSegment(segment),
      updateSegment: (id, patch) => useStore.getState().updateSegment(id, patch),
      onModelEvent: (kind, patch) => {
        const store = useStore.getState();
        if (kind === 'device') {
          store.setModels({ device: patch });
          return;
        }
        store.setModelEntry(kind, patch);
        // "Ready" gates the ModelManager: ASR is mandatory, NLLB optional
        // (the engine chain falls back to Chrome Translator / MyMemory).
        if (kind === 'asr') store.setModels({ ready: patch.status === 'ready' });
      },
      getSettings: () => useStore.getState().settings,
      getGlossary: () => useStore.getState().glossary,
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

  /**
   * Pre-download models (ModelManager first-run screen). Resolves when the
   * ASR (and, from M3, translation) models are ready.
   *
   * @param {object} [overrides] e.g. { asrMode: 'quality' }
   * @returns {Promise<void>}
   */
  const loadModels = useCallback(async (overrides) => {
    await orchestratorRef.current.ensureModels(overrides);
  }, []);

  return { start, stop, setOriginalVolume, loadModels };
}

/**
 * @typedef {Object} PipelineApi
 * @property {() => Promise<void>} start
 * @property {() => void} stop
 * @property {(volume: number) => void} setOriginalVolume
 * @property {(overrides?: object) => Promise<void>} loadModels
 */
