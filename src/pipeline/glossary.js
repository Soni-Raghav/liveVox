/**
 * Glossary — user-defined term mappings applied around translation.
 *
 * Two passes:
 * 1. PRE  (before the engine): replace a source-language term with its
 *   target-language equivalent so the model treats it as already translated
 *   instead of mangling the proper noun.
 * 2. POST (after the engine): replace any source term the model still left
 *   untranslated, and enforce the canonical target spelling.
 *
 * Matches are word-boundary aware (Unicode lookarounds, so terms like "C++"
 * work) and preserve the capitalization style of the matched occurrence.
 */

/**
 * Escape a literal string for embedding into a RegExp.
 *
 * @param {string} text - literal term
 * @returns {string} escaped pattern
 */
export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a word-boundary pattern around a term.
 *
 * @param {string} term - literal term
 * @returns {RegExp} global, case-insensitive, Unicode-aware pattern
 */
function termPattern(term) {
  // Lookarounds instead of \b: \b treats "+"/"&" as boundaries and would
  // match "C" inside "C++" style terms.
  const body = escapeRegExp(term.trim());
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, 'giu');
}

/**
 * Match the capitalization style of the source occurrence onto the term.
 *
 * @param {string} match - matched source text
 * @param {string} replacement - glossary target term
 * @returns {string} case-adjusted replacement
 */
function matchCase(match, replacement) {
  if (match.length > 1 && match === match.toUpperCase()) {
    // ALL-CAPS occurrence (acronym) → uppercase the target too.
    return replacement.toUpperCase();
  }
  if (match[0] === match[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * Apply a glossary pass over text.
 *
 * @param {string} text - input text
 * @param {Array<{source: string, target: string}>} entries - glossary
 * @returns {string} text with entries replaced (empty glossary → unchanged)
 */
function applyGlossary(text, entries) {
  if (!text || !entries || entries.length === 0) return text ?? '';
  let result = text;
  for (const entry of entries) {
    if (!entry.source || !entry.target) continue;
    const pattern = termPattern(entry.source);
    // Replace with a function so the match text drives the casing.
    result = result.replace(pattern, (match) => matchCase(match, entry.target));
  }
  return result;
}

/**
 * Pre-translation pass (see module header).
 *
 * @param {string} text - source text
 * @param {Array<{source: string, target: string}>} entries
 * @returns {string} prepared source text
 */
export function applyGlossaryPre(text, entries) {
  return applyGlossary(text, entries);
}

/**
 * Post-translation pass (see module header).
 *
 * @param {string} text - translated text
 * @param {Array<{source: string, target: string}>} entries
 * @returns {string} canonicalized translated text
 */
export function applyGlossaryPost(text, entries) {
  return applyGlossary(text, entries);
}
