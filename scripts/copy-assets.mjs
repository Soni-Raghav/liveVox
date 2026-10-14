#!/usr/bin/env node
/**
 * Self-hosts third-party runtime assets into public/vendor so the installed
 * PWA never depends on a CDN:
 *   - ONNX Runtime Web WASM binaries → public/vendor/ort
 *     · jsep build (from @huggingface/transformers/dist) — used by the ML
 *       workers (WebGPU + WASM)
 *     · classic build (from onnxruntime-web/dist) — used by the Silero VAD
 *       on the main thread
 *     Both live in ONE directory because env.backends.onnx.wasm.wasmPaths
 *     and vad-web's onnxWASMBasePath point at the same folder.
 *   - Silero VAD model + worklet bundle → public/vendor/vad
 *
 * Runs automatically before `dev` and `build` (npm pre-scripts). public/vendor
 * is git-ignored because it is fully regenerable from node_modules.
 */
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';

/**
 * @typedef {{from: string, dir: string, pattern: RegExp, label: string}} Source
 * @typedef {{from: string, file: string}} CopyJob
 */

/** @type {Source[]} */
const SOURCES = [
  {
    from: 'node_modules/@huggingface/transformers/dist',
    dir: 'public/vendor/ort',
    pattern: /^ort-wasm-simd.*\.(wasm|mjs)$/,
    label: 'ONNX Runtime WASM (jsep, ML workers)',
  },
  {
    from: 'node_modules/onnxruntime-web/dist',
    dir: 'public/vendor/ort',
    pattern: /^ort-wasm-simd.*\.(wasm|mjs)$/,
    label: 'ONNX Runtime WASM (classic, Silero VAD)',
  },
  {
    from: 'node_modules/@ricky0123/vad-web/dist',
    dir: 'public/vendor/vad',
    pattern: /^(vad\.worklet\.bundle\.min\.js|silero_vad.*\.onnx)$/,
    label: 'Silero VAD',
  },
];

/**
 * Collect matching files from all sources before touching the target dirs
 * (several sources share public/vendor/ort, so we must not wipe it per source).
 *
 * @returns {Promise<CopyJob[]>} flat list of copy operations
 */
async function collectJobs() {
  /** @type {CopyJob[]} */
  const jobs = [];
  for (const source of SOURCES) {
    if (!existsSync(source.from)) {
      console.warn(`[copy-assets] WARN: ${source.from} not found — run npm install first`);
      continue;
    }
    const files = (await readdir(source.from)).filter((f) => source.pattern.test(f));
    if (files.length === 0) {
      console.warn(`[copy-assets] WARN: no files matched ${source.pattern} in ${source.from}`);
      continue;
    }
    for (const file of files) {
      jobs.push({ from: `${source.from}/${file}`, file: `${source.dir}/${file}` });
    }
  }
  return jobs;
}

const jobs = await collectJobs();
if (jobs.length === 0) {
  console.warn('[copy-assets] WARN: nothing to copy — app will need a CDN at runtime');
}
const dirs = [...new Set(jobs.map((j) => j.file.split('/').slice(0, -1).join('/')))];
for (const dir of dirs) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}
for (const job of jobs) {
  await copyFile(job.from, job.file);
  console.log(`[copy-assets] ${job.file}`);
}
console.log(`[copy-assets] done — ${jobs.length} files self-hosted`);
