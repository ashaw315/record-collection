import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';

/**
 * Removes the records a spec created, so the database does not grow all run.
 *
 * **The measured cause of the login flake** (step 15 unit 1). `globalSetup`
 * truncates ONCE per run and nothing cleaned up after each spec, so a full run
 * accumulated **724 records** — two specs seed ~200 each. `/` is a server
 * component that awaits `shelfRecords`, `records` and `facets` before it
 * responds, and every spec's `login()` ends with `expect(page).toHaveURL('/')`,
 * which waits for that render. Early in a run it is fast; by test ~200 it
 * exceeds the 5s default and the login "fails".
 *
 * That is why every failure sat in the last quarter of the run — earliest 194 of
 * 262, none in the first 190, across three runs and both projects.
 *
 * **Delete records BEFORE the artist.** §7.4 refuses to cascade a reference row
 * that is in use (409 with a count), which is correct behaviour and not
 * something to work around — so the order matters.
 *
 * **Call it in a `finally`.** NOTES: a spec seeding bulk data must clean up even
 * when it fails, or one failure cascades into every later spec and buries the
 * original cause under a hundred timeouts.
 */
export async function deleteRecordsByArtist(page: Page, artistId: string): Promise<void> {
  /*
   * Best-effort throughout: this runs on the teardown path, and a throw here
   * would replace a real failure with a cleanup error — hiding the thing the
   * spec was written to catch.
   */
  try {
    /*
     * **Paginated, because `pageSize` is CLAMPED at 200** (§5, `query-params.ts`)
     * and the two heaviest specs seed 199 and 200. A single request asking for
     * more would silently return 200 and leave the remainder behind — the
     * clamp is not an error, so nothing would report the shortfall.
     *
     * Always re-reads page 1: deleting shifts later rows forward, so paging
     * with an incrementing offset would skip half of them.
     */
    for (;;) {
      const listed = await page.request.get(
        `/api/records?artistId=${artistId}&pageSize=200&page=1`,
        { failOnStatusCode: false },
      );
      if (!listed.ok()) return;

      const body = (await listed.json()) as { data?: Array<{ id: string }> };
      const rows = body.data ?? [];
      if (rows.length === 0) break;

      for (const record of rows) {
        await page.request.delete(`/api/records/${record.id}`, { failOnStatusCode: false });
      }
    }

    await page.request.delete(`/api/artists/${artistId}`, { failOnStatusCode: false });
  } catch {
    // Swallowed deliberately — see above.
  }
}

/**
 * **The one-line way for a spec to clean up after itself.**
 *
 * Call `trackArtist(id)` when a fixture artist is created; every tracked artist
 * and its records are removed after each test, whether the test passed or
 * failed. `registerCleanup()` wires the hook — call it once at module scope.
 *
 * **Why a shared helper rather than a per-spec `afterEach`.** A full run from an
 * empty database ended with 145 records and 129 artists, because thirteen specs
 * seeded and never cleaned up. Per-file teardown is the rule that was already
 * in place and was simply not followed thirteen times; the fix has to make
 * compliance cheap and non-compliance visible, which is why
 * `test/repo/e2e-cleanup.test.ts` fails when a spec seeds without registering.
 *
 * **Why not a mid-run truncate.** `global-setup.ts` records the reason: two
 * projects run in parallel against one database, so truncating mid-run — or in
 * a global teardown while a project is still going — would delete another
 * spec's live fixtures. Per-artist deletion only ever touches this spec's own
 * rows.
 *
 * **Why SQL rather than the API.** `deleteRecordsByArtist` issues one paginated
 * GET plus one DELETE per record; the heaviest spec paid 200 round-trips on
 * teardown against the shared dev server, which is the load `seed.ts` warns
 * about. These fixtures need nothing the delete route adds — the specs using
 * this attach no images, so there is no blob to orphan.
 *
 * Records before the artist: §7.4 refuses to cascade a reference row in use.
 */
export function trackArtist(artistId: string): void {
  trackedArtists.push(artistId);
}

const trackedArtists: string[] = [];

export function registerCleanup(): void {
  test.afterEach(async () => {
    const db = getTestDb();

    for (const artistId of trackedArtists.splice(0)) {
      /*
       * Best-effort per artist, and one failure must not strand the rest: this
       * is the teardown path, and a throw here would replace a real failure
       * with a cleanup error.
       */
      try {
        /*
          **Want-list rows first.** Everything else referencing a record or an
          artist cascades; three columns do not — `records.artist_id`,
          `want_list.artist_id` and `want_list.acquired_record_id` are all NO
          ACTION, which is §7.4's refusal to cascade a reference row in use. A
          first version deleted records then the artist and left one fixture
          behind per run: a want-list entry pinned both. Found by measuring, not
          by reading — the count fell from 145 to 1, and the 1 was the tell.
        */
        await db.execute(
          sql`DELETE FROM want_list
               WHERE artist_id = ${artistId}::uuid
                  OR acquired_record_id IN (
                       SELECT id FROM records WHERE artist_id = ${artistId}::uuid
                     )`,
        );
        await db.execute(sql`DELETE FROM records WHERE artist_id = ${artistId}::uuid`);
        await db.execute(sql`DELETE FROM artists WHERE id = ${artistId}::uuid`);
      } catch {
        // Swallowed deliberately — see above.
      }
    }
  });
}
