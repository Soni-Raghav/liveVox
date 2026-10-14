/**
 * TranscriptPanel — live two-column transcript (original | translated).
 *
 * Behaviour:
 * - auto-scrolls while the user is at the bottom; stops following when they
 *   scroll up to read, resumes when they return to the bottom
 * - not-yet-finalized segments render faded (class `partial-text`)
 * - role="log" + aria-live="polite" make it consumable by screen readers
 */
import { useEffect, useRef } from 'react';
import { FileDown, FileText } from 'lucide-react';
import { useStore } from '../store/useStore.js';
import { languageName } from '../lib/languages.js';
import { downloadFile, toSrt, toTxt } from '../lib/exporters.js';

/** Distance from the bottom (px) that still counts as "following". */
const FOLLOW_THRESHOLD_PX = 48;

/** Shared classes for the small export buttons. */
const EXPORT_BUTTON =
  'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ' +
  'text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed ' +
  'disabled:opacity-40 focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-violet-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100';

/**
 * Export toolbar — download the current transcript as .txt or .srt.
 * Disabled until at least one row has text; filenames carry a sortable
 * timestamp so multiple exports from one session cannot overwrite
 * each other.
 *
 * @param {{segments: object[]}} props - transcript rows from the store
 * @returns {JSX.Element} button group
 */
function ExportToolbar({ segments }) {
  const hasText = segments.some((seg) => seg.sourceText || seg.translatedText);

  /**
   * Build and download the file for the requested format.
   *
   * @param {'txt'|'srt'} kind - export format
   */
  function exportAs(kind) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    if (kind === 'srt') {
      downloadFile(`livevox-${stamp}.srt`, toSrt(segments), 'application/x-subrip;charset=utf-8');
    } else {
      downloadFile(`livevox-${stamp}.txt`, toTxt(segments));
    }
  }

  return (
    <div className="flex gap-1" role="group" aria-label="Export transcript">
      <button
        type="button"
        disabled={!hasText}
        onClick={() => exportAs('txt')}
        title="Download transcript as plain text"
        className={EXPORT_BUTTON}
      >
        <FileText className="h-3.5 w-3.5" aria-hidden /> TXT
      </button>
      <button
        type="button"
        disabled={!hasText}
        onClick={() => exportAs('srt')}
        title="Download transcript as SubRip subtitles"
        className={EXPORT_BUTTON}
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden /> SRT
      </button>
    </div>
  );
}

/**
 * Format a timestamp as HH:MM:SS for the row header.
 *
 * @param {number} ts - ms epoch
 * @returns {string} formatted time
 */
function formatTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * One transcript row.
 *
 * @param {{segment: object}} props - segment from the store
 * @returns {JSX.Element} row with original and translated cells
 */
function TranscriptRow({ segment }) {
  return (
    <article className="grid grid-cols-2 gap-3 border-b border-slate-200/70 py-2 dark:border-slate-800/70">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <time className="text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
            {formatTime(segment.startedAt)}
          </time>
          {segment.detectedLang && (
            <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
              {languageName(segment.detectedLang)}
            </span>
          )}
        </div>
        <p className={`mt-0.5 text-sm leading-relaxed ${segment.partial ? 'partial-text' : ''}`}>
          {segment.sourceText || '…'}
        </p>
      </div>
      <div className="min-w-0">
        <p
          className={`mt-4 text-sm leading-relaxed ${
            segment.translatedText ? '' : 'text-slate-400 dark:text-slate-600'
          } ${segment.partial ? 'partial-text' : ''}`}
        >
          {segment.translatedText || '—'}
        </p>
      </div>
    </article>
  );
}

/**
 * @returns {JSX.Element} the transcript panel
 */
export default function TranscriptPanel() {
  const transcripts = useStore((s) => s.transcripts);
  const scrollRef = useRef(null);
  const followRef = useRef(true);

  // Keep the view pinned to the newest row while the user is "following".
  useEffect(() => {
    const el = scrollRef.current;
    if (el && followRef.current) el.scrollTop = el.scrollHeight;
  }, [transcripts]);

  /**
   * @param {UIEvent<HTMLDivElement>} event
   */
  function handleScroll(event) {
    const el = event.currentTarget;
    followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_THRESHOLD_PX;
  }

  return (
    <div className="flex h-full min-h-64 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <div className="grid flex-1 grid-cols-2 gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <span>Original</span>
          <span>Translation</span>
        </div>
        <ExportToolbar segments={transcripts} />
      </div>
      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Live transcript"
        onScroll={handleScroll}
        className="max-h-[65vh] flex-1 overflow-y-auto px-4 py-1"
      >
        {transcripts.length === 0 ? (
          <div className="flex h-full min-h-56 flex-col items-center justify-center gap-2 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>Nothing yet — start a session and play a video in another tab.</p>
            <p className="text-xs">
              Remember to tick <strong>“Share tab audio”</strong> in the picker.
            </p>
          </div>
        ) : (
          transcripts.map((segment) => <TranscriptRow key={segment.id} segment={segment} />)
        )}
      </div>
    </div>
  );
}
