import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as acquire } from '@/app/api/want-list/[id]/acquire/route';
import { acquireWantListItem } from '@/lib/db/queries/want-list';

/**
 * SPEC.md §5.3 `POST /api/want-list/:id/acquire`, and §7.3's history invariant.
 *
 * This is the most correctness-critical operation in the app. It writes TWO
 * tables, and a half-application corrupts silently:
 *
 *   - the record lands but the item is not marked → the want list still shows
 *     something the user now owns, and the acquisition is not in history;
 *   - the item is marked but the record is missing → `acquired_record_id`
 *     points at nothing, and §7.3's "the want list doubles as acquisition
 *     history" is a lie.
 *
 * Neither raises an error. Both look like success.
 *
 * The forced-failure tests below run against the QUERY-LAYER PRIMITIVE, not the
 * endpoint — deliberately, and from the start. Units 1 and 2 both showed that
 * the endpoint's pre-checks reject bad input before the transaction opens, so
 * an endpoint-only test cannot reach the state that would fail. A green suite
 * there proves nothing about atomicity.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

function jsonRequest(url: string, body: unknown): Request {
  return new Request(`https://x.test${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const id = async (statement: ReturnType<typeof sql>) =>
  (await db.execute<{ id: string }>(statement)).rows[0].id;

const UNUSED_UUID = '00000000-0000-4000-8000-000000000000';

type Fixture = {
  item: string;
  discharge: string;
  clay: string;
  uk82: string;
  gatefold: string;
  lp: string;
};

async function seed(): Promise<Fixture> {
  const discharge = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);
  const clay = await id(sql`INSERT INTO labels (name) VALUES ('Clay') RETURNING id`);
  const uk82 = await id(sql`INSERT INTO genres (name) VALUES ('UK82') RETURNING id`);
  const gatefold = await id(sql`INSERT INTO tags (name) VALUES ('Gatefold') RETURNING id`);
  const lp = await id(sql`SELECT id FROM formats WHERE name = 'LP'`);

  const item = await id(
    sql`INSERT INTO want_list (artist_id, label_id, title, priority, best_dig_notes, max_price)
        VALUES (${discharge}, ${clay}, 'Hear Nothing', 1, 'UK first press', 40.00)
        RETURNING id`,
  );

  return { item, discharge, clay, uk82, gatefold, lp };
}

describe('POST /api/want-list/:id/acquire — the happy path', () => {
  it('creates the record and returns it', async () => {
    const f = await seed();

    const response = await acquire(
      jsonRequest(`/api/want-list/${f.item}/acquire`, {
        title: 'Hear Nothing',
        artistId: f.discharge,
        purchasePrice: '24.50',
        purchaseDate: '2026-08-08',
      }),
      params(f.item),
    );

    expect(response.status).toBe(201);
    const record = await response.json();
    expect(record.title).toBe('Hear Nothing');
    expect(record.purchasePrice).toBe('24.50');
  });

  /**
   * §7.3, the rule this endpoint exists to honour: acquiring NEVER deletes the
   * want-list row. A "clean up after yourself" implementation would pass every
   * other test in this file.
   */
  it('leaves the want-list row in place, marked acquired and linked', async () => {
    const f = await seed();

    const record = await (
      await acquire(
        jsonRequest(`/api/want-list/${f.item}/acquire`, {
          title: 'Hear Nothing',
          artistId: f.discharge,
        }),
        params(f.item),
      )
    ).json();

    const rows = await db.execute<{
      id: string;
      is_acquired: boolean;
      acquired_record_id: string;
    }>(
      sql`SELECT id, is_acquired, acquired_record_id FROM want_list WHERE id = ${f.item}`,
    );

    // The row SURVIVES.
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].is_acquired).toBe(true);
    expect(rows.rows[0].acquired_record_id).toBe(record.id);
  });

  it('keeps the acquired item in acquisition history', async () => {
    // §7.3: "the want list doubles as acquisition history". The row has to be
    // findable afterwards, not merely present.
    const { GET: listWantList } = await import('@/app/api/want-list/route');
    const f = await seed();

    await acquire(
      jsonRequest(`/api/want-list/${f.item}/acquire`, {
        title: 'Hear Nothing',
        artistId: f.discharge,
      }),
      params(f.item),
    );

    const history = await (
      await listWantList(new Request('https://x.test/api/want-list?isAcquired=true'))
    ).json();

    expect(history.data.map((row: { title: string }) => row.title)).toEqual(['Hear Nothing']);
  });

  it('removes it from the default want list, which is what is still wanted', async () => {
    const { GET: listWantList } = await import('@/app/api/want-list/route');
    const f = await seed();

    await acquire(
      jsonRequest(`/api/want-list/${f.item}/acquire`, {
        title: 'Hear Nothing',
        artistId: f.discharge,
      }),
      params(f.item),
    );

    const wanted = await (
      await listWantList(new Request('https://x.test/api/want-list'))
    ).json();

    expect(wanted.data).toEqual([]);
  });

  it('preserves the best-dig notes and max price on the acquired row', async () => {
    /**
     * §7.2: those fields describe what was hunted for and what the user was
     * willing to pay. They are the interesting part of the history — an
     * acquisition that discarded them would leave a bare title.
     */
    const f = await seed();

    await acquire(
      jsonRequest(`/api/want-list/${f.item}/acquire`, {
        title: 'Hear Nothing',
        artistId: f.discharge,
      }),
      params(f.item),
    );

    const rows = await db.execute<{ best_dig_notes: string; max_price: string }>(
      sql`SELECT best_dig_notes, max_price FROM want_list WHERE id = ${f.item}`,
    );
    expect(rows.rows[0].best_dig_notes).toBe('UK first press');
    expect(rows.rows[0].max_price).toBe('40.00');
  });

  it('accepts the full record payload, including nested genres AND tags', async () => {
    /**
     * §5.3: "Body: full record payload." The same shape POST /api/records
     * takes, so acquiring is not a lesser way to create a record.
     *
     * This test asserted GENRES ONLY under a name claiming the full payload,
     * and `tagIds` was validated by the route and then dropped on the floor —
     * a silent, per-acquisition loss that the 201 concealed. The two nested
     * collections are asserted together because that is the shape of the
     * defect: one landing is what made the other look like user error.
     */
    const f = await seed();

    const record = await (
      await acquire(
        jsonRequest(`/api/want-list/${f.item}/acquire`, {
          title: 'Hear Nothing',
          artistId: f.discharge,
          labelId: f.clay,
          formatId: f.lp,
          releaseYear: 1982,
          conditionMedia: 'VG+',
          genreIds: [f.uk82],
          tagIds: [f.gatefold],
        }),
        params(f.item),
      )
    ).json();

    const genreLinks = await db.execute<{ genre_id: string }>(
      sql`SELECT genre_id FROM record_genres WHERE record_id = ${record.id}`,
    );
    expect(genreLinks.rows.map((row) => row.genre_id)).toEqual([f.uk82]);

    const tagLinks = await db.execute<{ tag_id: string }>(
      sql`SELECT tag_id FROM record_tags WHERE record_id = ${record.id}`,
    );
    expect(tagLinks.rows.map((row) => row.tag_id)).toEqual([f.gatefold]);

    expect(record.releaseYear).toBe(1982);
  });

  it('writes tags in the SAME transaction, not after it', async () => {
    /**
     * Against the query-layer primitive, per NOTES' standing expectation: the
     * route's `missingIds` pre-check rejects a bad tag before the transaction
     * runs, so no endpoint test can observe whether the tag write is inside it.
     *
     * A tag id that passes validation and then fails on INSERT is the case that
     * separates them. If tags are written after the commit, the record and its
     * genres survive with the tags missing — §5.2's "both land or neither",
     * violated in the direction that returns 201.
     */
    const f = await seed();

    await expect(
      acquireWantListItem({
        wantListId: f.item,
        values: { artistId: f.discharge, title: 'Hear Nothing' },
        genreIds: [f.uk82],
        tagIds: [UNUSED_UUID],
      }),
    ).rejects.toThrow(/record_tags/);

    const records = await db.execute<{ count: string }>(sql`SELECT COUNT(*) AS count FROM records`);
    expect(records.rows[0].count, 'the record rolled back with the tags').toBe('0');

    const item = await db.execute<{ is_acquired: boolean }>(
      sql`SELECT is_acquired FROM want_list WHERE id = ${f.item}`,
    );
    expect(item.rows[0].is_acquired).toBe(false);
  });
});

