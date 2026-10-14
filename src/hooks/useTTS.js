/**
 * useTTS — speechSynthesis voice discovery for the UI.
 *
 * The orchestrator reads volume/rate/voice settings at dispatch time, so
 * this hook's only job is to expose the system voice list (Chrome populates
 * it asynchronously via `voiceschanged`) plus offline-safety info used by
 * the settings dialog and the mixer.
 */
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore.js';

/**
 * Subscribe to the system voice list (optionally filtered by language).
 *
 * @param {string|null} [filterLang] - ISO prefix filter (null = all voices)
 * @returns {SpeechSynthesisVoice[]} available voices
 */
export function useVoices(filterLang = null) {
  const [voices, setVoices] = useState(
    typeof window !== 'undefined' && 'speechSynthesis' in window
      ? window.speechSynthesis.getVoices()
      : []
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
    const synth = window.speechSynthesis;
    const update = () => setVoices([...synth.getVoices()]);
    update();
    synth.addEventListener('voiceschanged', update);
    return () => synth.removeEventListener('voiceschanged', update);
  }, []);

  return useMemo(() => {
    if (filterLang === null) return voices;
    const prefix = filterLang.slice(0, 2).toLowerCase();
    return voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  }, [voices, filterLang]);
}

/**
 * Voices for the current target language + offline capability summary.
 *
 * @returns {{voices: SpeechSynthesisVoice[], hasLocalVoice: boolean,
 *            hasAnyVoice: boolean, online: boolean}} voice info
 */
export function useTTS() {
  const targetLang = useStore((s) => s.settings.targetLang);
  const online = useStore((s) => s.online);
  const voices = useVoices(targetLang);
  return useMemo(
    () => ({
      voices,
      hasAnyVoice: voices.length > 0,
      // Cloud voices (localService === false) fail silently offline.
      hasLocalVoice: voices.some((v) => v.localService),
      online,
    }),
    [voices, online]
  );
}
