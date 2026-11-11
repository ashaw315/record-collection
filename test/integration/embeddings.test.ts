import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { aboutHash } from '@/lib/embeddings/plan';
import { aboutsWithStoredHash, listEmbeddings, storeEmbedding } from '@/lib/db/queries/embeddings';
import { closeTestDb, getTestDb, truncateAll } from '../helpers/db';

/**
 * **Q22's store: one vector per record, keyed to the ABOUT's text hash (the coordinator, 11 Nov).** Database assertions:
 * the table and its cascade are a migration, and what the run reads back (which records have an ABOUT, and the hash
 * each stored vector was made from) is a query. Each case fails against a store that keeps two rows for one record,
 * one that loses the hash, one that lists records without an ABOUT, or a table that survives its record.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function record(title: string, about: string | null): Promise<string> {
  const [artist] = (await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES (${`Artist ${title}`}) RETURNING id`)).rows;
  const [row] = (await db.execute<{ id: string }>(sql`INSERT INTO records (artist_id, title, snippet) VALUES (${artist.id}, ${title}, ${about}) RETURNING id`)).rows;
  return row.id;
}

describe('the embedding store', () => {
  it('lists the records that have an ABOUT, each with the hash of its stored vector or null', async () => {
    const rain = await record('Rain', 'Rain on a tin roof.');
    await record('Silent', null);
    const drive = await record('Drive', 'Late-night drive.');
    await storeEmbedding({ recordId: drive, hash: aboutHash('Late-night drive.'), model: 'text-embedding-3-small', vector: [0.1, 0.2, 0.3] });

    const rows = await aboutsWithStoredHash();
    expect(rows.map((r) => [r.recordId, r.about, r.storedHash]).sort()).toEqual(
      [
        [drive, 'Late-night drive.', aboutHash('Late-night drive.')],
        [rain, 'Rain on a tin roof.', null],
      ].sort(),
    );
  });

  it('keeps one vector per record: storing again replaces the vector and its hash', async () => {
    const rain = await record('Rain', 'Rain on a tin roof.');
    await storeEmbedding({ recordId: rain, hash: 'old', model: 'text-embedding-3-small', vector: [1, 0] });
    await storeEmbedding({ recordId: rain, hash: 'new', model: 'text-embedding-3-small', vector: [0, 1] });

    const all = await listEmbeddings();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ recordId: rain, hash: 'new', model: 'text-embedding-3-small', vector: [0, 1] });
  });

  it('goes with its record', async () => {
    const rain = await record('Rain', 'Rain on a tin roof.');
    await storeEmbedding({ recordId: rain, hash: 'h', model: 'text-embedding-3-small', vector: [1] });
    await db.execute(sql`DELETE FROM records WHERE id = ${rain}::uuid`);
    expect(await listEmbeddings()).toEqual([]);
  });
});