describe('POST /api/want-list/:id/acquire — rejections', () => {
  it('returns 404 for an item that does not exist', async () => {
    const f = await seed();

    const response = await acquire(
      jsonRequest(`/api/want-list/${UNUSED_UUID}/acquire`, {
        title: 'X',
        artistId: f.discharge,
      }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id rather than attempting a lookup', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const f = await seed();

    const response = await acquire(
      jsonRequest('/api/want-list/nope/acquire', { title: 'X', artistId: f.discharge }),
      params('nope'),
    );

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an already-acquired item rather than acquiring it twice', async () => {
    /**
     * Acquiring twice would orphan the first record: `acquired_record_id` holds
     * one id, so the second write would overwrite the link and leave a record
     * nothing points at. §7.3's history would then be missing an acquisition
     * that happened.
     */
    const f = await seed();

    await acquire(
      jsonRequest(`/api/want-list/${f.item}/acquire`, {
        title: 'Hear Nothing',
        artistId: f.discharge,
      }),
      params(f.item),
    );

    const second = await acquire(
      jsonRequest(`/api/want-list/${f.item}/acquire`, {
        title: 'Hear Nothing Again',
        artistId: f.discharge,
      }),
      params(f.item),
    );

    expect(second.status).toBe(409);
    const records = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records`,
    );
    expect(records.rows[0].n).toBe(1);
  });

  it('names a bad artist rather than surfacing a foreign-key error', async () => {
    const f = await seed();

    const response = await acquire(
      jsonRequest(`/api/want-list/${f.item}/acquire`, {
        title: 'X',
        artistId: UNUSED_UUID,
      }),
      params(f.item),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.artistId).toBeDefined();
  });

  it('writes nothing when validation fails', async () => {
    const f = await seed();

    await acquire(
      jsonRequest(`/api/want-list/${f.item}/acquire`, { title: '', artistId: f.discharge }),
      params(f.item),
    );

    const records = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records`);
    expect(records.rows[0].n).toBe(0);
    const item = await db.execute<{ is_acquired: boolean }>(
      sql`SELECT is_acquired FROM want_list WHERE id = ${f.item}`,
    );
    expect(item.rows[0].is_acquired).toBe(false);
  });
});

/**
 * THE ATOMICITY GATE (§11, NOTES item 14).
 *
 * Against the PRIMITIVE, not the endpoint — written this way from the start.
 * Units 1 and 2 both demonstrated that the endpoint's pre-checks reject bad
 * input before the transaction opens, so an endpoint test cannot reach a
 * mid-transaction failure and proves nothing about atomicity however green it
 * looks.
 *
 * A forced mid-transaction failure test is required by §11 specifically for
 * this operation.
 */
describe('acquireWantListItem is transactional', () => {
  it('writes NEITHER the record nor the acquisition when the second write fails', async () => {
    const { acquireWantListItem } = await import('@/lib/db/queries/want-list');
    const f = await seed();

    /**
     * The failure is forced at the MARK step, after the record insert has
     * already happened inside the transaction. That is the ordering where the
     * most state exists to roll back — and the half-application it guards
     * against is the worse of the two: a record with no want-list link, which
     * §7.3 says must not happen.
     */
    await expect(
      acquireWantListItem({
        wantListId: UNUSED_UUID, // no such row: the UPDATE matches nothing
        values: { artistId: f.discharge, title: 'Orphan Risk' },
        genreIds: [],
      tagIds: [],
      }),
    ).rejects.toThrow();

    // The record must NOT survive the failed mark.
    const records = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE title = 'Orphan Risk'`,
    );
    expect(records.rows[0].n).toBe(0);
  });

  it('rolls back the record when the genre links fail', async () => {
    const { acquireWantListItem } = await import('@/lib/db/queries/want-list');
    const f = await seed();

    await expect(
      acquireWantListItem({
        wantListId: f.item,
        values: { artistId: f.discharge, title: 'Bad Genre' },
        genreIds: [UNUSED_UUID],
      tagIds: [],
      }),
    ).rejects.toThrow(/record_genres/i);

    const records = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE title = 'Bad Genre'`,
    );
    expect(records.rows[0].n).toBe(0);

    // And the item was NOT marked — the other half of the corruption.
    const item = await db.execute<{ is_acquired: boolean; acquired_record_id: string | null }>(
      sql`SELECT is_acquired, acquired_record_id FROM want_list WHERE id = ${f.item}`,
    );
    expect(item.rows[0].is_acquired).toBe(false);
    expect(item.rows[0].acquired_record_id).toBeNull();
  });

  /**
   * The double-acquire guard, isolated from the endpoint pre-check that masks
   * it — the same pattern found in units 1 and 2, third instance.
   *
   * The endpoint refuses an already-acquired item before the transaction opens,
   * so removing `eq(wantList.isAcquired, false)` from the UPDATE fails no
   * endpoint test. That guard exists for the RACE the pre-check cannot close:
   * two concurrent acquires both read `is_acquired = false`, both proceed, and
   * the second overwrites `acquired_record_id` — orphaning the first record and
   * losing an acquisition that happened.
   */
  it('refuses to acquire an item that is already acquired', async () => {
    const { acquireWantListItem } = await import('@/lib/db/queries/want-list');
    const f = await seed();

    const first = await acquireWantListItem({
      wantListId: f.item,
      values: { artistId: f.discharge, title: 'First' },
      genreIds: [],
    tagIds: [],
    });

    await expect(
      acquireWantListItem({
        wantListId: f.item,
        values: { artistId: f.discharge, title: 'Second' },
        genreIds: [],
      tagIds: [],
      }),
    ).rejects.toThrow(/already acquired/i);

    // The FIRST record still owns the link — not overwritten.
    const item = await db.execute<{ acquired_record_id: string }>(
      sql`SELECT acquired_record_id FROM want_list WHERE id = ${f.item}`,
    );
    expect(item.rows[0].acquired_record_id).toBe(first.id);

    // And the second record was rolled back rather than orphaned.
    const orphans = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE title = 'Second'`,
    );
    expect(orphans.rows[0].n).toBe(0);
  });

  it('commits the record, the links and the mark together', async () => {
    const { acquireWantListItem } = await import('@/lib/db/queries/want-list');
    const f = await seed();

    const record = await acquireWantListItem({
      wantListId: f.item,
      values: { artistId: f.discharge, title: 'All Three' },
      genreIds: [f.uk82],
    tagIds: [],
    });

    const links = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM record_genres WHERE record_id = ${record.id}`,
    );
    expect(links.rows[0].n).toBe(1);

    const item = await db.execute<{ is_acquired: boolean; acquired_record_id: string }>(
      sql`SELECT is_acquired, acquired_record_id FROM want_list WHERE id = ${f.item}`,
    );
    expect(item.rows[0].is_acquired).toBe(true);
    expect(item.rows[0].acquired_record_id).toBe(record.id);
  });
});
