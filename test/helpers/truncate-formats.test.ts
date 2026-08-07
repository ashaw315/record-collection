import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from './db';

/**
 * `truncateAll` must leave `formats` holding EXACTLY the seven seeded rows
 * (SPEC.md §4.1) — no more, no fewer.
 *
 * It previously SKIPPED the table entirely, on the reasoning that seeded
 * reference data is not test state. That is right about the seven and wrong
 * about anything else: a test creating an eighth format left it there
 * permanently, surviving every reset, and it broke schema.test.ts's
 * "seeds exactly the seven" assertion for every subsequent run.
 *
 * That happened TWICE in one session. The symptom is a failure in a file that
 * did not change, and the cause is three layers away in a test that created a
 * format an hour earlier — so the fix restores rather than detects. Detection
 * tells you after the debris exists; restoring means it cannot accumulate.
 */

const db = getTestDb();

const SEEDED = ['LP', '2xLP', '7"', '10"', '12" Single', 'Box Set', 'Picture Disc'].sort();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function formatNames(): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(sql`SELECT name FROM formats ORDER BY name`);
  return rows.rows.map((row) => row.name).sort();
}

describe('truncateAll and the seeded formats', () => {
  it('leaves exactly the seven seeded rows', async () => {
    expect(await formatNames()).toEqual(SEEDED);
  });

  it('removes a format a test created, rather than letting it survive', async () => {
    // The exact debris that broke schema.test.ts, twice.
    await db.execute(sql`INSERT INTO formats (name) VALUES ('Fixture Debris')`);
    expect(await formatNames()).toContain('Fixture Debris');

    await truncateAll();

    expect(await formatNames()).toEqual(SEEDED);
  });

  it('restores a seeded format a test deleted', async () => {
    /**
     * The other direction, and the reason this RESTORES rather than merely
     * deleting extras: a test that removes 'LP' would otherwise leave every
     * later test running against six formats, which is the same silent
     * cross-test contamination in reverse.
     */
    await db.execute(sql`DELETE FROM formats WHERE name = 'LP'`);
    expect(await formatNames()).not.toContain('LP');

    await truncateAll();

    expect(await formatNames()).toEqual(SEEDED);
  });

  it('restores is_seeded, not merely the row', async () => {
    /**
     * Migration 0002 marks these seven, and the API refuses to delete a seeded
     * format (§5.4's SEEDED conflict). A row restored WITHOUT the flag is
     * deletable when the real one is not — a difference invisible until a test
     * asserts on that refusal, which is exactly how this was found: four tests
     * in two other files failed after the first version of this restore.
     */
    await db.execute(sql`DELETE FROM formats WHERE name = 'Box Set'`);

    await truncateAll();

    const rows = await db.execute<{ is_seeded: boolean }>(
      sql`SELECT is_seeded FROM formats WHERE name = 'Box Set'`,
    );
    expect(rows.rows[0].is_seeded).toBe(true);
  });

  it('keeps the ids stable, so a fixture holding one is not invalidated', async () => {
    // Restoring by DELETE-and-reinsert would issue new ids and break any test
    // that captured one before the reset.
    const before = await db.execute<{ id: string }>(sql`SELECT id FROM formats WHERE name = 'LP'`);

    await truncateAll();

    const after = await db.execute<{ id: string }>(sql`SELECT id FROM formats WHERE name = 'LP'`);
    expect(after.rows[0].id).toBe(before.rows[0].id);
  });
});
