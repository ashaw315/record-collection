import { config } from 'dotenv';
import { closeTestDb, truncateAll } from '../test/helpers/db';

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
  config({ path: '.env.test' });

  await truncateAll();
  await closeTestDb();
}
