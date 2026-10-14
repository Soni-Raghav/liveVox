/**
 * SettingsDialog — full preferences modal.
 *
 * Sections: translation engine, sync (max drift), TTS voice + rate,
 * appearance (theme), privacy (MyMemory opt-in), glossary, storage.
 * Accessible: role="dialog" + aria-modal, Escape to close, focus starts on
 * the dialog and returns to the opener on close.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTTS } from '../hooks/useTTS.js';
import { useSettings } from '../hooks/useSettings.js';
import GlossaryEditor from './GlossaryEditor.jsx';
import StoragePanel from './StoragePanel.jsx';
import { SYNC, TTS } from '../lib/constants.js';

/**
 * Labelled settings section wrapper.
 *
 * @param {{title: string, children: JSX.Element}} props
 * @returns {JSX.Element} section
 */
function Section({ title, children }) {
  return (
    <section className="border-t border-slate-200 py-4 first:border-t-0 dark:border-slate-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

const SELECT_CLASSES =
  'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-slate-700 dark:bg-slate-800';

/**
 * @param {{onClose: () => void}} props
 * @returns {JSX.Element} the settings dialog
 */
export default function SettingsDialog({ onClose }) {
  const { settings, update } = useSettings();
  const { voices, hasLocalVoice, online } = useTTS();
  const dialogRef = useRef(null);

  // Focus the dialog on mount; restore focus to the opener on unmount.
  useEffect(() => {
    dialogRef.current?.focus();
    const opener = document.activeElement;
    /**
     * @param {KeyboardEvent} event
     */
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [onClose]);

  const driftSeconds = Math.round(settings.maxDriftMs / 1000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      {/* Backdrop click-to-close is intentionally omitted for a11y: close
          via the X button or Escape, both keyboard-operable. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl focus:outline-none dark:border-slate-700 dark:bg-slate-900"
      >
        <div className="flex items-center justify-between">
          <h2 id="settings-title" className="text-lg font-semibold">
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <Section title="Translation engine">
          <label htmlFor="engine" className="block text-xs text-slate-500 dark:text-slate-400">
            Preferred engine
          </label>
          <select
            id="engine"
            value={settings.translationEngine}
            onChange={(event) => update({ translationEngine: event.target.value })}
            className={`mt-1 ${SELECT_CLASSES}`}
          >
            <option value="auto">Auto (NLLB → Chrome Translator → online fallback)</option>
            <option value="nllb">Offline NLLB only</option>
            <option value="chrome">Chrome built-in Translator only</option>
          </select>
        </Section>

        <Section title="Sync">
          <label htmlFor="max-drift" className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Max drift before dropping segments</span>
            <span className="tabular-nums">{driftSeconds} s</span>
          </label>
          <input
            id="max-drift"
            type="range"
            min={2000}
            max={10000}
            step={500}
            value={settings.maxDriftMs}
            onChange={(event) => update({ maxDriftMs: Number(event.target.value) })}
            className="mt-2 h-1.5 w-full cursor-pointer rounded-full bg-slate-200 accent-violet-600 dark:bg-slate-700 dark:accent-violet-400"
            aria-valuetext={`${driftSeconds} seconds`}
          />
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Higher = more complete translation, lower = stays closer to the video (default{' '}
            {SYNC.MAX_DRIFT_MS / 1000} s).
          </p>
        </Section>

        <Section title="Voice">
          <label htmlFor="tts-voice" className="block text-xs text-slate-500 dark:text-slate-400">
            Voice for the target language
          </label>
          <select
            id="tts-voice"
            value={settings.ttsVoiceURI ?? ''}
            onChange={(event) => update({ ttsVoiceURI: event.target.value || null })}
            className={`mt-1 ${SELECT_CLASSES}`}
          >
            <option value="">Auto (best system voice)</option>
            {voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name} ({voice.lang}){voice.localService ? '' : ' — cloud'}
              </option>
            ))}
          </select>
          {!hasLocalVoice && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              No on-device voice for this language{online ? '' : ' (offline)'} — the translated
              speech may be unavailable until you install one or reconnect.
            </p>
          )}
          <label htmlFor="tts-rate" className="mt-3 flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Base speaking rate</span>
            <span className="tabular-nums">{settings.ttsBaseRate.toFixed(1)}x</span>
          </label>
          <input
            id="tts-rate"
            type="range"
            min={TTS.RATE_MIN}
            max={TTS.RATE_MAX}
            step={0.1}
            value={settings.ttsBaseRate}
            onChange={(event) => update({ ttsBaseRate: Number(event.target.value) })}
            className="mt-2 h-1.5 w-full cursor-pointer rounded-full bg-slate-200 accent-violet-600 dark:bg-slate-700 dark:accent-violet-400"
            aria-valuetext={`${settings.ttsBaseRate.toFixed(1)} times`}
          />
        </Section>

        <Section title="Appearance">
          <div className="flex gap-2" role="radiogroup" aria-label="Theme">
            {['dark', 'light'].map((theme) => (
              <button
                key={theme}
                type="button"
                role="radio"
                aria-checked={settings.theme === theme}
                onClick={() => update({ theme })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 ${
                  settings.theme === theme
                    ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300'
                    : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                {theme}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Privacy">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.myMemoryOptIn}
              onChange={(event) => update({ myMemoryOptIn: event.target.checked })}
              className="mt-0.5 h-4 w-4 accent-violet-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
              aria-describedby="mymemory-desc"
            />
            <span>
              Allow online fallback (MyMemory)
              <span id="mymemory-desc" className="block text-[11px] text-slate-400 dark:text-slate-500">
                Off by default. When on, sentence TEXT is sent to the free MyMemory API only when
                on-device engines fail and you are online. Audio never leaves your device.
              </span>
            </span>
          </label>
        </Section>

        <Section title="Glossary">
          <GlossaryEditor />
        </Section>

        <Section title="Storage">
          <StoragePanel />
        </Section>
      </div>
    </div>
  );
}
