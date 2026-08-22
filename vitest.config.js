// vitest.config.js — unit / integration tests.
//
// Excludes:
//   - tests/server/*.spec.js — Playwright e2e tests, run via
//     `npm run test:e2e` (which uses playwright.config.js). Vitest
//     tries to load any *.spec.js by default; without this exclude
//     it parses Playwright's `test.describe()` calls and fails
//     with "Playwright Test did not expect test.describe() to be
//     called here" (since vitest isn't Playwright Test).
//
//   - node_modules, .venv, server/__pycache__, test-results,
//     playwright-report — irrelevant build artifacts.
//
// ADR-0034 v0.18.2 fix-up: the sidebar sub-nav Playwright suite
// lives at tests/server/subnav.spec.js and needs the same exclusion
// as tests/server/sidebar.spec.js.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: [
      'node_modules/**',
      '.venv/**',
      'server/__pycache__/**',
      'test-results/**',
      'playwright-report/**',
      // Playwright e2e specs — run via `npm run test:e2e`.
      'tests/server/**',
    ],
    // v0.18.4 fix-up: most vitest suites boot a fresh vcm-server on a
    // dedicated port in beforeAll(). Default 'threads' pool + the
    // default --file-parallelism=true runs test files concurrently,
    // so two suites grab the same free port before either opens the
    // listening socket → ECONNREFUSED in sibling suites. Disabling
    // file parallelism makes vitest run each .test.js file
    // sequentially within a single worker. Runtime ~55s for 436
    // tests, acceptable for CI.
    // (Earlier 'pool: forks, singleFork: true' was a Vitest 0.x
    // shim that does nothing in Vitest 1.x — the right knob in 1.x
    // is `--fileParallelism=false` / `fileParallelism: false`.)
    fileParallelism: false,
  },
});