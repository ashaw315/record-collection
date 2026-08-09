import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listWantList, POST as createWantListItem } from '@/app/api/want-list/route';

/**
 * SPEC.md §5.3 `GET /api/want-list` and `POST /api/want-list`.
 *
 * Two rules govern this resource and neither is obvious from the schema:
 *
 *   §7.3 — the want list doubles as ACQUISITION HISTORY. Acquired rows are not
 *          deleted, so the list must exclude them BY DEFAULT while keeping them
 *          reachable. A list that showed them by default would fill with
 *          records the user already owns.
 *   §7.2 — `best_dig_notes` describes the highest-fidelity pressing worth
 *          hunting; `max_price` is the user's own ceiling. They are unrelated
 *          (CLAUDE.md §8) and nothing here may treat one as the other.
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

function request(url: string): Request {
  return new Request(`https://x.test${url}`);
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(`https://x.test${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function titles(url: string): Promise<string[]> {
  const response = await listWantList(request(url));
  const body = await response.json();
  return body.data.map((row: { title: string }) => row.title).sort();
}

const id = async (statement: ReturnType<typeof sql>) =>
  (await db.execute<{ id: string }>(statement)).rows[0].id;

type Seeded = {
  discharge: string;
  amebix: string;
  clay: string;
  punk: string;
  uk82: string;
  crust: string;
  wanted: string;
  acquiredItem: string;
};

/**
 * Two artists, a genre hierarchy, and one row already acquired — so the default
 * exclusion has something to exclude and `isAcquired=true` something to find.
 */
async function seed(): Promise<Seeded> {
  const discharge = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);
  const amebix = await id(sql`INSERT INTO artists (name) VALUES ('Amebix') RETURNING id`);
  const clay = await id(sql`INSERT INTO labels (name) VALUES ('Clay') RETURNING id`);

  const punk = await id(sql`INSERT INTO genres (name) VALUES ('Punk') RETURNING id`);
  const uk82 = await id(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES ('UK82', ${punk}) RETURNING id`,
  );
  const crust = await id(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Crust', ${punk}) RETURNING id`,
  );

  const wanted = await id(
    sql`INSERT INTO want_list (artist_id, label_id, title, priority, best_dig_notes, max_price)
        VALUES (${discharge}, ${clay}, 'Hear Nothing', 1, 'UK first press, Porky stamp', 40.00)
        RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO want_list_genres (want_list_id, genre_id) VALUES (${wanted}, ${uk82})`,
  );

  // Already owned: linked to a real record, per §7.3.
  const record = await id(
    sql`INSERT INTO records (artist_id, title) VALUES (${amebix}, 'Arise!') RETURNING id`,
  );
  const acquiredItem = await id(
    sql`INSERT INTO want_list (artist_id, title, priority, is_acquired, acquired_record_id)
        VALUES (${amebix}, 'Arise!', 2, true, ${record}) RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO want_list_genres (want_list_id, genre_id) VALUES (${acquiredItem}, ${crust})`,
  );

  return { discharge, amebix, clay, punk, uk82, crust, wanted, acquiredItem };
}

describe('GET /api/want-list — the §7.3 default', () => {
  it('excludes acquired items by default', async () => {
    /**
     * §5.3: "Default excludes acquired." The want list is what you are still
     * hunting for; showing owned records by default would fill it with things
     * to ignore.
     */
    await seed();

    expect(await titles('/api/want-list')).toEqual(['Hear Nothing']);
  });

  it('returns only acquired items on isAcquired=true', async () => {
    // The acquisition-history view (§7.3). The row was never deleted.
    await seed();

    expect(await titles('/api/want-list?isAcquired=true')).toEqual(['Arise!']);
  });

  it('returns both when isAcquired=false is explicit', async () => {
    // Explicit false means the same as the default, not "everything".
    await seed();

    expect(await titles('/api/want-list?isAcquired=false')).toEqual(['Hear Nothing']);
  });

  it('reports the filtered total, not the table total', async () => {
    await seed();

    const body = await (await listWantList(request('/api/want-list'))).json();

    expect(body.meta.total).toBe(1);
    expect(body.data).toHaveLength(1);
  });
});

