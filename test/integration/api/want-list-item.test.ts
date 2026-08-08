import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import {
  GET as getItem,
  PATCH as patchItem,
  DELETE as deleteItem,
} from '@/app/api/want-list/[id]/route';

/**
 * SPEC.md §5.3's `:id` routes.
 *
 * `GET` is "hydrated, including `targetPressing`" — the field §7.2 makes
 * meaningful: it names the pressing worth hunting for, which is a different
 * question from `maxPrice`, the user's ceiling. CLAUDE.md §8 forbids treating
 * one as the other, and a detail endpoint that returned a price where a
 * pressing belongs is exactly that error.
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

function request(url: string, init?: RequestInit): Request {
  return new Request(`https://x.test${url}`, init);
}

function jsonRequest(url: string, method: string, body: unknown): Request {
  return request(url, {
    method,
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
  amebix: string;
  clay: string;
  pressing: string;
  uk82: string;
  crust: string;
};

async function seed(): Promise<Fixture> {
  const discharge = await id(sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`);
  const amebix = await id(sql`INSERT INTO artists (name) VALUES ('Amebix') RETURNING id`);
  const clay = await id(sql`INSERT INTO labels (name) VALUES ('Clay') RETURNING id`);
  const uk82 = await id(sql`INSERT INTO genres (name) VALUES ('UK82') RETURNING id`);
  const crust = await id(sql`INSERT INTO genres (name) VALUES ('Crust') RETURNING id`);

  const pressing = await id(
    sql`INSERT INTO pressings (catalog_number, matrix_runout, country_pressed, year_pressed)
        VALUES ('CLAY LP 3', 'CLAYLP3-A1', 'UK', 1982) RETURNING id`,
  );

  const item = await id(
    sql`INSERT INTO want_list (artist_id, label_id, title, priority, target_pressing_id,
                               best_dig_notes, max_price)
        VALUES (${discharge}, ${clay}, 'Hear Nothing', 1, ${pressing},
                'UK first press, Porky stamp', 40.00)
        RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO want_list_genres (want_list_id, genre_id) VALUES (${item}, ${uk82})`,
  );

  return { item, discharge, amebix, clay, pressing, uk82, crust };
}

describe('GET /api/want-list/:id', () => {
  it('hydrates the artist, label and genres', async () => {
    const f = await seed();

    const body = await (await getItem(request(`/api/want-list/${f.item}`), params(f.item))).json();

    expect(body.artist).toEqual({ id: f.discharge, name: 'Discharge' });
    expect(body.label).toEqual({ id: f.clay, name: 'Clay' });
    expect(body.genres).toEqual([{ id: f.uk82, name: 'UK82' }]);
  });

  /**
   * §5.3 names `targetPressing` specifically, and §7.2 is why: it is the
   * pressing worth hunting for. Without it the client has an id and no way to
   * tell the user WHICH pressing to look for, which is the whole point of the
   * field.
   */
  it('hydrates the target pressing, not just its id', async () => {
    const f = await seed();

    const body = await (await getItem(request(`/api/want-list/${f.item}`), params(f.item))).json();

    expect(body.targetPressing).toMatchObject({
      id: f.pressing,
      catalogNumber: 'CLAY LP 3',
      matrixRunout: 'CLAYLP3-A1',
    });
  });

  it('returns null for an absent target pressing rather than omitting it', async () => {
    // Null, not undefined, so a client never branches on key presence.
    const f = await seed();
    const bare = await id(
      sql`INSERT INTO want_list (artist_id, title) VALUES (${f.amebix}, 'Arise!') RETURNING id`,
    );

    const body = await (await getItem(request(`/api/want-list/${bare}`), params(bare))).json();

    expect(body.targetPressing).toBeNull();
    expect(body.label).toBeNull();
  });

  it('keeps best-dig notes and max price as separate fields', async () => {
    // §7.2 and CLAUDE.md §8. Asserted together so neither can be derived from
    // the other by a later refactor.
    const f = await seed();

    const body = await (await getItem(request(`/api/want-list/${f.item}`), params(f.item))).json();

    expect(body.bestDigNotes).toBe('UK first press, Porky stamp');
    expect(body.maxPrice).toBe('40.00');
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await getItem(request(`/api/want-list/${UNUSED_UUID}`), params(UNUSED_UUID));

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id rather than attempting a lookup', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const response = await getItem(request('/api/want-list/nope'), params('nope'));

    expect(response.status).toBe(400);
    // A cast error reaching Postgres would be a 500, and would be logged.
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/want-list/:id', () => {
  it('updates a single field and leaves the rest alone', async () => {
    const f = await seed();

    const response = await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { priority: 5 }),
      params(f.item),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.priority).toBe(5);
    expect(body.title).toBe('Hear Nothing');
    expect(body.bestDigNotes).toBe('UK first press, Porky stamp');
  });

  /**
   * The absent-vs-null distinction, third resource to need it. Absent means
   * leave alone; explicit null means clear.
   */
  it('clears a field on an explicit null', async () => {
    const f = await seed();

    const body = await (
      await patchItem(
        jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { maxPrice: null }),
        params(f.item),
      )
    ).json();

    expect(body.maxPrice).toBeNull();
    // And the unrelated field is untouched — §7.2 again.
    expect(body.bestDigNotes).toBe('UK first press, Porky stamp');
  });

  it('leaves a field alone when it is absent from the body', async () => {
    const f = await seed();

    const body = await (
      await patchItem(
        jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { title: 'Renamed' }),
        params(f.item),
      )
    ).json();

    expect(body.maxPrice).toBe('40.00');
    expect(body.targetPressingId).toBe(f.pressing);
  });

  it('detaches a target pressing on null without deleting the pressing', async () => {
    // Pressings are shared (§4): clearing this link must not remove the row.
    const f = await seed();

    await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { targetPressingId: null }),
      params(f.item),
    );

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM pressings WHERE id = ${f.pressing}`,
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('replaces genres on an array and leaves them alone when absent', async () => {
    const f = await seed();

    await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { genreIds: [f.crust] }),
      params(f.item),
    );
    const after = await db.execute<{ genre_id: string }>(
      sql`SELECT genre_id FROM want_list_genres WHERE want_list_id = ${f.item}`,
    );
    expect(after.rows.map((row) => row.genre_id)).toEqual([f.crust]);

    // Absent: untouched.
    await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { title: 'Again' }),
      params(f.item),
    );
    const still = await db.execute<{ genre_id: string }>(
      sql`SELECT genre_id FROM want_list_genres WHERE want_list_id = ${f.item}`,
    );
    expect(still.rows.map((row) => row.genre_id)).toEqual([f.crust]);
  });

  it('removes every genre on an empty array', async () => {
    // [] means REMOVE ALL — the distinction a `.default([])` would destroy.
    const f = await seed();

    await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { genreIds: [] }),
      params(f.item),
    );

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list_genres WHERE want_list_id = ${f.item}`,
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it('rejects a priority outside 1-5', async () => {
    const f = await seed();

    const response = await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { priority: 9 }),
      params(f.item),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.priority).toBeDefined();
  });

  it('rejects an empty body rather than reporting a no-op success', async () => {
    const f = await seed();

    const response = await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', {}),
      params(f.item),
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchItem(
      jsonRequest(`/api/want-list/${UNUSED_UUID}`, 'PATCH', { priority: 2 }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('names a bad target pressing rather than surfacing a foreign-key error', async () => {
    const f = await seed();

    const response = await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', { targetPressingId: UNUSED_UUID }),
      params(f.item),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.targetPressingId).toBeDefined();
  });

  it('writes nothing when a nested id is invalid', async () => {
    /**
     * The atomicity shape from step 5's PATCH: a bad genre must not leave the
     * scalar update committed. Rehearsal for unit 3, where the same masking is
     * expected.
     */
    const f = await seed();

    await patchItem(
      jsonRequest(`/api/want-list/${f.item}`, 'PATCH', {
        title: 'Should Not Land',
        genreIds: [UNUSED_UUID],
      }),
      params(f.item),
    );

    const rows = await db.execute<{ title: string }>(
      sql`SELECT title FROM want_list WHERE id = ${f.item}`,
    );
    expect(rows.rows[0].title).toBe('Hear Nothing');
  });
});

describe('DELETE /api/want-list/:id', () => {
  it('removes the item and its genre links', async () => {
    const f = await seed();

    const response = await deleteItem(
      request(`/api/want-list/${f.item}`, { method: 'DELETE' }),
      params(f.item),
    );

    expect(response.status).toBe(200);
    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list WHERE id = ${f.item}`,
    );
    expect(rows.rows[0].n).toBe(0);
    const links = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM want_list_genres WHERE want_list_id = ${f.item}`,
    );
    expect(links.rows[0].n).toBe(0);
  });

  it('does not delete the target pressing, which is shared', async () => {
    // §4: pressings are shared reference rows, not owned by the item.
    const f = await seed();

    await deleteItem(request(`/api/want-list/${f.item}`, { method: 'DELETE' }), params(f.item));

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM pressings WHERE id = ${f.pressing}`,
    );
    expect(rows.rows[0].n).toBe(1);
  });

  /**
   * §7.3 says ACQUIRING never deletes the row. It does not forbid an explicit
   * user delete, and the schema cascades cleanly, so this is allowed — but the
   * acquired record itself must survive, since deleting the history entry must
   * not touch what was acquired.
   */
  it('leaves the acquired record intact when an acquired item is deleted', async () => {
    const f = await seed();
    const record = await id(
      sql`INSERT INTO records (artist_id, title) VALUES (${f.amebix}, 'Arise!') RETURNING id`,
    );
    const acquired = await id(
      sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
          VALUES (${f.amebix}, 'Arise!', true, ${record}) RETURNING id`,
    );

    const response = await deleteItem(
      request(`/api/want-list/${acquired}`, { method: 'DELETE' }),
      params(acquired),
    );

    expect(response.status).toBe(200);
    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM records WHERE id = ${record}`,
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await deleteItem(
      request(`/api/want-list/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    const response = await deleteItem(request('/api/want-list/nope', { method: 'DELETE' }), params('nope'));

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });
});

