import { defineConfig, devices } from '@playwright/test';

// 3100 rather than 3000, so an E2E run never collides with a dev server the
// developer already has open.
const PORT = process.env.E2E_PORT ?? '3100';
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  /**
   * Clears rows accumulated by PREVIOUS runs, so every observation is about the
   * run that produced it. Fixture debris caused two false findings in step 5;
   * see e2e/global-setup.ts. Asserted by test/repo/e2e-reset.test.ts.
   */
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  /**
   * One retry locally, and the reasoning matters more than the number.
   *
   * A retry normally hides bugs, and it hid one here for three steps: 'clicking
   * the active chip clears it' failed EVERY full run and was read as flake
   * because a different spec failed each time. It was a real defect — the
   * assertion ran against an unfiltered collection, and at 68 records the
   * 50-per-page cut pushed its record onto page 2.
   *
   * What is left after that fix is two residual mechanisms at roughly one
   * failure per run, both diagnosed as harness rather than app: the dev server
   * resetting a setup POST under load (`ECONNRESET`), and typed text lost to
   * the hydration window (NOTES: "WebKit outrunning React hydration").
   *
   * The trade, made deliberately: at 1-3 failures per run a red suite could not
   * be read at all, so a real regression arrived camouflaged. One retry makes
   * green mean something again. **The cost is that a test failing ~50% of the
   * time now passes silently** — so `retry` counts are NOT noise. If a spec
   * starts needing its retry, treat that as the signal this flag was bought
   * with, and read `PLAYWRIGHT_RETRY_REPORT` below.
   */
  retries: process.env.CI ? 2 : 1,
  /**
   * THREE locally, not Playwright's default.
   *
   * The default is roughly half the cores — ~6 on a 12-core machine — and every
   * one of them drives ONE dev server. Measured 2026-08-12, three full runs at
   * each setting:
   *
   * | workers | result |
   * |---|---|
   * | default (~6) | 1-6 failures per run: `manage` timing out at 30s, and `ECONNRESET` on setup POSTs across four other files |
   * | **3** | **278 passed, zero failures, zero flaky, twice** |
   *
   * The failures were never in the app. `ECONNRESET` is the dev server dropping
   * connections it cannot accept, and the `manage` timeout is the same
   * saturation reaching a test that does four sequential round trips. Both
   * vanish when the server is not oversubscribed.
   *
   * Wall clock is unchanged (~4.9m vs ~4.6m): the bottleneck was the server, so
   * more workers bought contention rather than throughput.
   *
   * **This is why the `manage` flake survived four investigations** — every one
   * looked at the test and the component, and the cause was in this line.
   */
  workers: process.env.CI ? 1 : 3,
  /**
   * `list` alongside `html` so retried tests are VISIBLE in the terminal.
   *
   * With `html` alone a retry-then-pass is invisible unless someone opens the
   * report, which recreates the problem the retry was added to solve: a spec
   * failing half the time reads as a clean run. The list reporter prints
   * "retry #1" inline, so the cost of the retry stays in view.
   */
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // SPEC.md §11 flow 10 runs the collection and lookup flows at 390x844.
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    // NODE_ENV=test makes Next load .env.test and skip .env.local, so an E2E run
    // never authenticates against the developer's own APP_PASSWORD_HASH.
    command: `NODE_ENV=test npm run dev -- --port ${PORT}`,
    url: baseURL,
    // A stale dev server would carry the developer's own env, not these values,
    // and the login tests would fail confusingly.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
