import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Vitest runs outside Next.js, so it does not inherit the .env loading Next
// does. Without this, TEST_DATABASE_URL is unset and global setup throws — the
// suite passed only when the caller happened to export it inline, which CI does
// not do (SPEC.md §14 requires `npm test` to pass as a plain script).
//
// dotenv never overwrites an already-set value, so an explicitly exported
// TEST_DATABASE_URL still wins and pointing a run at a different local database
// keeps working.
config({ path: '.env.test', quiet: true });

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Server modules are marked with `import 'server-only'` (CLAUDE.md §6). That
  // package resolves to a throwing stub unless the `react-server` condition is
  // set, which would fail every server-side unit test at import time. Vitest
  // loads test modules through the SSR pipeline, so the condition belongs here
  // rather than under `resolve`.
  ssr: {
    resolve: {
      conditions: ['react-server', 'node'],
      externalConditions: ['react-server', 'node'],
    },
  },
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    // Every integration test shares one local Postgres database and truncates
    // it in beforeEach (CLAUDE.md §2). Running files concurrently means one
    // file's truncate lands inside another file's test, which surfaces as rows
    // vanishing mid-test in a file nobody edited, with a different subset
    // failing each run. Serializing files is the price of a shared database.
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Playwright specs live in e2e/ and are run by `npm run test:e2e`.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
  },
});