/**
 * The PATCH transaction, isolated from the pre-checks that mask it.
 *
 * PREDICTED before it was measured: unit 1 found the same masking on POST, and
 * the same shape is present here. `missingIds` rejects a bad genre BEFORE the
 * transaction opens, so every endpoint test above passes with or without it —
 * confirmed by mutation, which failed nothing.
 *
 * The transaction covers what the pre-checks cannot anticipate: a genre deleted
 * in the window between check and insert. Tested against the query-layer
 * primitive, because the endpoint cannot reach that state.
 *
 * This is deliberate rehearsal for the acquire flow, where the same masking is
 * expected and a half-application is §7.3's corruption rather than an orphan.
 */
describe('updateWantListItem is transactional', () => {
  it('rolls back the scalar update when the genre write fails', async () => {
    const { updateWantListItem: update } = await import('@/lib/db/queries/want-list');
    const f = await seed();

    await expect(
      update({
        id: f.item,
        values: { title: 'Should Roll Back' },
        // Fails on the foreign key AFTER the title has been written.
        genreIds: [f.crust, UNUSED_UUID],
      }),
    ).rejects.toThrow(/want_list_genres/i);

    const rows = await db.execute<{ title: string }>(
      sql`SELECT title FROM want_list WHERE id = ${f.item}`,
    );
    expect(rows.rows[0].title).toBe('Hear Nothing');

    // And the original genre survived the failed replacement.
    const links = await db.execute<{ genre_id: string }>(
      sql`SELECT genre_id FROM want_list_genres WHERE want_list_id = ${f.item}`,
    );
    expect(links.rows.map((row) => row.genre_id)).toEqual([f.uk82]);
  });

  it('commits the scalar update and the genre replacement together', async () => {
    const { updateWantListItem: update } = await import('@/lib/db/queries/want-list');
    const f = await seed();

    await update({ id: f.item, values: { title: 'Both Landed' }, genreIds: [f.crust] });

    const rows = await db.execute<{ title: string }>(
      sql`SELECT title FROM want_list WHERE id = ${f.item}`,
    );
    expect(rows.rows[0].title).toBe('Both Landed');
    const links = await db.execute<{ genre_id: string }>(
      sql`SELECT genre_id FROM want_list_genres WHERE want_list_id = ${f.item}`,
    );
    expect(links.rows.map((row) => row.genre_id)).toEqual([f.crust]);
  });
});
