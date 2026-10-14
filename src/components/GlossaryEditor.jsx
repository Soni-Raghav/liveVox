/**
 * GlossaryEditor — CRUD for the custom term glossary (source → target).
 * Entries are persisted via the store and applied around every translation
 * (pre- and post-pass, see src/pipeline/glossary.js).
 */
import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useStore } from '../store/useStore.js';

/**
 * One editable glossary row.
 *
 * @param {{entry: {id: string, source: string, target: string}}} props
 * @returns {JSX.Element} row
 */
function GlossaryRow({ entry }) {
  const removeGlossaryEntry = useStore((s) => s.removeGlossaryEntry);
  const updateGlossaryEntry = useStore((s) => s.updateGlossaryEntry);
  const inputClasses =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-slate-700 dark:bg-slate-800';

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={entry.source}
        aria-label="Glossary source term"
        placeholder="Original term"
        onChange={(event) => updateGlossaryEntry(entry.id, { source: event.target.value })}
        className={inputClasses}
      />
      <span aria-hidden className="text-slate-400">
        →
      </span>
      <input
        type="text"
        value={entry.target}
        aria-label="Glossary target term"
        placeholder="Translated term"
        onChange={(event) => updateGlossaryEntry(entry.id, { target: event.target.value })}
        className={inputClasses}
      />
      <button
        type="button"
        onClick={() => removeGlossaryEntry(entry.id)}
        aria-label={`Remove glossary entry ${entry.source}`}
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500 dark:hover:bg-slate-800"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/**
 * @returns {JSX.Element} glossary editor section
 */
export default function GlossaryEditor() {
  const glossary = useStore((s) => s.glossary);
  const addGlossaryEntry = useStore((s) => s.addGlossaryEntry);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');

  /**
   * Add an entry after validating both sides are non-empty.
   */
  const add = () => {
    const cleanSource = source.trim();
    const cleanTarget = target.trim();
    if (!cleanSource || !cleanTarget) return;
    addGlossaryEntry(cleanSource, cleanTarget);
    setSource('');
    setTarget('');
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
        {glossary.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            No custom terms yet. Add names or jargon that should always translate the same way.
          </p>
        ) : (
          glossary.map((entry) => <GlossaryRow key={entry.id} entry={entry} />)
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 pt-2 dark:border-slate-800">
        <input
          type="text"
          value={source}
          placeholder="New source term"
          aria-label="New glossary source term"
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-slate-700 dark:bg-slate-800"
        />
        <span aria-hidden className="text-slate-400">
          →
        </span>
        <input
          type="text"
          value={target}
          placeholder="Translation"
          aria-label="New glossary target term"
          onChange={(event) => setTarget(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500 dark:border-slate-700 dark:bg-slate-800"
        />
        <button
          type="button"
          onClick={add}
          disabled={!source.trim() || !target.trim()}
          aria-label="Add glossary entry"
          className="rounded-md bg-violet-600 p-1.5 text-white hover:bg-violet-500 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
