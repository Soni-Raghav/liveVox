/**
 * ErrorBoundary — top-level crash guard.
 *
 * NOTE: this is the app's only class component. React requires
 * componentDidCatch/getDerivedStateFromError lifecycle methods, which exist
 * ONLY on class components — there is no hook equivalent. Everything else
 * in LiveVox is functional.
 *
 * The fallback shows the error plus the last log lines from the central
 * logger, and a reload button.
 */
import React from 'react';
import { createLogger, getRecentLogs } from '../lib/logger.js';

const log = createLogger('errorboundary');

/**
 * @param {Error} error
 * @returns {string} first log lines mentioning the failing stack, if any
 */
function relevantLogs(error) {
  const logs = getRecentLogs(30);
  const interesting = logs.filter(
    (entry) =>
      entry.level === 'error' ||
      (error?.message && entry.message.toLowerCase().includes(error.message.slice(0, 20).toLowerCase()))
  );
  return interesting
    .slice(-5)
    .map((entry) => `[${entry.level}] [${entry.tag}] ${entry.message}`)
    .join('\n');
}

/**
 * @param {{error: Error|null}} props
 * @returns {JSX.Element} fallback UI
 */
function Fallback({ error }) {
  return (
    <div role="alert" className="flex min-h-screen items-center justify-center bg-slate-950 p-6">
      <div className="w-full max-w-lg rounded-xl border border-rose-900 bg-slate-900 p-6 text-slate-100 shadow-xl">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-400">
          LiveVox hit an unexpected error. Reloading usually fixes it; your settings and glossary
          are preserved.
        </p>
        <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-rose-300">
          {error?.message ?? 'Unknown error'}
          {relevantLogs(error) ? `\n\n${relevantLogs(error)}` : ''}
        </pre>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400"
        >
          Reload LiveVox
        </button>
      </div>
    </div>
  );
}

/** Top-level error boundary. */
export default class ErrorBoundary extends React.Component {
  /**
   * @param {{children: JSX.Element}} props
   */
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  /**
   * @param {Error} error
   * @returns {{error: Error}} next state
   */
  static getDerivedStateFromError(error) {
    return { error };
  }

  /**
   * @param {Error} error
   * @returns {void}
   */
  componentDidCatch(error) {
    // Route through the central logger so the ring buffer has it too.
    log.error(`unhandled UI error: ${error.message}`);
  }

  /**
   * @returns {JSX.Element}
   */
  render() {
    if (this.state.error) return <Fallback error={this.state.error} />;
    return this.props.children;
  }
}
