import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { countAllRecords } from '@/lib/db/queries/records';

/**
 * The grand, UNFILTERED record count — the "M" in the heading's "N of M
 * records".
 *
 * With the wall's four-row minimum removed (A24d amended), the heading states
 * how many the collection holds so the wall can be as tall as its contents.
 * That total must ignore filters entirely: it is a fact about the collection,
 * not about the current view. This calls `countAllRecords` directly and asserts
 * it counts every record regardless of filter.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedRecords(n: number): Promise<void> {
  const a = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES ('CountAll') RETURNING id`,
  );
  const artistId = a.rows[0].id;
  await db.execute(
    sql`INSERT INTO records (artist_id, title, release_year)
        SELECT ${artistId}::uuid, 'R' || i, 1980 FROM generate_series(1, ${n}) i`,
  );
}

describe('countAllRecords', () => {
  it('is zero on an empty collection', async () => {
    expect(await countAllRecords()).toBe(0);
  });

  it('counts every record, unfiltered', async () => {
    await seedRecords(7);
    expect(await countAllRecords()).toBe(7);
  });
});
