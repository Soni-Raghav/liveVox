/**
 * Unit tests for the bounded queue.
 */
import { describe, expect, it, vi } from 'vitest';
import { BoundedQueue } from './queue.js';

describe('BoundedQueue', () => {
  it('is FIFO', () => {
    const queue = new BoundedQueue(5);
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    expect(queue.dequeue()).toBe(1);
    expect(queue.dequeue()).toBe(2);
    expect(queue.size).toBe(1);
  });

  it('drops the oldest item when full (default policy)', () => {
    const onDrop = vi.fn();
    const queue = new BoundedQueue(2, { onDrop });
    queue.enqueue('a');
    queue.enqueue('b');
    expect(queue.enqueue('c')).toBe(true); // 'a' is sacrificed
    expect(onDrop).toHaveBeenCalledWith('a');
    expect(queue.toArray()).toEqual(['b', 'c']);
    expect(queue.droppedCount).toBe(1);
  });

  it('rejects the newest item under the newest policy', () => {
    const onDrop = vi.fn();
    const queue = new BoundedQueue(2, { policy: 'newest', onDrop });
    queue.enqueue('a');
    queue.enqueue('b');
    expect(queue.enqueue('c')).toBe(false);
    expect(onDrop).toHaveBeenCalledWith('c');
    expect(queue.toArray()).toEqual(['a', 'b']);
  });

  it('dropOldest removes exactly n oldest items', () => {
    const queue = new BoundedQueue(10);
    for (let i = 1; i <= 5; i += 1) queue.enqueue(i);
    expect(queue.dropOldest(2)).toBe(2);
    expect(queue.toArray()).toEqual([3, 4, 5]);
    expect(queue.droppedCount).toBe(2);
    expect(queue.dropOldest(99)).toBe(3); // clamped to size
    expect(queue.size).toBe(0);
  });

  it('peek does not dequeue and clear empties', () => {
    const queue = new BoundedQueue(3);
    queue.enqueue(1);
    expect(queue.peek()).toBe(1);
    expect(queue.size).toBe(1);
    queue.clear();
    expect(queue.size).toBe(0);
    expect(queue.dequeue()).toBeUndefined();
  });

  it('rejects invalid capacities', () => {
    expect(() => new BoundedQueue(0)).toThrow(RangeError);
  });
});
