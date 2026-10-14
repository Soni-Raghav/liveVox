/**
 * Unit tests for the glossary passes.
 */
import { describe, expect, it } from 'vitest';
import { applyGlossaryPost, applyGlossaryPre, escapeRegExp } from './glossary.js';

const GLOSSARY = [
  { source: 'transformer', target: 'Transformateur' },
  { source: 'LiveVox', target: 'LiveVox' },
  { source: 'C++', target: 'C++' },
];

describe('applyGlossaryPre', () => {
  it('replaces source terms with target terms', () => {
    expect(applyGlossaryPre('The transformer model is big', GLOSSARY)).toBe(
      'The Transformateur model is big'
    );
  });

  it('preserves capitalization style of the occurrence', () => {
    expect(applyGlossaryPre('the transformer and Transformer', GLOSSARY)).toBe(
      'the Transformateur and Transformateur'
    );
    // ALL-CAPS occurrence maps to an uppercased target.
    expect(applyGlossaryPre('TRANSFORMER', GLOSSARY)).toBe('TRANSFORMATEUR');
  });

  it('respects word boundaries (no partial-word matches)', () => {
    expect(applyGlossaryPre('cat catalog catastrophe', [{ source: 'cat', target: 'dog' }])).toBe(
      'dog catalog catastrophe'
    );
  });

  it('handles terms with regex special characters', () => {
    expect(applyGlossaryPre('I write C++ daily', GLOSSARY)).toBe('I write C++ daily');
    expect(applyGlossaryPre('I write C++ and Cplusplus', GLOSSARY)).toBe(
      'I write C++ and Cplusplus'
    );
  });

  it('returns text unchanged for an empty glossary or empty text', () => {
    expect(applyGlossaryPre('hello', [])).toBe('hello');
    expect(applyGlossaryPre('', GLOSSARY)).toBe('');
    expect(applyGlossaryPre('hello', [{ source: '', target: 'x' }])).toBe('hello');
  });
});

describe('applyGlossaryPost', () => {
  it('enforces canonical target terms after translation', () => {
    expect(
      applyGlossaryPost('le transformer est grand', [
        { source: 'transformer', target: 'Transformateur' },
      ])
    ).toBe('le Transformateur est grand');
  });

  it('keeps already-canonical text intact', () => {
    expect(applyGlossaryPost('le Transformateur est grand', GLOSSARY)).toBe(
      'le Transformateur est grand'
    );
  });
});

describe('escapeRegExp', () => {
  it('escapes regex metacharacters', () => {
    const pattern = new RegExp(`^${escapeRegExp('a.b*c (d)')}$`);
    expect(pattern.test('a.b*c (d)')).toBe(true);
    expect(pattern.test('aXbYc (d)')).toBe(false);
  });
});
