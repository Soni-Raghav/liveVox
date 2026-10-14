/**
 * Unit tests for the rolling FrameBuffer.
 */
import { describe, expect, it } from 'vitest';
import { FrameBuffer } from './frameBuffer.js';

describe('FrameBuffer', () => {
  it('slices contiguous audio between timestamps', () => {
    const buffer = new FrameBuffer(30);
    buffer.push(new Float32Array([1, 2]), 1000);
    buffer.push(new Float32Array([3, 4]), 1100);
    buffer.push(new Float32Array([5, 6]), 1200);
    const slice = buffer.slice(1050, 1200);
    expect(Array.from(slice)).toEqual([3, 4]);
  });

  it('returns empty for a range with no frames', () => {
    const buffer = new FrameBuffer(30);
    buffer.push(new Float32Array([1]), 1000);
    expect(buffer.slice(5000, 6000).length).toBe(0);
  });

  it('evicts oldest frames beyond the rolling window', () => {
    // Window of 1 second = 16000 samples = 16 frames of 1000 samples.
    const buffer = new FrameBuffer(1);
    for (let i = 0; i < 40; i += 1) {
      buffer.push(new Float32Array(1000).fill(i), i * 100);
    }
    // 40 frames in, only the last 16 (16000 samples) remain.
    expect(buffer.totalSamples).toBe(16000);
    expect(buffer.frames.length).toBe(16);
    expect(buffer.frames[0].ts).toBe(2400);
  });

  it('clear drops everything', () => {
    const buffer = new FrameBuffer(30);
    buffer.push(new Float32Array([1]), 1000);
    buffer.clear();
    expect(buffer.frames.length).toBe(0);
    expect(buffer.totalSamples).toBe(0);
  });
});
