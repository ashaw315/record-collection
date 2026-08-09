import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listPressings, POST as createPressing } from '@/app/api/pressings/route';
import {
  GET as getPressing,
  PATCH as patchPressing,
  DELETE as deletePressing,
} from '@/app/api/pressings/[id]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.4 CRUD for `pressings`, plus §4's find-or-create rule.
 *
 * `pressings` is a CORE table, not reference data, and the difference drives
 * everything here: rows are SHARED between a `records` row and a
 * `want_list.target_pressing_id`, so POST is find-or-create rather than plain
 * create, and a careless match silently rewrites another record's pressing.
 *
 * Verified backstops before writing: `discogs_release_id` has a partial unique
 * index, but the (catalog, country, year) tuple has NONE — duplicates insert
 * cleanly — so find-or-create is the only dedup. An all-null tuple also matches
 * any other all-null row, which is the hazard §4 now addresses explicitly.
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

const UNUSED_UUID = '00000000-0000-4000-8000-000000000000';

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

async function insertPressing(fields: {
  catalogNumber?: string | null;
  countryPressed?: string | null;
  yearPressed?: number | null;
  discogsReleaseId?: number | null;
  matrixRunout?: string | null;
}): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO pressings (catalog_number, country_pressed, year_pressed, discogs_release_id, matrix_runout)
        VALUES (${fields.catalogNumber ?? null}, ${fields.countryPressed ?? null},
                ${fields.yearPressed ?? null}, ${fields.discogsReleaseId ?? null},
                ${fields.matrixRunout ?? null})
        RETURNING id`,
  );
  return rows.rows[0].id;
}

async function pressingCount(): Promise<number> {
  const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM pressings`);
  return rows.rows[0].n;
}

