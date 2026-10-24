import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, records } from '@/db/schema';

/**
 * SPEC.md §4.5 (A76): `record_moods`, checked against the database itself.
 *
 * Raw SQL rather than the Drizzle table, deliberately: the CHECK is the
 * database's promise, and a write through application code would test whatever
 * that code validated first.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedRecord(): Promise<string> {
  const [artist] = await db.insert(artists).values({ name: 'Paul Bley' }).returning();
  const [record] = await db.insert(records).values({ title: 'Open, to Love', artistId: artist.id }).returning();
  return record.id;
}

/** A VALUES-free text[] literal: Drizzle binds a JS array as a record, which Postgres will not cast. */
const moodArray = (moods: string[]) =>
  moods.length === 0
    ? sql`ARRAY[]::text[]`
    : sql`ARRAY[${sql.join(
        moods.map((m) => sql`${m}`),
        sql`, `,
      )}]::text[]`;

/**
 * The constraint Postgres named, read from the driver error Drizzle wraps; the
 * wrapper's message carries only the query text.
 */
async function violated(write: Promise<unknown>): Promise<string | undefined> {
  try {
    await write;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint;
  }
  return undefined;
}

async function writeMoods(recordId: string, moods: string[]) {
  await db.execute(sql`
    INSERT INTO record_moods (record_id, moods, tagged_at, tagged_by_model)
    VALUES (${recordId}, ${moodArray(moods)}, now(), 'claude-opus-5-5')
  `);
}

describe('record_moods CHECK on cardinality', () => {
  it('rejects an empty set, because a record with no mood can never be picked', async () => {
    const recordId = await seedRecord();

    expect(await violated(writeMoods(recordId, []))).toBe('record_moods_one_to_four');
  });

  it('rejects a set of five', async () => {
    const recordId = await seedRecord();

    expect(
      await violated(writeMoods(recordId, ['sleepy', 'smooth', 'sunny', 'zone out', 'dancing'])),
    ).toBe('record_moods_one_to_four');
  });

  /** The bounds are inclusive at both ends; an off-by-one either way fails one of these. */
  it('accepts one mood and accepts four', async () => {
    const one = await seedRecord();
    const four = await seedRecord();

    await writeMoods(one, ['sleepy']);
    await writeMoods(four, ['sleepy', 'smooth', 'sunny', 'zone out']);

    const rows = await db.execute<{ n: number }>(
      sql`SELECT cardinality(moods) AS n FROM record_moods ORDER BY n`,
    );
    expect(rows.rows.map((r) => Number(r.n))).toEqual([1, 4]);
  });
});

describe('record_moods columns', () => {
  it('defaults overridden to false and lets tagged_by_model be NULL for a set written by hand', async () => {
    const recordId = await seedRecord();

    await db.execute(sql`
      INSERT INTO record_moods (record_id, moods, tagged_at)
      VALUES (${recordId}, ${moodArray(['smooth'])}, now())
    `);

    const rows = await db.execute<{ overridden: boolean; tagged_by_model: string | null }>(
      sql`SELECT overridden, tagged_by_model FROM record_moods`,
    );
    expect(rows.rows).toEqual([{ overridden: false, tagged_by_model: null }]);
  });

  it('holds one row per record', async () => {
    const recordId = await seedRecord();
    await writeMoods(recordId, ['smooth']);

    expect(await violated(writeMoods(recordId, ['sunny']))).toBe('record_moods_pkey');
  });

  it('goes with its record, because a tag set describes nothing once the record is deleted', async () => {
    const recordId = await seedRecord();
    await writeMoods(recordId, ['smooth', 'sunny']);

    await db.delete(records).where(eq(records.id, recordId));

    const rows = await db.execute(sql`SELECT 1 FROM record_moods`);
    expect(rows.rows).toHaveLength(0);
  });
});
