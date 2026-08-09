import { readFileSync } from 'node:fs';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';

/**
 * Bulk fixture creation for E2E specs, straight to the database.
 *
 * E2E normally drives the real API, and specs that test writing still do. This
 * exists for fixtures that are merely SCENERY — a collection large enough to
 * paginate — where creating them through HTTP measurably degrades the shared
 * dev server and destabilises every other spec in the run.
 *
 * `getTestDb` carries the local-host guard, so this cannot address anything but
 * the disposable test database.
 */
export async function seedRecords(
  artistId: string,
  titlePrefix: string,
  suffix: string,
  count: number,
): Promise<void> {
  const db = getTestDb();

  // One statement. generate_series builds the rows server-side rather than
  // sending `count` parameter sets over the wire.
  await db.execute(sql`
    INSERT INTO records (artist_id, title)
    SELECT ${artistId}::uuid,
           ${titlePrefix} || ' ' || lpad(i::text, 2, '0') || ' ' || ${suffix}
      FROM generate_series(0, ${count - 1}) AS i
  `);
}

/**
 * Removes a bulk fixture's records once its spec is done.
 *
 * Removing the LOAD was not enough. Leaving 110 rows in a database every other
 * spec reads changes what lands on page 1 for all of them — the same defect as
 * the view-toggle spec assuming its record was on the first page, one level up:
 * a spec that leaves data behind imposes that assumption on every other spec in
 * the file.
 *
 * Deleted by artist rather than by title pattern: the artist id is exact, and a
 * LIKE on a title prefix is the kind of match that quietly widens.
 */
export async function removeRecordsFor(artistId: string): Promise<void> {
  const db = getTestDb();

  await db.execute(sql`DELETE FROM records WHERE artist_id = ${artistId}::uuid`);
}

/**
 * Seeds `discogs_cache` from a committed fixture, so a spec can exercise the
 * real prefill path without any network.
 *
 * **This is how a server-side Discogs flow is tested end to end**, and the
 * alternatives were both wrong. A Playwright `page.route` stub does not cover
 * server components — that is precisely how a live call escaped in step 7 —
 * and vitest module mocking is unavailable across a process boundary.
 *
 * Seeding the cache uses the actual captured payload, so the test sees what
 * Discogs really sends: eight Matrix / Runout variants on release 381756, not
 * the single one a hand-written stub would carry. Code that assumed one would
 * pass a stubbed test and ship.
 */
export async function seedDiscogsCache(fixtureName: string): Promise<number> {
  const payload = JSON.parse(
    readFileSync(`test/fixtures/discogs/${fixtureName}.json`, 'utf8'),
  ) as { id: number };

  const db = getTestDb();

  await db.execute(
    sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
        VALUES (${payload.id}, ${JSON.stringify(payload)}::jsonb, now())
        ON CONFLICT (discogs_release_id)
        DO UPDATE SET payload = excluded.payload, fetched_at = now()`,
  );

  return payload.id;
}

/** Removes one cached release, so a spec cleans up after itself. */
export async function removeDiscogsCache(discogsReleaseId: number): Promise<void> {
  const db = getTestDb();

  await db.execute(
    sql`DELETE FROM discogs_cache WHERE discogs_release_id = ${discogsReleaseId}`,
  );
}
