/**
 * LRUCache — fixed-size least-recently-used cache (translation memoization).
 *
 * WHY: repeated phrases (greetings, show formats, recaps) are common in
 * video speech. Caching their translations removes 100% of the engine
 * latency for repeats and protects the rate-limited MyMemory fallback.
 * Map insertion order is exploited for recency: `get` re-inserts the entry.
 */
export class LRUCache {
  /**
   * @param {number} maxEntries - capacity (from TRANSLATION.CACHE_MAX_ENTRIES)
   */
  constructor(maxEntries) {
    if (!Number.isFinite(maxEntries) || maxEntries < 1) {
      throw new RangeError('maxEntries must be a positive number');
    }
    this.maxEntries = maxEntries;
    /** @type {Map<string, *>} */
    this.map = new Map();
  }

  /**
   * @returns {number} number of cached entries
   */
  get size() {
    return this.map.size;
  }

  /**
   * Fetch a value and mark it as most recently used.
   *
   * @param {string} key
   * @returns {*} cached value or undefined
   */
  get(key) {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key);
    // Refresh recency: delete + re-insert moves the entry to the end.
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  /**
   * Insert/overwrite a value, evicting the least recently used entry when
   * the cache is over capacity.
   *
   * @param {string} key
   * @param {*} value
   * @returns {void}
   */
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxEntries) {
      // Map iteration order = insertion order; first key is the LRU entry.
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  /**
   * Membership check WITHOUT refreshing recency (cheap probe).
   *
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.map.has(key);
  }

  /**
   * @param {string} key
   * @returns {boolean} true if an entry was removed
   */
  delete(key) {
    return this.map.delete(key);
  }

  /** Empty the cache. */
  clear() {
    this.map.clear();
  }
}
