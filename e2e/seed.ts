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
