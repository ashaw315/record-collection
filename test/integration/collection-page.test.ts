import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { listRecords } from '@/lib/db/queries/records';
import type { Offset } from '@/lib/api/query-params';

/**
 * SPEC.md §10 `/`: the collection page reads through the query layer on the
 * server rather than fetching from the browser.
 *
 * This asserts the CONTRACT the page depends on — that `listRecords` with no
 * filters returns rows carrying everything the table renders. The rendering
 * itself is covered by the pure helpers in `collection-format.test.ts` and by
 * E2E #2; what would break silently is the page asking for a shape the query
 * layer stopped providing.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const PAGE = { limit: 200, offset: 0 as Offset };

const id = async (statement: ReturnType<typeof sql>) =>
  (await db.execute<{ id: string }>(statement)).rows[0].id;

describe('the collection page query', () => {
  it('returns every field the list table renders', async () => {
    const artist = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);
    const label = await id(sql`INSERT INTO labels (name) VALUES ('Clay') RETURNING id`);
    const format = await id(sql`SELECT id FROM formats WHERE name = 'LP'`);
    const store = await id(sql`INSERT INTO record_stores (name) VALUES ('Amoeba') RETURNING id`);

    await db.execute(
      sql`INSERT INTO records (artist_id, label_id, format_id, store_id, title,
                               release_year, condition_media, purchase_price)
          VALUES (${artist}, ${label}, ${format}, ${store}, 'Hear Nothing',
                  1982, 'VG+', 24.50)`,
    );

    const { rows, total } = await listRecords({ ...PAGE, filters: {} });

    expect(total).toBe(1);
    // Named individually rather than a snapshot: a snapshot updated on a
    // failure records the regression instead of catching it.
    expect(rows[0]).toMatchObject({
      title: 'Hear Nothing',
      releaseYear: 1982,
      conditionMedia: 'VG+',
      purchasePrice: '24.50',
      artist: { id: artist, name: 'Discharge' },
      label: { id: label, name: 'Clay' },
      format: { id: format, name: 'LP' },
      store: { id: store, name: 'Amoeba' },
      matchedVia: null,
    });
  });

  it('returns a record with only the required artist', async () => {
    // The quick in-store entry §10 names as the primary mobile case: a title
    // and an artist, nothing else. The table must have something to render for
    // every other column.
    const artist = await id(sql`INSERT INTO artists (name) VALUES ('Amebix') RETURNING id`);
    await db.execute(sql`INSERT INTO records (artist_id, title) VALUES (${artist}, 'Arise!')`);

    const { rows } = await listRecords({ ...PAGE, filters: {} });

    expect(rows[0]).toMatchObject({
      title: 'Arise!',
      releaseYear: null,
      conditionMedia: null,
      purchasePrice: null,
      label: null,
      format: null,
      store: null,
    });
    expect(rows[0].artist.name).toBe('Amebix');
  });

  it('orders by title when no sort is given, so the default page is stable', async () => {
    // The page passes no sort. Without a deterministic default the same
    // collection renders in a different order on each visit, which reads as
    // records moving on their own.
    const artist = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);
    for (const title of ['Why', 'Anarchy', 'Realities']) {
      await db.execute(sql`INSERT INTO records (artist_id, title) VALUES (${artist}, ${title})`);
    }

    const first = await listRecords({ ...PAGE, filters: {} });
    const second = await listRecords({ ...PAGE, filters: {} });

    expect(first.rows.map((row) => row.title)).toEqual(['Anarchy', 'Realities', 'Why']);
    expect(second.rows.map((row) => row.title)).toEqual(first.rows.map((row) => row.title));
  });

  it('reports a total larger than the page so the header can say so', async () => {
    // The page renders one page of 200 and states the total. If they were the
    // same number by construction, the "showing the first N" line could never
    // appear and a larger collection would silently truncate.
    const artist = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);
    for (let index = 0; index < 3; index++) {
      await db.execute(
        sql`INSERT INTO records (artist_id, title) VALUES (${artist}, ${`T${index}`})`,
      );
    }

    const { rows, total } = await listRecords({ ...PAGE, limit: 2, filters: {} });

    expect(rows).toHaveLength(2);
    expect(total).toBe(3);
  });
});
