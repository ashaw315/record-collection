import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { closeTestDb, getTestDb, truncateAll } from '../helpers/db';
import { captureRealRecords, diffRows } from '../../scripts/real-records-capture.mjs';

/**
 * **The seventeen are captured from the database, never typed.**
 *
 * `src/app/records/[id]/real-records.ts` said "every real record id in the
 * collection" and held four real ids, eight the database never had and five
 * synthetic ones (29 Sep). The unit floor tests measured thirteen drawings the
 * collection does not contain. This is the query that produces
 * `docs/captures/real-records.json`, run against the local test database with
 * rows this test inserted, so the shape it emits is asserted rather than
 * assumed.
 */
const db = getTestDb();
beforeEach(async () => { await truncateAll(); });
afterAll(async () => { await closeTestDb(); });

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

async function seed() {
  const artist = await db.execute<{ id: string }>(sql`INSERT INTO artists (name) VALUES ('Capture Artist') RETURNING id`);
  const artistId = artist.rows[0].id;
  await db.execute(sql`INSERT INTO records (id, artist_id, title, snippet, created_at) VALUES
    (${B}::uuid, ${artistId}::uuid, 'Second', 'A real About.', '2026-08-12T10:00:00Z'),
    (${A}::uuid, ${artistId}::uuid, 'First', '', '2026-08-11T10:00:00Z'),
    (${C}::uuid, ${artistId}::uuid, 'Third', NULL, '2026-08-13T10:00:00Z')`);
  await db.execute(sql`INSERT INTO journal_entries (record_id, entry_date, note, created_at) VALUES
    (${A}::uuid, '2026-08-20', 'Later entry', '2026-08-20T10:00:00Z'),
    (${A}::uuid, '2026-08-12', 'Earlier entry', '2026-08-12T10:00:00Z')`);
}

describe('captureRealRecords', () => {
  it('emits every record in creation order with its About and its journal entries, in the file’s shape', async () => {
    await seed();
    const rows = await captureRealRecords(process.env.TEST_DATABASE_URL);
    /* The artist is the record's own (29 Sep): the seed had put all seventeen under one stand-in, which left §45's pair term inert. */
    expect(rows).toEqual([
      { id: A, title: 'First', artist: 'Capture Artist', about: null, entries: [{ entryDate: '2026-08-12', note: 'Earlier entry' }, { entryDate: '2026-08-20', note: 'Later entry' }] },
      { id: B, title: 'Second', artist: 'Capture Artist', about: 'A real About.', entries: [] },
      { id: C, title: 'Third', artist: 'Capture Artist', about: null, entries: [] },
    ]);
  });

  it('is empty on an empty collection, and says so rather than inventing rows', async () => {
    expect(await captureRealRecords(process.env.TEST_DATABASE_URL)).toEqual([]);
  });
});

describe('diffRows', () => {
  const r = (id: string, title: string, about: string | null = null) => ({ id, title, artist: 'A', about, entries: [] });
  it('names what a re-capture adds, removes and changes, by title', () => {
    const before = [r(A, 'First'), r(B, 'Second', 'old')];
    const after = [r(B, 'Second', 'new'), r(C, 'Third')];
    expect(diffRows(before, after)).toEqual({ added: ['Third'], removed: ['First'], changed: ['Second'], unchanged: 0 });
  });
  it('reports nothing changed when the sets agree', () => {
    const rows = [r(A, 'First'), r(B, 'Second', 'same')];
    expect(diffRows(rows, rows.map((x) => ({ ...x })))).toEqual({ added: [], removed: [], changed: [], unchanged: 2 });
  });
});
