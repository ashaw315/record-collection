import type { Page } from '@playwright/test';

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
