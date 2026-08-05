import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, closeTestDb } from '../helpers/db';

/**
 * SPEC.md §4.1: the seven seeded formats carry `is_seeded = true`, and that
 * column — not their names — is what protects them from deletion.
 *
 * Deliberately does NOT truncate: `formats` is the one table `truncateAll`
 * preserves, because these rows are migration-created reference data rather
 * than test state. That makes this the only place the migration's backfill is
 * observable, and it would fail against the UPDATE statement in
 * drizzle/0002_formats_is_seeded.sql — Drizzle generated only the ADD COLUMN,
 * which would have left every row false and the guard protecting nothing.
 */

const db = getTestDb();

afterAll(async () => {
  await closeTestDb();
});

const SEEDED = ['LP', '2xLP', '7"', '10"', '12" Single', 'Box Set', 'Picture Disc'];

describe('formats seed data (SPEC.md §4.1)', () => {
  it('contains exactly the seven seeded formats', async () => {
    const rows = await db.execute<{ name: string }>(
      sql`SELECT name FROM formats WHERE is_seeded = true ORDER BY name`,
    );

    expect(rows.rows.map((r) => r.name).sort()).toEqual([...SEEDED].sort());
  });

  it('marks every seeded row is_seeded = true, not merely some', async () => {
    // The backfill matched by name. A typo in any one of the seven would leave
    // that row unprotected while the other six looked correct.
    for (const name of SEEDED) {
      const rows = await db.execute<{ is_seeded: boolean }>(
        sql`SELECT is_seeded FROM formats WHERE name = ${name}`,
      );

      expect(rows.rows, `${name} is missing from formats`).toHaveLength(1);
      expect(rows.rows[0].is_seeded, `${name} must be marked seeded`).toBe(true);
    }
  });

  it('defaults is_seeded to false for a newly created format', async () => {
    // The column default is what makes every user-created format deletable.
    await db.execute(sql`INSERT INTO formats (name) VALUES ('unit-test-cassette')`);
    try {
      const rows = await db.execute<{ is_seeded: boolean }>(
        sql`SELECT is_seeded FROM formats WHERE name = 'unit-test-cassette'`,
      );

      expect(rows.rows[0].is_seeded).toBe(false);
    } finally {
      await db.execute(sql`DELETE FROM formats WHERE name = 'unit-test-cassette'`);
    }
  });
});
