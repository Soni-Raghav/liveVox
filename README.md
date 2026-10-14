<div align="center">

# LiveVox

**Real-time video & audio translation — 100 % in your browser.**

Free. Offline-capable. No API keys. No backend. Audio never leaves your device.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/YOUR_USERNAME/livevox/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/livevox/actions/workflows/ci.yml)

</div>

## What is LiveVox?

Play any video in a browser tab — YouTube, Netflix, a local file — share its
tab audio with LiveVox, and a few seconds later you hear the speech in your
language while the original audio is automatically ducked down. A live
two-column transcript (original | translation) runs alongside, exportable as
`.txt` or `.srt`.

Everything runs on-device: Whisper recognizes speech, NLLB-200 translates,
the browser's speech synthesis speaks. After a one-time model download, the
installed app works entirely offline — plane-mode included.

> Replace `YOUR_USERNAME` in the CI badge above after you fork/create the repo.

## How it works

1. **Share tab audio** — LiveVox calls `getDisplayMedia` and asks you to pick
   the tab playing the video (tick **“Share tab audio”**).
2. **Segment** — a 100 ms AudioWorklet resamples to 16 kHz mono; Silero VAD
   splits the stream into speech segments.
3. **Recognize** — Whisper (tiny or base, quantized) runs in a Web Worker
   with WebGPU acceleration when available, WASM otherwise.
4. **Translate** — NLLB-200 distilled 600M translates in a second worker;
   a custom glossary fixes names and jargon; an LRU cache avoids rework.
5. **Speak** — `speechSynthesis` speaks the translation at a rate fitted to
   the original segment's duration; while it speaks, the original audio is
   ducked to ~15 %.
6. **Stay in sync** — a sync engine caps drift (default 4 s) by boosting TTS
   rate and dropping stale work; the latency badge shows real end-to-end delay.

## Key features

- 🎙️ **Tab audio capture** with play-through, level meter and per-channel volume mixer
- 🔉 **Auto-ducking** — original audio dips while the translation speaks
- 🌍 **Auto language detection** + manual override; target language defaults to your system language
- ⚡ **Fast / Quality modes** — Whisper tiny (≈45 MB) vs base (≈80 MB)
- 📝 **Live dual transcript** with auto-scroll and partials faded until final
- 📤 **Export** transcript as `.txt` or `.srt`
- 📖 **Glossary editor** — your terms applied before/after translation
- 🖼️ **Document Picture-in-Picture mini player** (Chrome/Edge) — control LiveVox while watching the video
- 📴 **Offline-first PWA** — self-hosted ONNX Runtime + VAD assets; models cached with `navigator.storage.persist()`
- ⌨️ **Keyboard shortcuts** — `Space` start/stop, `M` mute translation
- 🌙 Dark mode, full keyboard navigation, ARIA labelling
- 🔒 **Privacy** — audio is processed and discarded on-device; nothing is recorded, stored or uploaded. The only opt-in network feature (MyMemory text fallback) is OFF by default and clearly labelled.

## Requirements

- **Chrome or Edge 116+ on desktop** (tab-audio capture + Document PiP).
  Firefox/Safari have limited tab-audio capture — the app shows a
  compatibility banner and falls back where possible.
- Speakers/headphones; a microphone is _not_ needed.
- ~1 GB free storage for the one-time model download (Whisper ≈ 45/80 MB +
  NLLB ≈ 600 MB, cached once).
- WebGPU is used when available; otherwise WASM (single- or multi-threaded
  depending on cross-origin isolation).

## Getting started (local development)

```bash
git clone https://github.com/YOUR_USERNAME/livevox.git
cd livevox
npm install        # also self-hosts ONNX/VAD assets into public/vendor/
npm run dev        # → http://localhost:5173
```

First run: the Model Manager downloads Whisper + NLLB once (progress bars,
retry on failure). Then press **Start translation**, pick your video tab,
tick **Share tab audio**, and play.

Install as an app via the browser's install icon — after that, LiveVox
works offline (devtools → Network → “Offline” to verify).

### npm scripts

| Script                            | Purpose                                        |
| --------------------------------- | ---------------------------------------------- |
| `npm run dev`                     | Vite dev server (COOP/COEP headers enabled)    |
| `npm run build`                   | Production PWA build (`dist/`)                 |
| `npm run preview`                 | Serve the production build locally             |
| `npm run lint` / `lint:fix`       | ESLint                                         |
| `npm run format` / `format:check` | Prettier                                       |
| `npm test` / `test:watch`         | Vitest unit tests                              |
| `npm run icons`                   | Regenerate PWA icons from `public/favicon.svg` |

## Deployment

### GitHub Pages (default, zero-config)

Push `main` — `.github/workflows/deploy.yml` builds with
`VITE_BASE=/livevox/` and publishes to Pages. In repo Settings → Pages,
choose **GitHub Actions** as the source. If you rename the repo, update
`VITE_BASE` in the workflow to `/<repo-name>/`.

The service worker serves COOP/COEP headers itself, so multi-threaded WASM
works even on GitHub Pages (see `docs/ARCHITECTURE.md` →
_Cross-origin isolation_).

### Netlify / Cloudflare Pages

Deploy with build command `npm run build`, publish directory `dist`.
`public/_headers` (and `netlify.toml`) already set the COOP/COEP headers for
the first uncached load.

## Performance expectations

End-to-end latency (speech → translated speech) is typically **3–6 s** on a
modern laptop — segmentation, Whisper and NLLB inference dominate. The badge
in the header turns amber above 3 s and red above 5 s. If drift exceeds your
“max drift” setting (default 4 s, adjustable in Settings), the sync engine
speeds the TTS up to 1.3× and drops the oldest queued audio.

## Troubleshooting

| Symptom                    | Fix                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| “No audio track” / silence | Re-share and **tick “Share tab audio”** in the picker; some DRM streams (e.g. Netflix on some platforms) may not expose audio |
| Everything is slow         | Switch to **Fast** mode (Whisper tiny); close other GPU-heavy tabs; check the badge — red means the device is saturated       |
| No translated voice        | Settings → TTS: pick a voice matching your target language; some OS voices are cloud-only and unavailable offline             |
| Models vanished after days | Browsers can evict storage under pressure — Settings → Storage → re-request persistent storage, then re-download              |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — pipeline, threading, offline strategy
- [Contributing](CONTRIBUTING.md) — workflow, conventions, PR checklist

## License

[MIT](LICENSE) © LiveVox contributors