async function insertArtist(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

describe('unauthenticated access', () => {
  it('routes both paths through middleware as session-protected', () => {
    expect(middlewareRuns('/api/pressings')).toBe(true);
    expect(middlewareRuns(`/api/pressings/${UNUSED_UUID}`)).toBe(true);
    expect(routeAuthMode('/api/pressings')).toBe('session');
    expect(routeAuthMode(`/api/pressings/${UNUSED_UUID}`)).toBe('session');
  });
});

describe('unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks nothing when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await db.execute(sql`ALTER TABLE pressings RENAME TO pressings_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await listPressings(request('/api/pressings'));
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE pressings_hidden RENAME TO pressings`);
    }

    expect(status).toBe(500);
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('pressings_hidden');
  });
});

describe('GET /api/pressings', () => {
  it('returns the §5 list envelope with every field', async () => {
    await insertPressing({ catalogNumber: 'ABC-1', countryPressed: 'UK', yearPressed: 1981 });

    const response = await listPressings(request('/api/pressings'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta).toEqual({ total: 1, page: 1, pageSize: 50 });
    expect(body.data[0]).toMatchObject({
      catalogNumber: 'ABC-1',
      countryPressed: 'UK',
      yearPressed: 1981,
      isReissue: false,
    });
  });

  it('rejects an out-of-range page with 400, never reaching SQL', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const response = await listPressings(request('/api/pressings?page=99999999999999999999'));

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a real but unenumerated sort column with 400', async () => {
    const response = await listPressings(request('/api/pressings?sort=matrixRunout:asc'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.sort).toBeDefined();
  });

  it('puts null yearPressed last in BOTH directions', async () => {
    await insertPressing({ catalogNumber: 'A', yearPressed: 1981 });
    await insertPressing({ catalogNumber: 'B', yearPressed: null });
    await insertPressing({ catalogNumber: 'C', yearPressed: 1977 });

    const asc = await listPressings(request('/api/pressings?sort=yearPressed:asc'));
    const ascYears = (await asc.json()).data.map((p: { yearPressed: number | null }) => p.yearPressed);
    expect(ascYears).toEqual([1977, 1981, null]);

    const desc = await listPressings(request('/api/pressings?sort=yearPressed:desc'));
    const descYears = (await desc.json()).data.map(
      (p: { yearPressed: number | null }) => p.yearPressed,
    );
    expect(descYears).toEqual([1981, 1977, null]);
  });
});

// --- POST /api/pressings — find-or-create (§4) -------------------------------

describe('POST /api/pressings — matching by discogsReleaseId', () => {
  it('creates when no pressing has that discogs id', async () => {
    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { discogsReleaseId: 12345, catalogNumber: 'ABC-1' }),
    );

    expect(response.status).toBe(201);
    expect(await pressingCount()).toBe(1);
  });

  it('FINDS the existing pressing rather than creating a second', async () => {
    const existing = await insertPressing({ discogsReleaseId: 12345, catalogNumber: 'ABC-1' });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { discogsReleaseId: 12345 }),
    );

    // 200, not 201: nothing was created.
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(existing);
    expect(await pressingCount()).toBe(1);
  });

  it('prefers the discogs id over the tuple when both are present', async () => {
    // §4: "find-or-create by discogs_release_id IF PRESENT, otherwise by the
    // tuple". A row with the same discogs id but a different tuple is still the
    // same pressing.
    const existing = await insertPressing({
      discogsReleaseId: 12345,
      catalogNumber: 'ABC-1',
      countryPressed: 'UK',
      yearPressed: 1981,
    });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', {
        discogsReleaseId: 12345,
        catalogNumber: 'TOTALLY-DIFFERENT',
        countryPressed: 'US',
        yearPressed: 1990,
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(existing);
    expect(await pressingCount()).toBe(1);
  });

  it('matches on the discogs id ALONE, with no tuple overlap', async () => {
    // Isolates the discogs branch from the tuple fallback. Without this, the
    // whole `if (discogsReleaseId)` path can be deleted and every other test
    // still passes, because the fixtures share a catalog number that the tuple
    // query matches instead — verified by mutation.
    const existing = await insertPressing({
      discogsReleaseId: 12345,
      catalogNumber: 'UK-ONLY',
      countryPressed: 'UK',
      yearPressed: 1981,
    });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { discogsReleaseId: 12345 }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(existing);
    expect(await pressingCount()).toBe(1);
  });

  it('does not match a pressing whose discogs id is null', async () => {
    await insertPressing({ catalogNumber: 'ABC-1', countryPressed: 'UK', yearPressed: 1981 });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { discogsReleaseId: 12345 }),
    );

    expect(response.status).toBe(201);
    expect(await pressingCount()).toBe(2);
  });
});

describe('POST /api/pressings — matching by the (catalog, country, year) tuple', () => {
  it('FINDS an existing pressing with the identical tuple', async () => {
    const existing = await insertPressing({
      catalogNumber: 'ABC-1',
      countryPressed: 'UK',
      yearPressed: 1981,
    });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', {
        catalogNumber: 'ABC-1',
        countryPressed: 'UK',
        yearPressed: 1981,
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(existing);
    expect(await pressingCount()).toBe(1);
  });

  it('matches when only ONE tuple field is present, if it matches', async () => {
    // A partial key is still a key: a request with just a catalog number must
    // find the row whose other tuple fields are null.
    const existing = await insertPressing({ catalogNumber: 'ABC-1' });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { catalogNumber: 'ABC-1' }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(existing);
    expect(await pressingCount()).toBe(1);
  });

  it('CREATES when any tuple field differs', async () => {
    // Different country is a genuinely different pressing — the distinction
    // CLAUDE.md §8 says is the worst thing to flatten.
    await insertPressing({ catalogNumber: 'ABC-1', countryPressed: 'UK', yearPressed: 1981 });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', {
        catalogNumber: 'ABC-1',
        countryPressed: 'US',
        yearPressed: 1981,
      }),
    );

    expect(response.status).toBe(201);
    expect(await pressingCount()).toBe(2);
  });

  it('treats a present field and a null field as different keys', async () => {
    // (ABC-1, null, null) and (ABC-1, UK, 1981) are different pressings.
    await insertPressing({ catalogNumber: 'ABC-1' });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', {
        catalogNumber: 'ABC-1',
        countryPressed: 'UK',
        yearPressed: 1981,
      }),
    );

    expect(response.status).toBe(201);
    expect(await pressingCount()).toBe(2);
  });
});

/**
 * §4's degenerate case, added after this was flagged: find-or-create applies
 * ONLY when the match key is non-empty.
 *
 * Verified hazard — an all-null tuple matches any other all-null row in SQL, so
 * without this rule two unrelated white labels silently share one pressing and
 * an edit to one rewrites the other's record.
 */
describe('POST /api/pressings — the empty match key always creates', () => {
  it('creates a new row rather than matching an existing all-null pressing', async () => {
    const first = await insertPressing({});

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { notes: 'white label, no markings' }),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).id).not.toBe(first);
    expect(await pressingCount()).toBe(2);
  });

  it('creates twice for two identical empty requests', async () => {
    // The accepted cost: two blank pressings are visible and deletable, a
    // silent merge is neither.
    await createPressing(jsonRequest('/api/pressings', 'POST', {}));
    await createPressing(jsonRequest('/api/pressings', 'POST', {}));

    expect(await pressingCount()).toBe(2);
  });

  it('CREATES when only matrixRunout is supplied, never matching on it', async () => {
    // §4: matrix_runout counts as identifying but is NOT part of the match key.
    // Runout transcriptions are frequently partial, and a false merge silently
    // rewrites another record's pressing.
    await insertPressing({ matrixRunout: 'ABC-1-A1 PORKY' });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { matrixRunout: 'ABC-1-A1 PORKY' }),
    );

    expect(response.status).toBe(201);
    expect(await pressingCount()).toBe(2);
  });

  it('does not let matrixRunout suppress a tuple match', async () => {
    // Matrix is not in the key, so a matching tuple still matches even when the
    // runout differs.
    const existing = await insertPressing({
      catalogNumber: 'ABC-1',
      countryPressed: 'UK',
      yearPressed: 1981,
      matrixRunout: 'A1',
    });

    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', {
        catalogNumber: 'ABC-1',
        countryPressed: 'UK',
        yearPressed: 1981,
        matrixRunout: 'COMPLETELY DIFFERENT',
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(existing);
  });
});

describe('POST /api/pressings — validation', () => {
  it('rejects unknown keys', async () => {
    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { catalogNumber: 'ABC-1', id: UNUSED_UUID }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createPressing(
      request('/api/pressings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('rejects an out-of-range yearPressed', async () => {
    const response = await createPressing(
      jsonRequest('/api/pressings', 'POST', { catalogNumber: 'X', yearPressed: 999999 }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.yearPressed).toBeDefined();
  });

  it('returns 200 when a concurrent create claims the same discogs id', async () => {
    // The pre-check is not a lock; the partial unique index is. Losing that
    // race means the pressing now exists, which is what the caller wanted —
    // so this resolves to a find, not a 409.
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/pressings');

    const claim = vi.spyOn(queries, 'findMatchingPressing').mockImplementation(async () => {
      await insertPressing({ discogsReleaseId: 12345 });
      return undefined;
    });

    try {
      const response = await createPressing(
        jsonRequest('/api/pressings', 'POST', { discogsReleaseId: 12345 }),
      );

      expect(response.status).toBe(200);
      expect(await pressingCount()).toBe(1);
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('GET /api/pressings/:id', () => {
  it('returns the pressing', async () => {
    const id = await insertPressing({ catalogNumber: 'ABC-1' });
    const response = await getPressing(request(`/api/pressings/${id}`), params(id));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, catalogNumber: 'ABC-1' });
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const response = await getPressing(
      request(`/api/pressings/${UNUSED_UUID}`),
      params(UNUSED_UUID),
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await getPressing(request('/api/pressings/nope'), params('nope'));
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/pressings/:id', () => {
  it('updates only the fields supplied', async () => {
    const id = await insertPressing({ catalogNumber: 'ABC-1', countryPressed: 'UK' });

    const response = await patchPressing(
      jsonRequest(`/api/pressings/${id}`, 'PATCH', { yearPressed: 1981 }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      catalogNumber: 'ABC-1',
      countryPressed: 'UK',
      yearPressed: 1981,
    });
  });

  it('does NOT find-or-create — a PATCH edits this row only', async () => {
    // Editing one shared pressing to match another must not merge them: that
    // would silently repoint every record using this row.
    const first = await insertPressing({ catalogNumber: 'ABC-1', countryPressed: 'UK' });
    const second = await insertPressing({ catalogNumber: 'XYZ-9', countryPressed: 'US' });

    const response = await patchPressing(
      jsonRequest(`/api/pressings/${second}`, 'PATCH', {
        catalogNumber: 'ABC-1',
        countryPressed: 'UK',
      }),
      params(second),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(second);
    // Both rows survive; nothing merged.
    expect(await pressingCount()).toBe(2);

    const rows = await db.execute<{ id: string }>(sql`SELECT id FROM pressings WHERE id = ${first}`);
    expect(rows.rows).toHaveLength(1);
  });

  it('rejects a duplicate discogsReleaseId with 409', async () => {
    await insertPressing({ discogsReleaseId: 12345 });
    const other = await insertPressing({ catalogNumber: 'ABC-1' });

    const response = await patchPressing(
      jsonRequest(`/api/pressings/${other}`, 'PATCH', { discogsReleaseId: 12345 }),
      params(other),
    );

    expect(response.status).toBe(409);
  });

  it('rejects an empty body', async () => {
    const id = await insertPressing({ catalogNumber: 'ABC-1' });
    const response = await patchPressing(
      jsonRequest(`/api/pressings/${id}`, 'PATCH', {}),
      params(id),
    );

    expect(response.status).toBe(400);
    // The message, not just the status: a status-only assertion cannot tell a
    // considered rejection from one whose explanation was discarded.
    expect((await response.json()).error.message).toBe(
      'At least one field must be supplied',
    );
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchPressing(
      jsonRequest(`/api/pressings/${UNUSED_UUID}`, 'PATCH', { catalogNumber: 'X' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await patchPressing(
      jsonRequest('/api/pressings/nope', 'PATCH', { catalogNumber: 'X' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });
});

// --- DELETE: three blocking referrers, verified from pg_constraint ----------

describe('DELETE /api/pressings/:id', () => {
  it('deletes an unreferenced pressing', async () => {
    const id = await insertPressing({ catalogNumber: 'ABC-1' });

    const response = await deletePressing(
      request(`/api/pressings/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await pressingCount()).toBe(0);
  });

  it('refuses when a record references it', async () => {
    const id = await insertPressing({ catalogNumber: 'ABC-1' });
    const artist = await insertArtist('Discharge');
    await db.execute(
      sql`INSERT INTO records (artist_id, pressing_id, title) VALUES (${artist}, ${id}, 'Hear Nothing')`,
    );

    const response = await deletePressing(
      request(`/api/pressings/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);
  });

  it('refuses when a want-list item targets it', async () => {
    // The shared-row case §4 names: a pressing can be a record's AND a
    // want-list target simultaneously.
    const id = await insertPressing({ catalogNumber: 'ABC-1' });
    const artist = await insertArtist('Amebix');
    await db.execute(
      sql`INSERT INTO want_list (artist_id, target_pressing_id, title) VALUES (${artist}, ${id}, 'Arise!')`,
    );

    const response = await deletePressing(
      request(`/api/pressings/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.referenceCount).toBe(1);
  });

  it('refuses when only price history references it', async () => {
    // The third referrer, easily missed: price_history.pressing_id is NO ACTION
    // and blocks the delete even with no record and no want-list row.
    const id = await insertPressing({ catalogNumber: 'ABC-1' });
    const artist = await insertArtist('Antisect');
    const record = await db.execute<{ id: string }>(
      sql`INSERT INTO records (artist_id, title) VALUES (${artist}, 'In Darkness') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO price_history (record_id, pressing_id, price, price_type)
          VALUES (${record.rows[0].id}, ${id}, 30.00, 'used')`,
    );

    const response = await deletePressing(
      request(`/api/pressings/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.referenceCount).toBe(1);
  });

  it('sums references across all three referrers', async () => {
    const id = await insertPressing({ catalogNumber: 'ABC-1' });
    const artist = await insertArtist('Discharge');
    const record = await db.execute<{ id: string }>(
      sql`INSERT INTO records (artist_id, pressing_id, title) VALUES (${artist}, ${id}, 'Hear Nothing') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO want_list (artist_id, target_pressing_id, title) VALUES (${artist}, ${id}, 'Why?')`,
    );
    await db.execute(
      sql`INSERT INTO price_history (record_id, pressing_id, price, price_type)
          VALUES (${record.rows[0].id}, ${id}, 30.00, 'used')`,
    );

    const response = await deletePressing(
      request(`/api/pressings/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect((await response.json()).error.referenceCount).toBe(3);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await deletePressing(
      request(`/api/pressings/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await deletePressing(
      request('/api/pressings/nope', { method: 'DELETE' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('returns 409, not 500, when a reference appears after the count', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/pressings');
    const id = await insertPressing({ catalogNumber: 'ABC-1' });
    const artist = await insertArtist('Discharge');

    const hook = vi.spyOn(queries, 'countPressingReferences').mockImplementation(async () => {
      await db.execute(
        sql`INSERT INTO records (artist_id, pressing_id, title) VALUES (${artist}, ${id}, 'Hear Nothing')`,
      );
      return 0;
    });

    try {
      const response = await deletePressing(
        request(`/api/pressings/${id}`, { method: 'DELETE' }),
        params(id),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.referenceCount).toBe(1);
    } finally {
      hook.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});
