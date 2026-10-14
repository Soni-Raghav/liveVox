/**
 * Unit tests for the language catalogue, FLORES mapping and the heuristic
 * text-language detector.
 */
import { describe, expect, it } from 'vitest';
import {
  detectLanguageFromText,
  floresToIso,
  getLanguage,
  isoToFlores,
  languageName,
  LANGUAGES,
} from './languages.js';

describe('language catalogue', () => {
  it('has unique ISO and FLORES codes', () => {
    const codes = LANGUAGES.map((l) => l.code);
    const flores = LANGUAGES.map((l) => l.flores);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(flores).size).toBe(flores.length);
  });

  it('looks up entries by code', () => {
    expect(getLanguage('en').name).toBe('English');
    expect(getLanguage('zz')).toBeNull();
    expect(languageName('en')).toContain('English');
    expect(languageName('zz')).toBe('zz');
  });
});

describe('ISO <-> FLORES mapping', () => {
  it('maps both directions for every catalogue entry', () => {
    for (const lang of LANGUAGES) {
      expect(isoToFlores(lang.code)).toBe(lang.flores);
      expect(floresToIso(lang.flores)).toBe(lang.code);
    }
  });

  it('is case-insensitive and tolerant of region suffixes', () => {
    expect(isoToFlores('EN')).toBe('eng_Latn');
    expect(isoToFlores('pt-BR')).toBe('por_Latn');
    expect(isoToFlores('')).toBeNull();
  });
});

describe('detectLanguageFromText', () => {
  it('detects common Latin-script languages', () => {
    expect(detectLanguageFromText('The quick brown fox and it was running in the park').code).toBe(
      'en'
    );
    expect(
      detectLanguageFromText('El perro que corre en el parque con la pelota es grande').code
    ).toBe('es');
    expect(
      detectLanguageFromText('Le chien qui court dans le parc est très grand et rapide').code
    ).toBe('fr');
    expect(
      detectLanguageFromText('Der Hund der im Park läuft und das ist sehr schnell heute').code
    ).toBe('de');
  });

  it('decides non-Latin scripts by character ranges', () => {
    expect(detectLanguageFromText('これは日本語のテキストです').code).toBe('ja');
    expect(detectLanguageFromText('한국어 텍스트입니다').code).toBe('ko');
    expect(detectLanguageFromText('这是一段中文文本').code).toBe('zh');
    expect(detectLanguageFromText('Привет, это русский текст').code).toBe('ru');
    expect(detectLanguageFromText('Привіт, це український текст').code).toBe('uk');
    expect(detectLanguageFromText('مرحبا هذا نص بالعربية').code).toBe('ar');
    expect(detectLanguageFromText('Γεια σου αυτό είναι ελληνικό κείμενο').code).toBe('el');
  });

  it('returns null for empty or unspecific input', () => {
    expect(detectLanguageFromText('')).toBeNull();
    expect(detectLanguageFromText('   ')).toBeNull();
    // No stopwords and no script signal.
    expect(detectLanguageFromText('xyzzy plugh qwerty')).toBeNull();
  });

  it('returns a confidence between 0 and 1', () => {
    const result = detectLanguageFromText('and the and the and the');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
