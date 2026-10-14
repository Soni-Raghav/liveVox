/**
 * Language catalogue + ISO 639 ↔ FLORES-200 code mapping + a script/stopword
 * based text language detector.
 *
 * The table covers the languages that work well across the *whole* stack
 * (Whisper ASR + NLLB-200 translation + speechSynthesis voices). Users can
 * still enter any ISO code — helpers degrade gracefully.
 */

/**
 * @typedef {Object} LanguageInfo
 * @property {string} code - ISO 639-1 (or 639-3 where 639-1 is missing)
 * @property {string} name - English name
 * @property {string} native - endonym
 * @property {string} flores - FLORES-200 code for NLLB
 */

/** @type {LanguageInfo[]} */
export const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English', flores: 'eng_Latn' },
  { code: 'es', name: 'Spanish', native: 'Español', flores: 'spa_Latn' },
  { code: 'fr', name: 'French', native: 'Français', flores: 'fra_Latn' },
  { code: 'de', name: 'German', native: 'Deutsch', flores: 'deu_Latn' },
  { code: 'it', name: 'Italian', native: 'Italiano', flores: 'ita_Latn' },
  { code: 'pt', name: 'Portuguese', native: 'Português', flores: 'por_Latn' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands', flores: 'nld_Latn' },
  { code: 'ru', name: 'Russian', native: 'Русский', flores: 'rus_Cyrl' },
  { code: 'uk', name: 'Ukrainian', native: 'Українська', flores: 'ukr_Cyrl' },
  { code: 'pl', name: 'Polish', native: 'Polski', flores: 'pol_Latn' },
  { code: 'cs', name: 'Czech', native: 'Čeština', flores: 'ces_Latn' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe', flores: 'tur_Latn' },
  { code: 'ar', name: 'Arabic', native: 'العربية', flores: 'arb_Arab' },
  { code: 'fa', name: 'Persian', native: 'فارسی', flores: 'pes_Arab' },
  { code: 'he', name: 'Hebrew', native: 'עברית', flores: 'heb_Hebr' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', flores: 'hin_Deva' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', flores: 'ben_Beng' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', flores: 'tam_Taml' },
  { code: 'zh', name: 'Chinese', native: '中文', flores: 'zho_Hans' },
  { code: 'ja', name: 'Japanese', native: '日本語', flores: 'jpn_Jpan' },
  { code: 'ko', name: 'Korean', native: '한국어', flores: 'kor_Hang' },
  { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', flores: 'vie_Latn' },
  { code: 'th', name: 'Thai', native: 'ไทย', flores: 'tha_Thai' },
  { code: 'id', name: 'Indonesian', native: 'Bahasa Indonesia', flores: 'ind_Latn' },
  { code: 'ms', name: 'Malay', native: 'Bahasa Melayu', flores: 'zsm_Latn' },
  { code: 'sv', name: 'Swedish', native: 'Svenska', flores: 'swe_Latn' },
  { code: 'da', name: 'Danish', native: 'Dansk', flores: 'dan_Latn' },
  { code: 'no', name: 'Norwegian', native: 'Norsk', flores: 'nob_Latn' },
  { code: 'fi', name: 'Finnish', native: 'Suomi', flores: 'fin_Latn' },
  { code: 'el', name: 'Greek', native: 'Ελληνικά', flores: 'ell_Grek' },
  { code: 'hu', name: 'Hungarian', native: 'Magyar', flores: 'hun_Latn' },
  { code: 'ro', name: 'Romanian', native: 'Română', flores: 'ron_Latn' },
];

/** Source languages selectable in the UI (same set; "auto" is added by the UI). */
export const SOURCE_LANGUAGES = LANGUAGES;
/** Target languages selectable in the UI. */
export const TARGET_LANGUAGES = LANGUAGES;

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));
const BY_FLORES = new Map(LANGUAGES.map((l) => [l.flores, l]));

/**
 * Look up a language by ISO code.
 *
 * @param {string} code - ISO 639 code ('en', 'pt'...)
 * @returns {LanguageInfo|null} catalogue entry or null
 */
export function getLanguage(code) {
  return BY_CODE.get(code) ?? null;
}

/**
 * Human-readable name (falls back to the raw code).
 *
 * @param {string} code
 * @returns {string} display name
 */
export function languageName(code) {
  const lang = getLanguage(code);
  return lang ? `${lang.name} (${lang.native})` : code;
}

/**
 * ISO code → FLORES-200 code for NLLB.
 *
 * @param {string} code
 * @returns {string|null} FLORES code, or null when unmapped
 */
export function isoToFlores(code) {
  if (!code) return null;
  const lang = BY_CODE.get(code.slice(0, 2).toLowerCase());
  return lang ? lang.flores : null;
}

/**
 * FLORES-200 code → ISO code.
 *
 * @param {string} flores
 * @returns {string|null} ISO code, or null when unmapped
 */
export function floresToIso(flores) {
  const lang = BY_FLORES.get(flores);
  return lang ? lang.code : null;
}

// ---------------------------------------------------------------------------
// Text-based language detection (used for "Auto" source language).
// Unicode script first, then Latin-language stopword scoring.
// ---------------------------------------------------------------------------

const SCRIPTS = [
  [/[\u3040-\u30ff]/, 'ja'],
  [/[\uac00-\ud7af]/, 'ko'],
  [/[\u4e00-\u9fff]/, 'zh'],
  [/[\u0400-\u04ff]/, 'cyrillic'],
  [/[\u0600-\u06ff]/, 'arabic'],
  [/[\u0590-\u05ff]/, 'he'],
  [/[\u0900-\u097f]/, 'hi'],
  [/[\u0e00-\u0e7f]/, 'th'],
  [/[\u0370-\u03ff]/, 'el'],
];

/** Latin-language stopword sets (small but discriminative). */
const STOPWORDS = {
  en: ['the', 'and', 'is', 'of', 'to', 'in', 'that', 'it', 'you', 'with', 'this', 'for', 'are', 'was'],
  es: ['el', 'la', 'de', 'que', 'y', 'en', 'los', 'un', 'por', 'con', 'para', 'está', 'no', 'se'],
  fr: ['le', 'la', 'de', 'et', 'les', 'des', 'un', 'une', 'est', 'que', 'pour', 'dans', 'pas', 'vous'],
  de: ['der', 'die', 'und', 'das', 'ist', 'den', 'von', 'mit', 'auf', 'für', 'nicht', 'ein', 'eine'],
  it: ['il', 'la', 'di', 'che', 'e', 'un', 'per', 'con', 'non', 'sono', 'del', 'della', 'questo'],
  pt: ['o', 'a', 'de', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'mais'],
  nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'op', 'te', 'met', 'niet', 'voor', 'zijn'],
  pl: ['i', 'w', 'na', 'jest', 'że', 'się', 'do', 'nie', 'to', 'tego', 'co', 'tak'],
  tr: ['ve', 'bir', 'bu', 'için', 'ile', 'değil', 'çok', 'ama', 'olarak', 'var', 'mi'],
  id: ['dan', 'yang', 'di', 'itu', 'dengan', 'tidak', 'ini', 'untuk', 'atau', 'akan', 'ada'],
  vi: ['của', 'và', 'là', 'không', 'có', 'những', 'được', 'một', 'người', 'với', 'các'],
  sv: ['och', 'att', 'det', 'som', 'en', 'på', 'är', 'för', 'med', 'inte', 'av'],
  da: ['og', 'det', 'er', 'som', 'en', 'til', 'med', 'ikke', 'på', 'de', 'har'],
  no: ['og', 'det', 'som', 'er', 'en', 'til', 'med', 'ikke', 'på', 'jeg', 'har'],
  fi: ['ja', 'on', 'että', 'ei', 'se', 'hän', 'olla', 'tämä', 'mutta', 'kuin', 'myös'],
  ro: ['și', 'este', 'de', 'la', 'în', 'un', 'cu', 'care', 'pentru', 'nu', 'sa'],
  hu: ['és', 'az', 'egy', 'hogy', 'nem', 'van', 'vele', 'ez', 'de', 'vagyok'],
  cs: ['a', 'je', 'že', 'se', 'na', 'v', 'pro', 'ale', 'to', 'nebo', 'byl'],
};

