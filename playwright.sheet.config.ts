import { defineConfig, devices } from '@playwright/test';

/**
 * **The contact sheet, against the real collection.**
 *
 * A separate configuration on purpose: the ordinary harness forces the test
 * environment, whose driver refuses anything but the local database, and
 * its global setup truncates and seeds while its cleanup deletes. None of
 * that may touch production. This one has no global setup and no teardown,
 * starts the server in the ordinary development environment so Next reads
 * `.env.local` and the driver reaches production Neon over HTTP, and runs
 * only specs under `e2e/sheet`, which load pages and register no cleanup.
 * Nothing in the run writes to the database: the session is a signed
 * cookie, and every request the sheet makes is a GET.
 *
 * The login password is read from `E2E_PASSWORD` at run time and nowhere
 * else; the spec refuses to start without it rather than falling back to
 * the test hash. Run it as:
 *
 *     E2E_PASSWORD='…' npx playwright test --config playwright.sheet.config.ts
 */
const PORT = process.env.SHEET_PORT ?? '3200';
const baseURL = process.env.SHEET_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e/sheet',
  testMatch: /.*\.sheet\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 1_800_000,
  reporter: [['list']],
  use: { baseURL, trace: 'off', ...devices['Desktop Chrome'] },
  projects: [{ name: 'sheet', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    /* No NODE_ENV=test: the ordinary development environment, so `.env.local` is read and the production driver is chosen. */
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    /* A dry run against a server already started by hand (for instance the test harness's) sets SHEET_REUSE_SERVER=1. */
    reuseExistingServer: process.env.SHEET_REUSE_SERVER === '1',
    timeout: 120_000,
  },
});
