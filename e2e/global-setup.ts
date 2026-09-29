import { config } from 'dotenv';
import { closeTestDb, holdTestDatabase, truncateAll } from '../test/helpers/db';
import { seedSeventeen } from './seventeen';

/**
 * Resets the E2E database once per Playwright run.
 *
 * E2E specs write through the real API and nothing cleaned up after them, so
 * rows accumulated across every run this project has ever done. That is not
 * merely untidy — it produced TWO FALSE FINDINGS during step 5:
 *
 *   - filter chips appeared to overflow the layout, which was ~100 leftover
 *     fixture genres rather than a CSS defect;
 *   - a screenshot showed duplicate records that read as a bug and were
 *     accumulated fixtures (duplicates are legal, §4).
 *
 * It also caused a real one to be misdiagnosed: chips vanished past 200
 * reference rows, which was a genuine limitation but was reached by test
 * debris rather than by anything a user would do.
 *
 * A clean start makes every observation about the run that produced it.
 *
 * This does NOT truncate between specs. Specs run in parallel across two
 * projects against one database, so a mid-run truncate would delete another
 * spec's fixtures — the exact defect `fileParallelism: false` fixed on the
 * vitest side. Each spec instead names its fixtures uniquely and scopes its
 * assertions to them; this only removes the debris of PREVIOUS runs.
 *
 * `truncateAll` is reused rather than reimplemented: it carries the local-host
 * guard that makes reaching a remote database structurally impossible, and it
 * excludes `formats`, which is closed reference data seeded by the migration
 * (§4.1) and not test state. A hand-rolled TRUNCATE here would have to repeat
 * both, and the one that gets forgotten is the guard.
 */
export default async function globalSetup(): Promise<void> {
  // Playwright does not load .env.test itself; the dev server it starts does.
  // Without this, TEST_DATABASE_URL is unset and the guard refuses — correctly,
  // but before doing anything useful.
  // `quiet` because dotenv 17 announces itself on STDOUT, not stderr — see
  // test/repo/dotenv-quiet.test.ts for why that is a contamination risk rather
  // than mere noise.
  config({ path: '.env.test', quiet: true });

  await truncateAll();

  /*
   * **A47: hold the database for the WHOLE run, not just this setup.**
   *
   * `truncateAll` takes a session advisory lock, but that dies with the pool
   * `closeTestDb()` ends below — so without this the E2E run released the
   * database before its first test, which is the window a concurrent `npm test`
   * wiped the seed data in (52 bogus failures across specs the diff never
   * touched). The row survives the connection; `global-teardown.ts` removes it.
   */
  await holdTestDatabase('playwright e2e');

  await closeTestDb();
  await warmServer();

  /*
   * **The seventeen are seeded here, once, and no spec owns them.** Seeding
   * happens after the warm-up so the API routes it calls are compiled, and the
   * pool it opens is closed again below. Not best effort: a run without the
   * seventeen would fail every spec that reads them, and it should say why.
   */
  const started = Date.now();
  await seedSeventeen({ base: BASE, password: PASSWORD });
  process.stdout.write(`[global-setup] seeded the seventeen in ${Date.now() - started}ms\n`);
  await closeTestDb();
}

const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? '3100'}`;
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/**
 * **Warm the dev server before the first test.** The first spec to run bore
 * the cold start: /login, the login route and the wall each compile on their
 * first request, and a 5s login redirect failed at the head of run after run
 * (NOTES.md, the flake log entries of 27 and 28 Sep). Playwright starts the
 * web server before this runs, so the first requests happen here, once, off
 * the clock. Best effort: a failure here is logged, not fatal -- the tests
 * will still say what is wrong.
 */
async function warmServer(): Promise<void> {
  const base = BASE;
  const password = PASSWORD;
  const started = Date.now();
  try {
    await fetch(`${base}/login`);
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password }), redirect: 'manual' });
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    const headers: Record<string, string> = cookie === '' ? {} : { cookie };
    await fetch(`${base}/`, { headers, redirect: 'manual' });
    await fetch(`${base}/records/00000000-0000-4000-8000-000000000000`, { headers, redirect: 'manual' });
    process.stdout.write(`[global-setup] warmed ${base} in ${Date.now() - started}ms\n`);
  } catch (error) {
    process.stdout.write(`[global-setup] warm-up failed (${error instanceof Error ? error.message : String(error)}); tests run cold\n`);
  }
}

