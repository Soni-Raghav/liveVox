/**
 * ESLint configuration for LiveVox.
 * React 18 + hooks + jsx-a11y, Prettier-compatible. Bare `console.*` is
 * forbidden everywhere except src/lib/logger.js (the single output choke
 * point). Web workers and the service worker get dedicated environments.
 */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  plugins: ['react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'prettier',
  ],
  rules: {
    // All output goes through src/lib/logger.js.
    'no-console': 'error',
    'react/prop-types': 'off',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    eqeqeq: ['error', 'smart'],
  },
  overrides: [
    // Node-context files (config + build scripts).
    { files: ['vite.config.js', 'scripts/**'], env: { browser: false, node: true } },
    // AudioWorklet + ML workers run in worker scopes (self, postMessage).
    {
      files: ['src/workers/**', 'src/audio/frameBuffer.js'],
      env: { browser: false, worker: true },
    },
    // The resample worklet: AudioWorkletGlobalScope globals.
    {
      files: ['src/audio/resample.worklet.js'],
      env: { browser: false, worker: true },
      globals: {
        AudioWorkletProcessor: 'readonly',
        registerProcessor: 'readonly',
        sampleRate: 'readonly',
        currentTime: 'readonly',
      },
    },
    // The service worker: workbox manifest injection global + SW scope.
    {
      files: ['src/sw.js'],
      env: { browser: false, serviceworker: true },
      globals: { __WB_MANIFEST: 'readonly' },
    },
    // The logger is the only module allowed to touch the console.
    { files: ['src/lib/logger.js'], rules: { 'no-console': 'off' } },
    // Tests: node globals for vitest imports.
    { files: ['src/test/**', '**/*.test.{js,jsx}'], env: { node: true } },
  ],
  ignorePatterns: ['dist', 'dev-dist', 'node_modules', 'coverage', 'public/vendor', '*.cjs'],
};
