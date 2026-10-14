/**
 * Transcript exporters — .srt and .txt — plus a download helper.
 *
 * SRT timecodes are relative to the first captured segment (media-style
 * timeline starting at 00:00:00,000). Rows without a translation fall back
 * to the source text so exports never contain empty cues.
 */

/**
 * @typedef {Object} ExportSegment
 * @property {number} startedAt - ms epoch
 * @property {number} endedAt - ms epoch
 * @property {string} sourceText
 * @property {string} translatedText
 */

/**
 * Format milliseconds as an SRT timecode "HH:MM:SS,mmm".
 *
 * @param {number} ms - duration in milliseconds
 * @returns {string} timecode
 */
export function formatSrtTime(ms) {
  const total = Math.max(0, Math.floor(ms));
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

/**
 * Build an SRT document from transcript segments.
 *
 * @param {ExportSegment[]} segments - store transcript rows
 * @returns {string} SRT file content
 */
export function toSrt(segments) {
  const usable = segments.filter((s) => s.sourceText || s.translatedText);
  if (usable.length === 0) return '';
  const offset = Math.min(...usable.map((s) => s.startedAt));
  return usable
    .map((segment, index) => {
      const start = formatSrtTime(segment.startedAt - offset);
      const end = formatSrtTime(Math.max(segment.endedAt, segment.startedAt + 1) - offset);
      const text = segment.translatedText || segment.sourceText;
      return `${index + 1}\n${start} --> ${end}\n${text}\n`;
    })
    .join('\n');
}

/**
 * Build a plain-text transcript (timestamp, source, translation).
 *
 * @param {ExportSegment[]} segments
 * @returns {string} text file content
 */
export function toTxt(segments) {
  const usable = segments.filter((s) => s.sourceText || s.translatedText);
  if (usable.length === 0) return '';
  const offset = Math.min(...usable.map((s) => s.startedAt));
  return usable
    .map((segment) => {
      const time = formatSrtTime(segment.startedAt - offset).slice(0, 8);
      const source = segment.sourceText || '—';
      const translated = segment.translatedText || '—';
      return `${time}  ${source}\n      → ${translated}`;
    })
    .join('\n\n');
}

/**
 * Trigger a browser download of a text file.
 *
 * @param {string} filename - suggested file name
 * @param {string} content - file body
 * @param {string} [mime='text/plain'] - MIME type
 * @returns {void}
 */
export function downloadFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Give the click a tick to start before revoking the blob URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
