/**
 * Unit tests for the central logger (ring buffer, leveling, tagged output).
 */
import { describe, expect, it } from 'vitest';
import { clearLogs, createLogger, getRecentLogs } from './logger.js';

describe('createLogger', () => {
  it('buffers tagged entries', () => {
    clearLogs();
    const log = createLogger('test');
    log.info('hello world');
    const entries = getRecentLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'info', tag: 'test', message: 'hello world' });
    expect(entries[0].t).toBeTruthy();
  });

  it('keeps at most the ring buffer size entries', () => {
    clearLogs();
    const log = createLogger('ring');
    for (let i = 0; i < 320; i += 1) log.debug(`entry ${i}`);
    const entries = getRecentLogs(1000);
    expect(entries).toHaveLength(300);
    // The oldest entries were evicted; the newest is the last written.
    expect(entries[entries.length - 1].message).toBe('entry 319');
  });

  it('returns only the requested tail', () => {
    clearLogs();
    const log = createLogger('tail');
    log.info('a');
    log.warn('b');
    log.error('c');
    const tail = getRecentLogs(2);
    expect(tail.map((e) => e.message)).toEqual(['b', 'c']);
  });
});
