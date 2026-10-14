/**
 * Unit tests for capture helpers (pure level math + error hint coverage).
 */
import { describe, expect, it } from 'vitest';
import { CAPTURE_ERROR_HINTS, CaptureErrorCode, dbfsToNormalized, rmsToDbfs } from './capture.js';

describe('rmsToDbfs', () => {
  it('maps full scale to 0 dBFS', () => {
    expect(rmsToDbfs(1)).toBeCloseTo(0, 5);
  });
  it('maps silence to a very low value', () => {
    expect(rmsToDbfs(0)).toBeLessThan(-150);
  });
  it('is monotonic', () => {
    expect(rmsToDbfs(0.5)).toBeGreaterThan(rmsToDbfs(0.25));
  });
});

describe('dbfsToNormalized', () => {
  it('clamps below the floor to 0 and above 0 dBFS to 1', () => {
    expect(dbfsToNormalized(-100)).toBe(0);
    expect(dbfsToNormalized(6)).toBe(1);
  });
  it('maps the floor to 0 and full scale to 1', () => {
    expect(dbfsToNormalized(-60, -60)).toBe(0);
    expect(dbfsToNormalized(0, -60)).toBe(1);
  });
});

describe('capture error hints', () => {
  it('provides a user-facing hint for every known failure code', () => {
    for (const code of Object.values(CaptureErrorCode)) {
      expect(CAPTURE_ERROR_HINTS[code]).toBeTruthy();
      expect(CAPTURE_ERROR_HINTS[code].length).toBeGreaterThan(20);
    }
  });
});
