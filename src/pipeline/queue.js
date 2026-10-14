/**
 * BoundedQueue — fixed-capacity FIFO with overflow policy.
 *
 * WHY: every pipeline stage must have backpressure so a slow stage can
 * never accumulate unbounded memory. Per the spec, the capture side drops
 * the OLDEST work when full (latency budget beats completeness); other
 * stages may prefer rejecting the newest. Pure data structure — tested.
 */
export class BoundedQueue {
  /**
   * @param {number} maxSize - capacity (from SYNC constants)
   * @param {{policy?: 'oldest'|'newest', onDrop?: (item: *) => void}} [options]
   */
  constructor(maxSize, options = {}) {
    if (!Number.isFinite(maxSize) || maxSize < 1) {
      throw new RangeError('maxSize must be a positive number');
    }
    this.maxSize = maxSize;
    this.policy = options.policy ?? 'oldest';
    this.onDrop = options.onDrop;
    /** @type {Array<*>} */
    this.items = [];
    this.droppedCount = 0;
  }

  /** @returns {number} current number of items */
  get size() {
    return this.items.length;
  }

  /**
   * Enqueue an item, applying the overflow policy.
   *
   * @param {*} item
   * @returns {boolean} true when the item is queued
   */
  enqueue(item) {
    if (this.items.length < this.maxSize) {
      this.items.push(item);
      return true;
    }
    this.droppedCount += 1;
    if (this.policy === 'newest') {
      this.onDrop?.(item);
      return false;
    }
    // 'oldest': the head has missed its latency budget — sacrifice it.
    const sacrificed = this.items.shift();
    this.onDrop?.(sacrificed);
    this.items.push(item);
    return true;
  }

  /**
   * @returns {*|undefined} head item (removed), or undefined when empty
   */
  dequeue() {
    return this.items.shift();
  }

  /**
   * @returns {*|undefined} head item without removing it
   */
  peek() {
    return this.items[0];
  }

  /**
   * Drop the n oldest items (sync-engine drift control).
   *
   * @param {number} n
   * @returns {number} number actually dropped
   */
  dropOldest(n) {
    const count = Math.min(n, this.items.length);
    for (let i = 0; i < count; i += 1) {
      // NOTE: shift() must run even without an onDrop callback — an optional
      // call `this.onDrop?.(this.items.shift())` would skip the argument
      // evaluation entirely when onDrop is undefined.
      const dropped = this.items.shift();
      this.onDrop?.(dropped);
    }
    this.droppedCount += count;
    return count;
  }

  /**
   * @returns {Array<*>} shallow copy of the items
   */
  toArray() {
    return [...this.items];
  }

  /** Empty the queue. */
  clear() {
    this.items = [];
  }
}
