/**
 * Unit tests for ducking ramps (mocked GainNode).
 */
import { describe, expect, it } from 'vitest';
import { applyDuck, applyUnduck } from './ducking.js';

/**
 * @returns {{node: object, calls: Array<{fn: string, args: number[]}>}} mock
 */
function mockGainNode(startValue = 1) {
  const calls = [];
  const value = startValue;
  const gain = {
    value,
    cancelScheduledValues: (t) => calls.push({ fn: 'cancel', args: [t] }),
    setValueAtTime: (v, t) => calls.push({ fn: 'set', args: [v, t] }),
    linearRampToValueAtTime: (v, t) => calls.push({ fn: 'ramp', args: [v, t] }),
  };
  return { node: { gain, context: { currentTime: 10 } }, calls };
}

describe('applyDuck', () => {
  it('ramps to the duck level over the ramp window', () => {
    const { node, calls } = mockGainNode(1);
    applyDuck(node);
    expect(calls).toEqual([
      { fn: 'cancel', args: [10] },
      { fn: 'set', args: [1, 10] },
      { fn: 'ramp', args: [0.15, 10.15] },
    ]);
  });

  it('honours custom level and ramp time', () => {
    const { node, calls } = mockGainNode(0.5);
    applyDuck(node, { level: 0.2, rampMs: 500 });
    expect(calls[2]).toEqual({ fn: 'ramp', args: [0.2, 10.5] });
  });
});

describe('applyUnduck', () => {
  it('ramps back to unity gain', () => {
    const { node, calls } = mockGainNode(0.15);
    applyUnduck(node);
    expect(calls[2]).toEqual({ fn: 'ramp', args: [1, 10.15] });
  });
});
