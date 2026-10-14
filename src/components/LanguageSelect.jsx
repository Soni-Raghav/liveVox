/**
 * LanguageSelect — labelled native select for source/target language.
 * Native <select> keeps keyboard + screen-reader support for free.
 */
import { LANGUAGES } from '../lib/languages.js';

/**
 * @param {object} props
 * @param {string} props.id - input id (paired with the label)
 * @param {string} props.label - visible label
 * @param {string} props.value - selected ISO code (or 'auto')
 * @param {(code: string) => void} props.onChange
 * @param {boolean} [props.includeAuto] - prepend an "Auto-detect" option
 * @param {boolean} [props.disabled]
 * @param {Array<{code: string, name: string, native: string}>} [props.languages]
 * @returns {JSX.Element} the select
 */
export default function LanguageSelect({
  id,
  label,
  value,
  onChange,
  includeAuto = false,
  disabled = false,
  languages = LANGUAGES,
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-violet-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
      >
        {includeAuto && <option value="auto">Auto-detect</option>}
        {languages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.name} · {language.native}
          </option>
        ))}
      </select>
    </div>
  );
}
