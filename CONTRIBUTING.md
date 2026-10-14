# Contributing to LiveVox

Thanks for helping build LiveVox! This document covers the dev workflow and
the conventions the codebase enforces in review.

## Development setup

```bash
npm install
npm run dev      # http://localhost:5173
```

Node 18+ required (CI uses 20). `npm install` also self-hosts the ONNX
Runtime WASM + Silero VAD files into `public/vendor/` via the `prepare`
hook — that directory is git-ignored and fully regenerable.

## Quality gates (must pass before every commit)

```bash
npm run lint         # ESLint — zero errors
npm test             # Vitest — all tests green
npm run build        # production PWA build succeeds
```

Husky + lint-staged run automatically on `git commit` (lint + prettier on
staged files).

## Git workflow

- One feature branch per unit of work: `feat/<topic>`, `fix/<topic>`,
  `docs/<topic>`, `chore/<topic>`.
- Merges into `main` via `--no-ff` so each milestone stays reviewable.
- **Conventional Commits** — `feat:`, `fix:`, `docs:`, `chore:`,
  `refactor:`, `test:`; scope encouraged, e.g. `feat(m4): tts ducking`.

## Code conventions

- **Plain JavaScript ES2022.** No TypeScript, no `tsc` — types are expressed
  through JSDoc (`@param`, `@returns`, `@typedef`) and checked in review.
- **No magic numbers.** Every tunable value lives in
  `src/lib/constants.js` with a comment explaining its trade-off.
- **One logger.** `src/lib/logger.js` is the only module allowed to touch
  `console` (ESLint enforces it). Use `createLogger('tag')`.
- **JSDoc on every exported function, hook and component.** Each file has a
  header comment explaining its responsibility.
- **Small, single-responsibility modules** (~150 lines). Components are
  presentational; hooks adapt browser APIs; `src/pipeline` and `src/audio`
  are framework-free and unit-testable.
- **Workers document their message protocol** in the file header — keep that
  comment in sync when you change a message shape.
- **Comments explain WHY** (timing, backpressure, browser quirks), not what.

## Testing

- Unit tests live next to the module as `*.test.js(x)` (Vitest + jsdom +
  React Testing Library).
- Deterministic logic (queues, sync math, normalizer, glossary, cache,
  exporters, ducking ramps, TTS picking) must have tests.
- New UI components need at least render + interaction tests when they carry
  logic; purely presentational ones may rely on review.
- Manual E2E (real audio + models) follows the README test plan.

## PR checklist

- [ ] `npm run lint`, `npm test`, `npm run build` all pass
- [ ] No new magic numbers (moved to `constants.js`)
- [ ] No `console.*` outside `logger.js`
- [ ] Worker protocol comments updated if messages changed
- [ ] New/changed behaviour documented in README/ARCHITECTURE when
      user-visible or architectural
- [ ] Commit messages follow Conventional Commits

## Reporting bugs

Open an issue with: browser + version, OS, what you expected vs. what
happened, the latency badge value, and anything from the console (the
tagged `[livevox]`-style log lines are enough — no audio or transcripts are
ever stored, so there is nothing to attach).
