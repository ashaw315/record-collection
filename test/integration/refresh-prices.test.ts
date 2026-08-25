import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, pressings, priceHistory, records, wantList } from '@/db/schema';
import { recordsToRefresh } from '@/lib/db/queries/refresh-prices';

/**
 * SPEC.md §5.7's `POST /api/discogs/refresh-prices` and §6's "write
 * `price_history` rows with `source: "discogs"`", at the query layer.
 *
 * The selection half: WHICH rows a refresh is about. §5.7 says "all items with
 * a `discogs_release_id`", and that id lives on `pressings`, reached from a
 * record through `pressing_id` — so "has a release id" is a two-hop question
 * and a record without a pressing is simply not refreshable.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedArtist() {
  const [artist] = await db.insert(artists).values({ name: 'Discharge' }).returning();
  return artist;
}

async function seedRecord(discogsReleaseId: number | null, title = 'Why') {
  const artist = await seedArtist();
  const pressingId =
    discogsReleaseId === null
      ? null
      : (await db.insert(pressings).values({ discogsReleaseId }).returning())[0].id;

  const [record] = await db
    .insert(records)
    .values({ title, artistId: artist.id, pressingId })
    .returning();

  return record;
}

describe('recordsToRefresh', () => {
  /**
   * Fails against: a query that returns every record, or one that cannot reach
   * the release id through the pressing join.
   */
  it('returns records whose pressing carries a discogs release id', async () => {
    const record = await seedRecord(249504);

    const rows = await recordsToRefresh();

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ recordId: record.id, discogsReleaseId: 249504 });
  });

  /**
   * Fails against: a join that produces a row with a null release id, which the
   * caller would then interpolate into a Discogs URL as "null".
   */
  it('skips a record with no pressing at all', async () => {
    await seedRecord(null);

    expect(await recordsToRefresh()).toHaveLength(0);
  });

  /**
   * Fails against: an inner join treated as sufficient — a pressing exists but
   * carries no Discogs id, which is the normal state for a hand-entered
   * pressing (§4.2: the column is nullable).
   */
  it('skips a record whose pressing has no discogs release id', async () => {
    const artist = await seedArtist();
    const [pressing] = await db
      .insert(pressings)
      .values({ catalogNumber: 'CLAY 3' })
      .returning();
    await db.insert(records).values({ title: 'Why', artistId: artist.id, pressingId: pressing.id });

    expect(await recordsToRefresh()).toHaveLength(0);
  });

  /**
   * **Fails against a query that returns one row per release rather than per
   * record**, which would refresh only one of two copies.
   *
   * §4 states duplicate records are legal and expected: two copies of the same
   * pressing are two rows sharing one `pressing_id`. Both have a price history
   * of their own, so both must be refreshed — a DISTINCT on the release id
   * would silently leave one copy's history frozen.
   */
  it('returns both records when two copies share one pressing', async () => {
    const artist = await seedArtist();
    const [pressing] = await db.insert(pressings).values({ discogsReleaseId: 249504 }).returning();
    await db.insert(records).values([
      { title: 'Why', artistId: artist.id, pressingId: pressing.id },
      { title: 'Why', artistId: artist.id, pressingId: pressing.id },
    ]);

    const rows = await recordsToRefresh();

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.recordId)).size).toBe(2);
    expect(rows.every((r) => r.discogsReleaseId === 249504)).toBe(true);
  });

  /**
   * Fails against: a query that walks `want_list` as well.
   *
   * §5.7 says "all items with a `discogs_release_id`" and `price_history` can
   * point at either parent — but §10a is explicit that the want list's market
   * figures are shown "beside `max_price`, never merged with it", fetched on
   * demand. Refreshing them here would write rows nothing reads, against a
   * 60/minute budget. Scoped to records, and stated so the omission is a
   * decision rather than an oversight.
   */
  it('does not walk the want list', async () => {
    const artist = await seedArtist();
    const [pressing] = await db.insert(pressings).values({ discogsReleaseId: 249504 }).returning();
    await db
      .insert(wantList)
      .values({ title: 'Hear Nothing', artistId: artist.id, targetPressingId: pressing.id });

    expect(await recordsToRefresh()).toHaveLength(0);
  });

  /**
   * Fails against: a query that skips records which already have price history.
   *
   * §7.5 is append-only — a refresh ADDS an observation rather than replacing
   * one, so a record priced last week is exactly the record this cron exists
   * for. A "only those without prices" filter would run once and never again.
   */
  it('includes a record that already has price history', async () => {
    const record = await seedRecord(249504);
    await db
      .insert(priceHistory)
      .values({ recordId: record.id, price: '12.00', priceType: 'asking', source: 'discogs' });

    expect(await recordsToRefresh()).toHaveLength(1);
  });
});
