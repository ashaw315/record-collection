import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { countWithoutAbout } from '@/lib/db/queries/ask';
import { getTestDb, truncateAll } from '../helpers/db';

/**
 * **§P.6's count line (Q22's control, 12 Nov): "N without an About yet.", counted over the whole collection, absent
 * when every record has one.** A record's ABOUT is `records.snippet`; empty and null are both "without". Fails against
 * a count that reads only null, or one that counts the pool rather than the collection.
 */
describe('countWithoutAbout', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('counts the records whose ABOUT is null or empty, over the whole collection', async () => {
    const db = getTestDb();
    const [artist] = (await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES ('Q22') RETURNING id`)).rows;
    await db.execute(sql`INSERT INTO records (title, artist_id, snippet) VALUES ('With', ${artist.id}::uuid, 'A warm late-night record.'), ('Null', ${artist.id}::uuid, NULL), ('Empty', ${artist.id}::uuid, '')`);
    expect(await countWithoutAbout()).toBe(2);
  });

  it('is zero when every record has one', async () => {
    const db = getTestDb();
    const [artist] = (await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES ('Q22') RETURNING id`)).rows;
    await db.execute(sql`INSERT INTO records (title, artist_id, snippet) VALUES ('With', ${artist.id}::uuid, 'A record.')`);
    expect(await countWithoutAbout()).toBe(0);
  });
});
