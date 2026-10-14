/**
 * Unit tests for the sync engine (deterministic fake clock).
 */
import { describe, expect, it } from 'vitest';
import { SyncEngine } from './syncEngine.js';

/** Deterministic clock fixture. */
function clock(start = 1000000) {
  let now = start;
  return { now: () => now, advance: (ms) => (now += ms) };
}

describe('SyncEngine latency tracking', () => {
  it('computes capture→TTS latency per segment', () => {
    const t = clock();
    const sync = new SyncEngine({ now: t.now });
    sync.startSegment('s1', t.now());
    t.advance(1200);
    sync.record('s1', 'asr');
    t.advance(800);
    const latency = sync.ttsStarted('s1');
    expect(latency).toBe(2000);
    expect(sync.segmentLatency('s1')).toBe(2000);
  });

  it('smooths the live latency with an EMA', () => {
    const t = clock();
    const sync = new SyncEngine({ now: t.now, emaAlpha: 0.5 });
    sync.startSegment('a', t.now());
    t.advance(1000);
    sync.ttsStarted('a');
    expect(sync.ewmaLatencyMs).toBe(1000);
    sync.startSegment('b', t.now());
    t.advance(3000);
    sync.ttsStarted('b');
    expect(sync.ewmaLatencyMs).toBe(2000); // (1000 + 3000) / 2
  });

  it('ignores unknown segments gracefully', () => {
    const sync = new SyncEngine();
    expect(sync.ttsStarted('ghost')).toBeNull();
    expect(sync.segmentLatency('ghost')).toBeNull();
  });
});

describe('SyncEngine drift assessment', () => {
  it('recommends nothing when within budget', () => {
    const sync = new SyncEngine({ maxDriftMs: 4000 });
    const result = sync.assess({ pendingAges: [500, 1500] });
    expect(result).toEqual({ dropCount: 0, driftBoost: 1, flushTts: false });
  });

  it('counts queued work past the drift budget for dropping', () => {
    const sync = new SyncEngine({ maxDriftMs: 4000 });
    const result = sync.assess({ pendingAges: [5200, 4800, 2000] });
    expect(result.dropCount).toBe(2);
    expect(result.flushTts).toBe(true);
  });

  it('boosts the TTS rate with the excess and caps at the maximum', () => {
    const sync = new SyncEngine({ maxDriftMs: 4000, rateBoostMax: 1.3 });
    // Oldest pending 5000 ms → excess 1000 → boost 1 + 1000/4000 * 0.5 = 1.125
    expect(sync.assess({ pendingAges: [5000] }).driftBoost).toBeCloseTo(1.125, 3);
    // Way over budget → clamped at 1.3.
    expect(sync.assess({ pendingAges: [20000] }).driftBoost).toBe(1.3);
  });

  it('uses the EMA latency when no queue is pending', () => {
    const t = clock();
    const sync = new SyncEngine({ now: t.now, maxDriftMs: 4000 });
    sync.startSegment('a', t.now);
    t.advance(6000);
    sync.ttsStarted('a');
    const result = sync.assess({ pendingAges: [] });
    expect(result.flushTts).toBe(true);
    expect(result.driftBoost).toBeCloseTo(1.25, 3); // 1 + 2000/4000 * 0.5
  });

  it('reset clears everything', () => {
    const sync = new SyncEngine();
    sync.startSegment('a', 1);
    sync.reset();
    expect(sync.ewmaLatencyMs).toBeNull();
    expect(sync.segments.size).toBe(0);
  });
});