describe('GET /api/want-list — filters', () => {
  it('filters by artist', async () => {
    const s = await seed();

    expect(await titles(`/api/want-list?artistId=${s.discharge}`)).toEqual(['Hear Nothing']);
  });

  it('filters by priority', async () => {
    const s = await seed();
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${s.amebix}, 'Winter', 1)`,
    );

    expect(await titles('/api/want-list?priority=1')).toEqual(['Hear Nothing', 'Winter']);
  });

  /**
   * §7.1 applies here too: a want-list item tagged with a child genre is a
   * member of every ancestor. The records endpoint learned this the hard way in
   * step 5 — filtering by Punk returned nothing.
   */
  it('applies the genre hierarchy, so a parent finds a child-tagged item', async () => {
    const s = await seed();

    expect(await titles(`/api/want-list?genreId=${s.punk}`)).toEqual(['Hear Nothing']);
  });

  it('finds an item by its own genre', async () => {
    const s = await seed();

    expect(await titles(`/api/want-list?genreId=${s.uk82}`)).toEqual(['Hear Nothing']);
  });

  it('does not return a sibling subtree', async () => {
    // Crust is the acquired item's genre; filtering by it must not surface the
    // UK82 row, and the acquired row is excluded by default anyway.
    const s = await seed();

    expect(await titles(`/api/want-list?genreId=${s.crust}`)).toEqual([]);
  });

  it('composes filters rather than widening', async () => {
    // The defect a single-filter test cannot catch.
    const s = await seed();

    expect(await titles(`/api/want-list?genreId=${s.punk}&artistId=${s.amebix}`)).toEqual([]);
  });

  it('rejects an unknown filter value rather than ignoring it', async () => {
    // Silently dropping a bad filter returns MORE rows than asked for, which
    // reads as success.
    const response = await listWantList(request('/api/want-list?priority=nope'));

    expect(response.status).toBe(400);
    // The message, not just a key: `.toBeDefined()` cannot distinguish a
    // considered rejection from an error that leaked out of the driver.
    expect((await response.json()).error.fieldErrors.priority).toMatch(/priority/i);
  });

  it('rejects a non-boolean isAcquired rather than coercing it', async () => {
    /**
     * The Zod coercion class from NOTES: `z.coerce.boolean()` makes every
     * non-empty string true, so `isAcquired=false` would mean TRUE and the list
     * would show only owned records.
     */
    const response = await listWantList(request('/api/want-list?isAcquired=maybe'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.isAcquired).toMatch(
      /true|false|boolean/i,
    );
  });
});

describe('GET /api/want-list — ordering', () => {
  it('orders by priority ascending, since 1 is highest', async () => {
    // §4.2: "1 = highest, 5 = lowest". Ascending puts the most wanted first,
    // which is the only ordering that makes the screen useful.
    const s = await seed();
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${s.amebix}, 'Third', 3)`,
    );
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${s.amebix}, 'Second', 2)`,
    );

    const body = await (await listWantList(request('/api/want-list'))).json();

    expect(body.data.map((row: { title: string }) => row.title)).toEqual([
      'Hear Nothing',
      'Second',
      'Third',
    ]);
  });
});

describe('POST /api/want-list', () => {
  it('creates an item with only the required fields', async () => {
    // Quick entry: a title and an artist. Everything else is optional (§4.2).
    const s = await seed();

    const response = await createWantListItem(
      jsonRequest('/api/want-list', { title: 'Why', artistId: s.discharge }),
    );

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.title).toBe('Why');
    // §4.2's default: priority 3 when unspecified.
    expect(created.priority).toBe(3);
    expect(created.isAcquired).toBe(false);
  });

  it('stores best-dig notes and a max price as SEPARATE fields', async () => {
    /**
     * §7.2 and CLAUDE.md §8: "best dig" is the highest-fidelity pressing worth
     * hunting for; `max_price` is what the user will pay. They are unrelated,
     * and conflating them is the single domain error this app must not make.
     * Asserted together so a future refactor cannot quietly merge them.
     */
    const s = await seed();

    const created = await (
      await createWantListItem(
        jsonRequest('/api/want-list', {
          title: 'Realities of War',
          artistId: s.discharge,
          bestDigNotes: 'Original Clay press, matrix A1/B1',
          maxPrice: '35.00',
        }),
      )
    ).json();

    expect(created.bestDigNotes).toBe('Original Clay press, matrix A1/B1');
    expect(created.maxPrice).toBe('35.00');
  });

  it('rejects a priority outside 1-5', async () => {
    /**
     * §4.2 says "1 = highest, 5 = lowest" and there is NO database CHECK —
     * verified against pg_constraint. The API boundary is the only guard, so a
     * priority of 99 would otherwise land and sort last forever.
     */
    const s = await seed();

    for (const priority of [0, 6, -1, 99]) {
      const response = await createWantListItem(
        jsonRequest('/api/want-list', { title: 'X', artistId: s.discharge, priority }),
      );

      expect(response.status, `priority ${priority}`).toBe(400);
      expect((await response.json()).error.fieldErrors.priority).toBeDefined();
    }
  });

  it('accepts every priority inside 1-5', async () => {
    const s = await seed();

    for (const priority of [1, 2, 3, 4, 5]) {
      const response = await createWantListItem(
        jsonRequest('/api/want-list', {
          title: `P${priority}`,
          artistId: s.discharge,
          priority,
        }),
      );
      expect(response.status, `priority ${priority}`).toBe(201);
    }
  });

  it('names a missing artist rather than surfacing a foreign-key error', async () => {
    const response = await createWantListItem(
      jsonRequest('/api/want-list', {
        title: 'X',
        artistId: '00000000-0000-4000-8000-000000000000',
      }),
    );

    expect(response.status).toBe(400);
    // Named, not surfaced as a foreign-key violation — the same claim the
    // PATCH counterpart makes and did not check.
    const body = await response.json();
    expect(body.error.fieldErrors.artistId).toMatch(/no artist with that id exists/i);
    expect(body.error.fieldErrors.artistId, 'no SQL leaks').not.toMatch(
      /constraint|violates|relation/i,
    );
  });

  it('rejects a body with unknown keys', async () => {
    // §5: reject unknown keys. A typo'd field name must not be silently ignored.
    const s = await seed();

    const response = await createWantListItem(
      jsonRequest('/api/want-list', { title: 'X', artistId: s.discharge, maxPice: '10.00' }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a blank title rather than storing one', async () => {
    const s = await seed();

    const response = await createWantListItem(
      jsonRequest('/api/want-list', { title: '   ', artistId: s.discharge }),
    );

    expect(response.status).toBe(400);
  });

  it('creates nothing when validation fails', async () => {
    const s = await seed();
    const before = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list`,
    );

    await createWantListItem(
      jsonRequest('/api/want-list', { title: 'X', artistId: s.discharge, priority: 99 }),
    );

    const after = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM want_list`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('writes genre links transactionally with the item', async () => {
    /**
     * NOTES item 9, re-applying to want_list: the parent and its junction rows
     * must land together. An item created with its genres silently dropped
     * looks successful and loses the §8 graph edges.
     */
    const s = await seed();

    const created = await (
      await createWantListItem(
        jsonRequest('/api/want-list', {
          title: 'Genred',
          artistId: s.discharge,
          genreIds: [s.uk82],
        }),
      )
    ).json();

    const links = await db.execute<{ genre_id: string }>(
      sql`SELECT genre_id FROM want_list_genres WHERE want_list_id = ${created.id}`,
    );
    expect(links.rows.map((row) => row.genre_id)).toEqual([s.uk82]);
  });

  it('rejects a bad genre id without creating the item', async () => {
    const s = await seed();
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const response = await createWantListItem(
      jsonRequest('/api/want-list', {
        title: 'Bad Genre',
        artistId: s.discharge,
        genreIds: ['00000000-0000-4000-8000-000000000000'],
      }),
    );

    expect(response.status).toBe(400);
    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list WHERE title = 'Bad Genre'`,
    );
    expect(rows.rows[0].n).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * The transactional guarantee, isolated from the pre-check that masks it.
 *
 * `missingIds` rejects a bad genre BEFORE the transaction opens, so every
 * endpoint test above passes with or without the transaction — verified by
 * mutation, which failed nothing. That is NOTES case 3: the pre-check and the
 * transaction produce the same observable outcome by different mechanisms, and
 * both are real.
 *
 * The transaction covers the failures the pre-check does NOT anticipate — a
 * genre deleted in the window between check and insert, most obviously. Tested
 * against the query-layer primitive directly, because the endpoint cannot
 * reach that state.
 */
describe('createWantListItem is transactional', () => {
  it('writes neither the item nor its links when a genre id is invalid', async () => {
    const { createWantListItem: createItem } = await import('@/lib/db/queries/want-list');
    const s = await seed();

    await expect(
      createItem({
        values: { artistId: s.discharge, title: 'Half Written' },
        // A genre that does not exist: the insert fails on the foreign key
        // AFTER the parent row has been written.
        genreIds: [s.uk82, '00000000-0000-4000-8000-000000000000'],
      }),
    ).rejects.toThrow(/want_list_genres/i);

    // The parent must have rolled back with them.
    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list WHERE title = 'Half Written'`,
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it('commits the item and its links together on success', async () => {
    const { createWantListItem: createItem } = await import('@/lib/db/queries/want-list');
    const s = await seed();

    const created = await createItem({
      values: { artistId: s.discharge, title: 'Whole' },
      genreIds: [s.uk82, s.crust],
    });

    const links = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list_genres WHERE want_list_id = ${created.id}`,
    );
    expect(links.rows[0].n).toBe(2);
  });
});
