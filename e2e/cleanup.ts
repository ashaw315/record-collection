import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { readSeventeen } from './seventeen';

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
/**
 * **A spec cleans what it created, by id.** For records under the run-level
 * artist MGMT this is the ONLY path that deletes: `trackArtist` on that artist
 * removes nothing, so a spec can leak its own row for the run but never remove
 * a row another spec is mid-read on (`fixtures-protected.spec.ts`).
 */
export function trackRecord(recordId: string): void {
  trackedRecords.push(recordId);
}

const trackedRecords: string[] = [];

/**
 * **A genre a test creates is tracked where it is created, and deleted when
 * that test ends.**
 *
 * Before this, nothing deleted a spec's genres. A full run ended with 210 in
 * the test database (measured 6 Oct, against 6 at its start), and the genres
 * screen draws one page of 200 and the square of them in options, so
 * `manage.spec.ts:179` ran out of its 30s on every gate. The one cleanup
 * that did exist, manage's own, looked its genres up by name in the first
 * 200 rows, and so stopped deleting anything once the others' leaks had
 * pushed its rows off that page: a cleanup that ran where the writes were
 * not.
 *
 * So the tracking is at the write and the delete is by id. Only what a test
 * tracked is deleted: every spec names its genres with its own suffix, so
 * no other worker's test can be holding one, which a sweep of "whatever is
 * unused" could not promise on a database two workers share.
 */
export function trackGenre(genreId: string): void {
  trackedGenres.push(genreId);
}
const trackedGenres: string[] = [];

/** For a genre created through the page, where the test knows its unique name and not its id. */
export function trackGenreNamed(name: string): void {
  trackedGenreNames.push(name);
}
const trackedGenreNames: string[] = [];

/** For a spec's own `post` helper: tracks what a reference-data POST created, from its path and its body. */
export function trackCreated(path: string, body: unknown): void {
  const id = (body as { id?: unknown } | null)?.id;
  if (path === '/api/genres' && typeof id === 'string') trackGenre(id);
}

export function trackArtist(artistId: string): void {
  trackedArtists.push(artistId);
}

const trackedArtists: string[] = [];

/**
 * **The seventeen are nobody's to clean up.** They are seeded once per run by
 * global setup (`seventeen.ts`) and read by several specs at once; the artist
 * MGMT that owns them is found-or-created, so a spec that tracks MGMT would
 * otherwise delete them under whichever spec is mid-read (the §43 diagnosis
 * of 28 Sep: 63 and 93 "never painted" findings that were all 404s). The guard
 * is the same file the seed reads, as a Postgres array literal: Drizzle
 * expands a JS array into a row constructor, which `= ANY` rejects.
 */
const PROTECTED_RECORDS = `{${readSeventeen().map((r) => r.id).join(',')}}`;

export function registerCleanup(): void {
  test.afterEach(async () => {
    const db = getTestDb();

    for (const recordId of trackedRecords.splice(0)) {
      try {
        await db.execute(sql`DELETE FROM want_list WHERE acquired_record_id = ${recordId}::uuid`);
        await db.execute(sql`DELETE FROM records WHERE id = ${recordId}::uuid`);
      } catch {
        // Swallowed deliberately — see above.
      }
    }

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
                         AND NOT (id = ANY(${PROTECTED_RECORDS}::uuid[]))
                     )`,
        );
        /*
          Nothing by artist under the run-level artist: its records belong to
          the run (the seventeen) or to whichever spec created them, and that
          spec tracks them by id.
        */
        await db.execute(
          sql`DELETE FROM records WHERE artist_id = ${artistId}::uuid
                AND NOT (id = ANY(${PROTECTED_RECORDS}::uuid[]))
                AND NOT EXISTS (
                  SELECT 1 FROM records p
                   WHERE p.artist_id = ${artistId}::uuid
                     AND p.id = ANY(${PROTECTED_RECORDS}::uuid[])
                )`,
        );
        /* Only when nothing is left under it: an artist the seventeen reference stays. */
        await db.execute(
          sql`DELETE FROM artists WHERE id = ${artistId}::uuid
                AND NOT EXISTS (SELECT 1 FROM records WHERE artist_id = ${artistId}::uuid)`,
        );
      } catch {
        // Swallowed deliberately — see above.
      }
    }

    /*
      Genres last: a genre in use is not deleted (§7.4), so this test's
      records go first, above. Children before parents, by repeating until a
      pass deletes nothing. A genre still referenced after that is left, and
      the run's ledger (`global-teardown.ts`) names it.
    */
    const ids = trackedGenres.splice(0);
    const names = trackedGenreNames.splice(0);
    if (ids.length > 0 || names.length > 0) {
      const idList = `{${ids.join(',')}}`;
      /*
        Both lists go as Postgres array literals. A JavaScript array handed
        to the query expands to a row, and an empty one to `()`, a syntax
        error this block's catch swallowed: the first build deleted nothing,
        and only the ledger said so.
      */
      const nameList = `{${names.map((name) => `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`;
      try {
        for (let pass = 0; pass < 8; pass += 1) {
          const gone = await db.execute(
            sql`DELETE FROM genres g
                 WHERE (g.id = ANY(${idList}::uuid[]) OR g.name = ANY(${nameList}::text[]))
                   AND NOT EXISTS (SELECT 1 FROM genres c WHERE c.parent_genre_id = g.id)
                   AND NOT EXISTS (SELECT 1 FROM record_genres r WHERE r.genre_id = g.id)
                   AND NOT EXISTS (SELECT 1 FROM want_list_genres w WHERE w.genre_id = g.id)
                   AND NOT EXISTS (SELECT 1 FROM artist_genres a WHERE a.genre_id = g.id)
               RETURNING g.id`,
          );
          if ((gone.rows ?? []).length === 0) break;
        }
      } catch {
        /* A failed cleanup must not turn a passing test red; the ledger reports what stayed. */
      }
    }
  });
}
