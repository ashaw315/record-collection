import { defineConfig } from 'vitest/config';

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
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Playwright specs live in e2e/ and are run by `npm run test:e2e`.
    exclude: ['node_modules/**', '.next/**', 'e2e/**'],
  },
});
