/**
 * VolumeMixer — independent sliders for the original audio and the
 * translated voice, plus the ducking toggle. Changing the original volume
 * ramps the live graph immediately; the translated volume applies to the
 * next utterance (active utterances cannot change volume mid-speech).
 */
import { Volume2, Waves } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { usePipeline } from '../hooks/usePipeline.js';

/**
 * One labelled volume slider row.
 *
 * @param {{id: string, label: string, icon: JSX.Element, value: number,
 *          onChange: (v: number) => void}} props
 * @returns {JSX.Element} slider row
 */
function VolumeSlider({ id, label, icon, value, onChange }) {
  const percent = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="text-slate-400 dark:text-slate-500">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor={id} className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {label}
          </label>
          <output htmlFor={id} className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {percent}%
          </output>
        </div>
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={1}
          value={percent}
          onChange={(event) => onChange(Number(event.target.value) / 100)}
          aria-valuetext={`${percent} percent`}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-violet-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:bg-slate-700 dark:accent-violet-400"
        />
      </div>
    </div>
  );
}

/**
 * @returns {JSX.Element} the mixer card
 */
export default function VolumeMixer() {
  const originalVolume = useStore((s) => s.settings.originalVolume);
  const translatedVolume = useStore((s) => s.settings.translatedVolume);
  const duckingEnabled = useStore((s) => s.settings.duckingEnabled);
  const { setOriginalVolume, setTranslatedVolume } = usePipeline();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Audio mixer
      </h2>
      <div className="mt-3 flex flex-col gap-4">
        <VolumeSlider
          id="original-volume"
          label="Original audio"
          icon={<Waves className="h-4 w-4" aria-hidden />}
          value={originalVolume}
          onChange={setOriginalVolume}
        />
        <VolumeSlider
          id="translated-volume"
          label="Translated voice"
          icon={<Volume2 className="h-4 w-4" aria-hidden />}
          value={translatedVolume}
          onChange={setTranslatedVolume}
        />
        <div className="flex items-center justify-between">
          <label
            htmlFor="ducking-toggle"
            className="text-xs font-medium text-slate-500 dark:text-slate-400"
          >
            Duck original while translating
          </label>
          <input
            id="ducking-toggle"
            type="checkbox"
            role="switch"
            checked={duckingEnabled}
            onChange={(event) =>
              useStore.getState().updateSettings({ duckingEnabled: event.target.checked })
            }
            className="h-4 w-7 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors before:block before:h-3 before:w-3 before:translate-x-0.5 before:rounded-full before:bg-white before:transition-transform checked:bg-violet-600 checked:before:translate-x-3.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 dark:bg-slate-700 dark:checked:bg-violet-500"
          />
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Mute the translated voice anytime with the{' '}
          <kbd className="rounded border border-slate-300 px-1 dark:border-slate-600">M</kbd> key.
        </p>
      </div>
    </div>
  );
}
