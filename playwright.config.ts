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
   * TWO locally, not Playwright's default — reduced from three on 2026-08-14.
   *
   * **This is MITIGATION, not diagnosis.** Three flakes accumulated across
   * three different spec files (`record-form`, `manage`, `collection-filters`),
   * every one load-dependent and every one passing in isolation. Measured
   * again, full suite each time:
   *
   * | workers | runs | flaky | wall clock |
   * |---|---|---|---|
   * | 3 | 2 | **2** — a different spec each time | 5.1m |
   * | **2** | **3** | **0** | 6.0-6.3m |
   *
   * Something is genuinely SHARED between concurrent workers — most likely test
   * data in the one database they all use. Fewer workers makes collisions
   * rarer, not impossible, so a flake here later is not a surprise and not a
   * refutation. The cost is about a minute per run, which is worth paying
   * against a flake on every run.
   *
   * The original reduction from ~6 to 3, still the larger effect:
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
  workers: process.env.CI ? 1 : 2,
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [/touch-tilt\.spec\.ts$/] },
    /*
      **A touch-enabled Chromium project, scoped to the touch-tilt spec.**
      §10b's touch drag needs a real touch stream, and the only reliable one in
      Playwright is CDP `Input.dispatchTouchEvent` — Chromium-only, so the
      WebKit `mobile` project cannot drive it. `hasTouch` at 390px is the phone
      viewport the drag is about. The feel is judged on the device; this project
      pins the gesture BOUNDARY and the hold, which are logic, not feel.
    */
    {
      name: 'touch',
      use: { ...devices['Desktop Chrome'], hasTouch: true, viewport: { width: 390, height: 844 } },
      testMatch: [/touch-tilt\.spec\.ts$/],
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
      /**
       * **Scoped, where it used to run every spec.**
       *
       * SPEC.md §11 flow 10: "Run the collection list and lookup flows at a
       * mobile viewport (390×844)". The uniform matrix doubled all 15 specs to
       * satisfy a requirement naming two, at roughly 3.7 minutes of a 7-minute
       * suite.
       *
       * Two different justifications below, and the difference matters when
       * someone edits this list:
       *
       *   SPEC-MANDATED — §11 flow 10 names these. Removing one is a spec
       *   violation, not a tidy-up.
       *     collection-filters, collection-widths, lookup-flows
       *
       *   STEP 15's MOBILE PASS — §12 step 15 is "mobile pass across ALL
       *   screens", and eight of twelve had never been rendered at 390px. These
       *   carry the form screens, which is where viewport-dependent layout bites
       *   hardest — label wrapping, select widths, keyboard overlap.
       *     record-form      — /records/new and /records/[id]/edit
       *     discogs-prefill  — /records/new prefilled, and /want-list/new
       *     want-list        — /want-list and the acquire flow
       *     auth             — /login
       *     record-detail    — /records/[id], with images and snippet, which
       *     images, snippet    render the same screen's gallery and blurb
       *     stats            — /stats
       *     suggestions      — /suggestions
       *
       *   With these, all twelve routes have been rendered at 390px. The list
       *   is now the record that step 15's "across all screens" was satisfied,
       *   which is why a spec should not be dropped from it without evidence.
       *
       *   EVIDENCE-BASED — the spec does not name these; they are here because
       *   they assert viewport-dependent behaviour INTERNALLY, so running them
       *   only on desktop would leave those assertions permanently unexercised
       *   in the one place they are about.
       *     nav-mobile — the whole spec is about 390px; it is meaningless on
       *                  chromium and its assertions would not run at all
       *                  without this entry
       *     manage     — "the resource rail is reachable on a narrow viewport"
       *
       * `graph.spec.ts` was listed here until step 15 unit 2 and the FILE NO
       * LONGER EXISTS — §8 retired the screen and the spec went with it, while
       * this pattern stayed behind matching nothing. Harmless to the runner and
       * not harmless to a reader: this list is the spec-mandated record of what
       * mobile covers, and a dead entry in it overstates that coverage. Removed
       * rather than left as archaeology.
       *
       * **What cannot be proven, and is therefore a decision rather than a
       * cleanup.** The auth stanzas removed in this same pass were provably
       * redundant: break the rule and watch which tests fail. There is no
       * equivalent for "this spec does not need mobile" — a spec only fails on
       * mobile if a mobile-specific defect exists, and none does today. So the
       * excluded specs are excluded on the absence of viewport-dependent
       * assertions, which is weaker evidence than a mutation.
       *
       * Concretely: `CollectionList` once had a dead band at 640–767px where a
       * column and its stand-in were both hidden, and the uniform matrix is
       * what would have caught it anywhere. **Re-adding a spec here needs no
       * justification; removing one needs evidence.**
       *
       * Baseline before narrowing, so a later comparison means something: two
       * consecutive `--retries=0` runs of the FULL matrix, 326 passed, 0 failed.
       * A cleaner run after narrowing is NOT evidence the mobile contention is
       * resolved — fewer parallel workers is exactly what would mask it. That
       * investigation stays open on its own terms.
       */
      testMatch: [
        /collection-filters\.spec\.ts$/,
        /collection-widths\.spec\.ts$/,
        /lookup-flows\.spec\.ts$/,
        /nav-mobile\.spec\.ts$/,
        /manage\.spec\.ts$/,
        /record-form\.spec\.ts$/,
        /discogs-prefill\.spec\.ts$/,
        /want-list\.spec\.ts$/,
        /auth\.spec\.ts$/,
        /record-detail\.spec\.ts$/,
        /images\.spec\.ts$/,
        /snippet\.spec\.ts$/,
        /stats\.spec\.ts$/,
        /suggestions\.spec\.ts$/,
      ],
    },
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
