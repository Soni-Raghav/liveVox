/**
 * WorkerClient — typed request/reply RPC on top of postMessage.
 *
 * WHY: workers in this project speak a small message protocol
 * (see the header comments of asr.worker.js / translate.worker.js).
 * Wrapping it in promises keeps call sites readable, gives every request a
 * correlation id, and centralizes crash handling: if the worker dies, all
 * pending requests are rejected and an `onCrash` callback lets the
 * orchestrator decide whether to restart it.
 *
 * Message shapes on the wire:
 *   main → worker: { type, id, payload }
 *   worker → main: { type: 'reply', id, ok, payload | error }
 *                 { type: 'notify', kind, payload }   (progress etc.)
 */
import { createLogger } from './logger.js';

const log = createLogger('workerClient');

export class WorkerClient {
  /**
   * @param {URL|string} url - module worker URL
   * @param {{name?: string, onCrash?: Function}} [options]
   */
  constructor(url, options = {}) {
    this.name = options.name ?? 'worker';
    this.url = url;
    this.onCrash = options.onCrash;
    /** @type {Map<number, {resolve: Function, reject: Function}>} */
    this.pending = new Map();
    this.nextId = 1;
    /** @type {Set<(note: {kind: string, payload: object}) => void>} */
    this.notificationListeners = new Set();
    this.#spawn();
  }

  /** (Re)create the underlying Worker — also used after a crash. */
  #spawn() {
    this.worker = new Worker(this.url, { type: 'module' });
    this.worker.onmessage = ({ data }) => this.#onMessage(data);
    this.worker.onerror = (event) => {
      const message = `worker "${this.name}" crashed: ${event.message ?? 'unknown error'}`;
      log.error(message);
      // Fail every in-flight request — the worker is gone.
      for (const { reject } of this.pending.values()) reject(new Error(message));
      this.pending.clear();
      this.onCrash?.(message);
    };
  }

  /**
   * @param {{type: string, id?: number, ok?: boolean, kind?: string,
   *          payload?: object, error?: string}} data
   */
  #onMessage(data) {
    if (data.type === 'reply') {
      const entry = this.pending.get(data.id);
      if (!entry) return;
      this.pending.delete(data.id);
      if (data.ok) entry.resolve(data.payload);
      else entry.reject(new Error(data.error ?? 'worker error'));
      return;
    }
    if (data.type === 'notify') {
      for (const listener of this.notificationListeners) listener(data);
    }
  }

  /**
   * Send a request and await its reply.
   *
   * @param {string} type - message type, e.g. 'transcribe'
   * @param {object} payload - message payload
   * @param {{transfer?: Transferable[]}} [options] - buffers to transfer
   * @returns {Promise<object>} reply payload
   */
  send(type, payload, options = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type, id, payload }, options.transfer ?? []);
    });
  }

  /**
   * Subscribe to worker notifications (progress, ready, ...).
   *
   * @param {(note: {kind: string, payload: object}) => void} listener
   * @returns {() => void} unsubscribe function
   */
  onNotify(listener) {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  /** Terminate the worker (app unload / model swap). */
  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}
