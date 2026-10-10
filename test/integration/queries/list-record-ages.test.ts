import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { listRecordAges } from '@/lib/db/queries/records';

/**
 * §T.6's one source record is chosen from the WHOLE collection: "the one in
 * the collection whose construction clears §29's 6px at the smallest
 * height, the oldest where two tie". So what the choice reads is every
 * record's id and when it was added, whatever filter, order or page the
 * screen is showing.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

describe('listRecordAges', () => {
  it('is empty on an empty collection', async () => {
    expect(await listRecordAges()).toEqual([]);
  });

  /* Fails against a query that pages (the list's 50) or reads a filter. */
  it('gives every record’s id and the time it was added', async () => {
    const a = await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES ('Ages') RETURNING id`);
    const inserted = await db.execute<{ id: string; created_at: Date }>(
      sql`INSERT INTO records (artist_id, title, release_year, created_at)
          SELECT ${a.rows[0].id}::uuid, 'R' || i, 1980, now() - (i || ' days')::interval FROM generate_series(1, 60) i
          RETURNING id, created_at`,
    );
    const ages = await listRecordAges();
    expect(ages).toHaveLength(60);
    const byId = new Map(ages.map((r) => [r.id, r.createdAt]));
    for (const row of inserted.rows) {
      const got = byId.get(row.id);
      expect(got, row.id).toBeInstanceOf(Date);
      expect(got?.getTime(), row.id).toBe(new Date(row.created_at).getTime());
    }
  });
});