/** Cyrillic disambiguation: Ukrainian-specific letters. */
const UKRAINIAN_CHARS = /[\u0404\u0406\u0407\u0490]/i; // Є І Ї Ґ

/** Arabic-script disambiguation (Urdu vs Persian vs Arabic). */
const URDU_CHARS = /[\u06be\u06c1\u06d2\u0679\u0688\u0691]/; // ۀ ہ ے ٹ ڈ ڑ
const PERSIAN_CHARS = /[\u067e\u0686\u06af\u06a9\u06cc]/; // پ چ گ ک ی

/**
 * Detect the language of a piece of text (best effort heuristic).
 *
 * @param {string} text - transcript fragment
 * @returns {{code: string, confidence: number}|null} detected ISO code
 */
export function detectLanguageFromText(text) {
  if (!text || text.trim().length === 0) return null;
  const sample = text.slice(0, 600);

  // 1) Non-Latin scripts are decided by character ranges.
  for (const [pattern, code] of SCRIPTS) {
    if (!pattern.test(sample)) continue;
    if (code === 'cyrillic') {
      return { code: UKRAINIAN_CHARS.test(sample) ? 'uk' : 'ru', confidence: 0.9 };
    }
    if (code === 'arabic') {
      if (URDU_CHARS.test(sample)) return { code: 'ur', confidence: 0.85 };
      if (PERSIAN_CHARS.test(sample)) return { code: 'fa', confidence: 0.8 };
      return { code: 'ar', confidence: 0.85 };
    }
    return { code, confidence: 0.95 };
  }

  // 2) Latin script: stopword frequency scoring.
  const words = sample.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (words.length === 0) return null;
  const counts = new Map();
  for (const langCode of Object.keys(STOPWORDS)) counts.set(langCode, 0);
  for (const word of words) {
    for (const [langCode, list] of Object.entries(STOPWORDS)) {
      if (list.includes(word)) counts.set(langCode, (counts.get(langCode) ?? 0) + 1);
    }
  }
  let best = null;
  for (const [langCode, count] of counts) {
    if (!best || count > best.count) best = { code: langCode, count };
  }
  if (!best || best.count === 0) return null;
  const confidence = Math.min(1, best.count / words.length + 0.2);
  return { code: best.code, confidence };
}
