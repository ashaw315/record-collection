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

/**
 * NEON_TEST_DATABASE_URL only, from .env.local.
 *
 * The Neon transaction harness (CLAUDE.md §2) needs a real branch URL, which is
 * a personal credential and so belongs in the gitignored .env.local rather than
 * the committed .env.test. Loading .env.local WHOLESALE would defeat the
 * isolation .env.test exists for — an E2E or integration run would pick up the
 * developer's own DATABASE_URL — so exactly one variable is copied across, and
 * only when .env.test has not already set it.
 */
const localOnly: Record<string, string> = {};
config({ path: '.env.local', processEnv: localOnly, quiet: true });
if (
  process.env.NEON_TEST_DATABASE_URL === undefined &&
  localOnly.NEON_TEST_DATABASE_URL !== undefined
) {
  process.env.NEON_TEST_DATABASE_URL = localOnly.NEON_TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    /*
     * **Serialised ACROSS projects, not only within one.**
     *
     * `fileParallelism: false` inside the server project serialises that
     * project's files, but vitest schedules the PROJECTS themselves
     * concurrently — so the component project running alongside makes vitest
     * parallelise, and the integration files start overlapping each other
     * again. Measured: `deadlock detected (code=40P01)` on a plain SELECT, with
     * ~16 failures scattered across files nobody had touched.
     *
     * The component project owns no database, which is exactly why this is
     * confusing: the harm is not contention with IT, it is that its presence
     * changes how the other project is scheduled.
     */
    fileParallelism: false,

    /*
     * **One worker for the whole run, not one per project.**
     *
     * `fileParallelism: false` stops files within a project from overlapping. It
     * does NOT stop the two projects from running concurrently in separate
     * workers, and the integration project shares one Postgres database whose
     * every test truncates it — so a component-project worker running alongside
     * is enough to let the server project's own files interleave. Measured:
     * `40P01` deadlocks and `23505` duplicate keys on shared fixture names.
     *
     * **KEPT WITHOUT A DEMONSTRATED DEFECT, deliberately.** The deadlocks above
     * were measured while `env-loading.test.ts` was spawning an unbounded number
     * of child vitest runs — several of them full two-project suites against
     * this one shared database. On a clean run of the fixed tree the signature
     * does not reproduce: 3188 passed, 0 `40P01`, 0 `23505`, 251s. So the
     * contention this guards against may have been the fork bomb itself.
     *
     * It stays because it costs little on a four-minute suite and removing it is
     * a change that deserves its own measurement, not because a race has been
     * shown to need it. **Trigger to revisit: the suite exceeding ~8 minutes, or
     * CI wall-clock becoming a complaint.** The measurement to run is specified
     * in NOTES.md, "RE-MEASURED on the fixed tree" — three full runs without it,
     * grepping for `40P01` and `23505`, because the race was intermittent and one
     * green run proves nothing.
     *
     * (`minWorkers: 1` was here too and is removed: it is not a key vitest 4
     * accepts — `tsc` rejects it — so it never had any effect.)
     */
    maxWorkers: 1,

    /**
     * Two projects, because the two layers need INCOMPATIBLE resolve conditions.
     *
     * `server-only` (CLAUDE.md §6) resolves to a throwing stub unless the
     * `react-server` condition is set, so every server-side test needs it. But
     * `react-dom/server` refuses to load WITH it — "react-dom/server is not
     * supported in React Server Components" — so the component layer needs it
     * absent. One config cannot satisfy both, and that incompatibility is the
     * whole reason this project split exists rather than a second `include`.
     *
     * Both run under a plain `npm test`, which SPEC.md §14 requires. A layer
     * nobody executes is not a layer.
     */
    projects: [
      {
        extends: true,
        // Server modules are marked with `import 'server-only'` (CLAUDE.md §6).
        // That package resolves to a throwing stub unless the `react-server`
        // condition is set, which would fail every server-side unit test at
        // import time. Vitest loads test modules through the SSR pipeline, so
        // the condition belongs here rather than under `resolve`.
        ssr: {
          resolve: {
            conditions: ['react-server', 'node'],
            externalConditions: ['react-server', 'node'],
          },
        },
        test: {
          name: 'server',
          environment: 'node',
          globalSetup: ['./test/global-setup.ts'],
          // Every integration test shares one local Postgres database and
          // truncates it in beforeEach (CLAUDE.md §2). Running files
          // concurrently means one file's truncate lands inside another file's
          // test, which surfaces as rows vanishing mid-test in a file nobody
          // edited, with a different subset failing each run. Serializing files
          // is the price of a shared database.
          fileParallelism: false,
          include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
          // Playwright specs live in e2e/ and are run by `npm run test:e2e`.
          exclude: ['node_modules/**', '.next/**', 'e2e/**'],
        },
      },
      {
        extends: true,
        /**
         * SPEC.md §11 component layer (A46). **Static rendering only.**
         *
         * No `react-server` condition, so `react-dom/server` loads. The
         * consequence is that a `server-only` module CANNOT be imported from a
         * component test — which is the correct constraint rather than a
         * limitation: this layer tests client components, and a client component
         * importing a server module is the §6 violation the marker exists to
         * catch.
         *
         * **No database and no global setup.** These tests render markup; a
         * component test that needed a database would be an integration test in
         * the wrong directory.
         */
        test: {
          name: 'component',
          environment: 'node',
          include: ['src/**/*.test.tsx'],
          exclude: ['node_modules/**', '.next/**', 'e2e/**'],
        },
      },
    ],
  },
  resolve: { tsconfigPaths: true },
});
