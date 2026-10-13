import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';

/**
 * Seen once for real (13 Oct, `want-list.spec.ts:1119` on the phone project):
 * `hydrateWantListItem` reads the item, then its artist, in two statements,
 * and another spec's cleanup deleted the artist and its items between them.
 * The item came back with `artist` undefined, `WantListRow.tsx` read
 * `item.artist.name`, and the whole list threw: one row took every row down
 * for a reader who had nothing to do with it. Since step 142 that throw
 * draws the error screen, which TRY AGAIN cannot recover while the row
 * stands, so the page looks handled and is dead.
 *
 * `want_list.artist_id` is NOT NULL and references `artists` with NO
 * ACTION, so at rest no item is without an artist: the state exists only in
 * the gap between the two reads, where nothing holds the world still. The
 * test stages that state at rest, by deleting the artist with the
 * constraint's trigger held off for one transaction
 * (`session_replication_role = replica`, which the test role may set), and
 * asserts the precondition it has made: the item is there and the artist is
 * not. That is the world the second read sees when a delete lands in the
 * gap, and the only deterministic way to put it in front of the function.
 *
 * Fails against `return { ...item, artist, ... }` with no check on `artist`:
 * the destructured `[artist]` is typed `Named` and is undefined.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const id = async (statement: ReturnType<typeof sql>) =>
  (await db.execute<{ id: string }>(statement)).rows[0].id;

describe('hydrateWantListItem when the artist is gone', () => {
  it('an item whose artist no longer exists hydrates as missing, not as a row with no artist', async () => {
    const artist = await id(sql`INSERT INTO artists (name) VALUES ('Chaos UK') RETURNING id`);
    const item = await id(
      sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${artist}, 'Short Sharp Shock', 2) RETURNING id`,
    );

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session_replication_role = replica`);
      await tx.execute(sql`DELETE FROM artists WHERE id = ${artist}::uuid`);
    });

    /* The staging, asserted: the orphan the gap produces is on disk. */
    const [items, artists] = await Promise.all([
      db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM want_list WHERE id = ${item}::uuid`),
      db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM artists WHERE id = ${artist}::uuid`),
    ]);
    expect(items.rows[0].n, 'the precondition: the item is still there').toBe(1);
    expect(artists.rows[0].n, 'the precondition: its artist is not').toBe(0);

    expect(await hydrateWantListItem(item)).toBeUndefined();
  });
});
