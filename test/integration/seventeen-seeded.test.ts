import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeTestDb, getTestDb, truncateAll } from '../helpers/db';
import { assertSeventeenSeeded } from '../../e2e/seventeen';

/**
 * **Global setup checks that what it seeded is exactly the capture, and fails
 * loudly if not.** Absent is honestly reported; configured-but-wrong looks
 * seeded. The check is a database read of the capture's ids, so a capture that
 * moved on from the seed, or a seed that failed half way, stops the run before
 * a spec measures the wrong records.
 */
const db = getTestDb();
beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeTestDb(); });

const rows = [
  { id: '11111111-1111-4111-8111-111111111111', title: 'First', about: null, entries: [] },
  { id: '22222222-2222-4222-8222-222222222222', title: 'Second', about: null, entries: [] },
];

async function seedAll() {
  const artist = await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES ('Seeded') RETURNING id`);
  for (const r of rows) await db.execute(sql`INSERT INTO records (id, artist_id, title) VALUES (${r.id}::uuid, ${artist.rows[0].id}::uuid, ${r.title})`);
}

describe('assertSeventeenSeeded', () => {
  it('passes when every captured id is a record', async () => {
    await seedAll();
    await expect(assertSeventeenSeeded(db, rows)).resolves.toBe(rows.length);
  });

  it('fails naming the missing title when one is absent', async () => {
    await seedAll();
    await db.execute(sql`DELETE FROM records WHERE id = ${rows[1].id}::uuid`);
    await expect(assertSeventeenSeeded(db, rows)).rejects.toThrow(/1 of 2.*Second/);
  });
});
