import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';

/**
 * SPEC.md §4.2 `pressings.matrix_runout_source` (A77, step 18 unit C): who
 * wrote the matrix. `user` for a value entered or settled by hand, which is
 * every row that exists before the column and every row a hand path writes
 * after it; `discogs` for a value the collection import seeded into an empty
 * field. Checked against the database itself, in raw SQL, because the
 * default and the check are the database's promises.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function violated(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write;
  } catch (error) {
    return (error as { cause?: { constraint?: string } }).cause?.constraint;
  }
  return undefined;
}

describe('pressings.matrix_runout_source', () => {
  it('is user by default, so every hand path that writes a matrix leaves it marked as the owner’s', async () => {
    await db.execute(sql`INSERT INTO pressings (catalog_number, matrix_runout) VALUES ('MP731', 'A1 / B1')`);
    const [row] = (await db.execute(sql`SELECT matrix_runout_source FROM pressings`)).rows as Array<{ matrix_runout_source: string | null }>;
    expect(row.matrix_runout_source).toBe('user');
  });

  it('accepts discogs, the import’s mark for a seeded matrix', async () => {
    await db.execute(sql`INSERT INTO pressings (catalog_number, matrix_runout, matrix_runout_source) VALUES ('MP731', 'A1 / B1', 'discogs')`);
    const [row] = (await db.execute(sql`SELECT matrix_runout_source FROM pressings`)).rows as Array<{ matrix_runout_source: string | null }>;
    expect(row.matrix_runout_source).toBe('discogs');
  });

  it('refuses any other source: the column holds two words, not provenance in general', async () => {
    expect(await violated(db.execute(sql`INSERT INTO pressings (catalog_number, matrix_runout_source) VALUES ('X', 'musicbrainz')`))).toBe('pressings_matrix_runout_source_known');
  });
});
