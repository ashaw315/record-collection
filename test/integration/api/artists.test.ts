import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listArtists, POST as createArtist } from '@/app/api/artists/route';
import {
  GET as getArtist,
  PATCH as patchArtist,
  DELETE as deleteArtist,
} from '@/app/api/artists/[id]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.4 reference CRUD for `artists`.
 *
 * Two things to watch. `formed_year` is bounded at the API boundary only (§4.1)
 * — the database accepts -5000 and 999999, verified — so these tests are the
 * only thing holding that. And artists has THREE cascading referrers alongside
 * its two blocking ones, so the in-use tests must distinguish them: an artist
 * with only influence edges is deletable, one with a record is not.
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

/** Derived, never hardcoded — a literal rots on 1 January (§4.1). */
const CURRENT_YEAR = new Date().getUTCFullYear();

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

async function insertArtist(name: string, formedYear?: number | null): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name, formed_year) VALUES (${name}, ${formedYear ?? null}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function artistNames(): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(sql`SELECT name FROM artists ORDER BY name`);
  return rows.rows.map((r) => r.name);
}

describe('unauthenticated access', () => {
  it('routes both paths through middleware as session-protected', () => {
    expect(middlewareRuns('/api/artists')).toBe(true);
    expect(middlewareRuns(`/api/artists/${UNUSED_UUID}`)).toBe(true);
    expect(routeAuthMode('/api/artists')).toBe('session');
    expect(routeAuthMode(`/api/artists/${UNUSED_UUID}`)).toBe('session');
  });
});

describe('unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks nothing when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await db.execute(sql`ALTER TABLE artists RENAME TO artists_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await listArtists(request('/api/artists'));
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE artists_hidden RENAME TO artists`);
    }

    expect(status).toBe(500);
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('artists_hidden');
  });
});

describe('GET /api/artists', () => {
  it('returns the §5 list envelope with every field', async () => {
    await insertArtist('Discharge', 1977);

    const response = await listArtists(request('/api/artists'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta).toEqual({ total: 1, page: 1, pageSize: 50 });
    expect(body.data[0]).toMatchObject({ name: 'Discharge', formedYear: 1977 });
  });

  it('paginates, reporting total across all pages', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) await insertArtist(name);

    const response = await listArtists(request('/api/artists?page=2&pageSize=2'));
    const body = await response.json();

    expect(body.meta).toEqual({ total: 5, page: 2, pageSize: 2 });
    expect(body.data.map((a: { name: string }) => a.name)).toEqual(['c', 'd']);
  });

  it('rejects an out-of-range page with 400, never reaching SQL', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const response = await listArtists(request('/api/artists?page=99999999999999999999'));

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a real but unenumerated sort column with 400', async () => {
    const response = await listArtists(request('/api/artists?sort=originCountry:asc'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.sort).toBeDefined();
  });

  // formedYear is nullable and sortable — the NULLS LAST case, both directions.
  it('puts null formedYear last when sorting ascending', async () => {
    await insertArtist('Discharge', 1977);
    await insertArtist('Unknown A', null);
    await insertArtist('Amebix', 1978);
    await insertArtist('Unknown B', null);

    const response = await listArtists(request('/api/artists?sort=formedYear:asc'));
    const names = (await response.json()).data.map((a: { name: string }) => a.name);

    expect(names.slice(0, 2)).toEqual(['Discharge', 'Amebix']);
    expect(names.slice(2).sort()).toEqual(['Unknown A', 'Unknown B']);
  });

  it('puts null formedYear last when sorting DESCENDING, against the default', async () => {
    await insertArtist('Discharge', 1977);
    await insertArtist('Unknown A', null);
    await insertArtist('Amebix', 1978);
    await insertArtist('Unknown B', null);

    const response = await listArtists(request('/api/artists?sort=formedYear:desc'));
    const names = (await response.json()).data.map((a: { name: string }) => a.name);

    expect(names.slice(0, 2)).toEqual(['Amebix', 'Discharge']);
    expect(names.slice(2).sort()).toEqual(['Unknown A', 'Unknown B']);
  });

  it('pages consistently when every createdAt is identical', async () => {
    const shared = '2020-01-01T00:00:00.000Z';
    const names = Array.from({ length: 60 }, (_, i) => `artist-${String(i).padStart(3, '0')}`);
    for (const name of names) {
      await db.execute(
        sql`INSERT INTO artists (name, created_at) VALUES (${name}, ${shared}::timestamptz)`,
      );
    }

    const seen: string[] = [];
    for (let page = 1; page <= 6; page += 1) {
      const response = await listArtists(
        request(`/api/artists?sort=createdAt:asc&page=${page}&pageSize=10`),
      );
      seen.push(...(await response.json()).data.map((a: { name: string }) => a.name));
      await db.execute(sql`UPDATE artists SET updated_at = now() WHERE name = ${names[page]}`);
    }

    expect(seen).toHaveLength(60);
    expect([...new Set(seen)]).toHaveLength(60);
  });
});

describe('POST /api/artists', () => {
  it('creates an artist with every optional field', async () => {
    const response = await createArtist(
      jsonRequest('/api/artists', 'POST', {
        name: 'Discharge',
        formedYear: 1977,
        originCountry: 'UK',
        notes: 'Stoke-on-Trent',
        discogsArtistId: 251595,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: 'Discharge',
      formedYear: 1977,
      originCountry: 'UK',
      discogsArtistId: 251595,
    });
  });

  it('rejects a missing name with 400 and a field error', async () => {
    const response = await createArtist(jsonRequest('/api/artists', 'POST', {}));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.name).toBeDefined();
  });

  it('rejects unknown keys', async () => {
    const response = await createArtist(
      jsonRequest('/api/artists', 'POST', { name: 'Discharge', id: UNUSED_UUID }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createArtist(
      request('/api/artists', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('rejects a duplicate name with 409', async () => {
    await insertArtist('Discharge');

    const response = await createArtist(jsonRequest('/api/artists', 'POST', { name: 'Discharge' }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('DUPLICATE');
  });

  it('treats NFC and NFD forms of the same name as a duplicate', async () => {
    const nfc = 'Bj\u00F6rk';
    const nfd = 'Bjo\u0308rk';
    expect(nfc).not.toBe(nfd);

    expect((await createArtist(jsonRequest('/api/artists', 'POST', { name: nfd }))).status).toBe(
      201,
    );
    const second = await createArtist(jsonRequest('/api/artists', 'POST', { name: nfc }));

    expect(second.status).toBe(409);
    expect(await artistNames()).toEqual([nfc]);
  });

  it('rejects a duplicate discogsArtistId with 409, not a 500', async () => {
    await db.execute(
      sql`INSERT INTO artists (name, discogs_artist_id) VALUES ('Discharge', 251595)`,
    );

    const response = await createArtist(
      jsonRequest('/api/artists', 'POST', { name: 'Discharge UK', discogsArtistId: 251595 }),
    );

    expect(response.status).toBe(409);
    expect(await artistNames()).toEqual(['Discharge']);
  });

  it('allows many artists with no discogsArtistId', async () => {
    expect(
      (await createArtist(jsonRequest('/api/artists', 'POST', { name: 'Amebix' }))).status,
    ).toBe(201);
    expect(
      (await createArtist(jsonRequest('/api/artists', 'POST', { name: 'Antisect' }))).status,
    ).toBe(201);
  });

  // --- the formed_year bound (§4.1) ---

  it('accepts 1877, the year sound recording began', async () => {
    const response = await createArtist(
      jsonRequest('/api/artists', 'POST', { name: 'Early Act', formedYear: 1877 }),
    );

    expect(response.status).toBe(201);
  });

  it('rejects 1876, the year before it', async () => {
    const response = await createArtist(
      jsonRequest('/api/artists', 'POST', { name: 'Too Early', formedYear: 1876 }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.formedYear).toBeDefined();
    expect(await artistNames()).toEqual([]);
  });

  it('accepts next year, for a band announced for it', async () => {
    // Derived from the clock, so this cannot rot at New Year.
    const response = await createArtist(
      jsonRequest('/api/artists', 'POST', { name: 'Future Act', formedYear: CURRENT_YEAR + 1 }),
    );

    expect(response.status).toBe(201);
  });

  it('rejects the year after next', async () => {
    const response = await createArtist(
      jsonRequest('/api/artists', 'POST', { name: 'Too Far', formedYear: CURRENT_YEAR + 2 }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects the absurd values the database would accept', async () => {
    // Verified: both INSERT cleanly at the database level, so this boundary is
    // the only guard.
    for (const year of [-5000, 0, 999999]) {
      const response = await createArtist(
        jsonRequest('/api/artists', 'POST', { name: `Bad ${year}`, formedYear: year }),
      );

      expect(response.status, `formedYear=${year}`).toBe(400);
    }

    expect(await artistNames()).toEqual([]);
  });

  it('accepts a null formedYear', async () => {
    const response = await createArtist(
      jsonRequest('/api/artists', 'POST', { name: 'Unknown Era', formedYear: null }),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).formedYear).toBeNull();
  });

  it('returns 409 when a concurrent create wins the unique index', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/artists');

        /**
     * Only the FIRST call is hooked. The recovery path re-reads by name to
     * supply §5.4's existingId, so a mock returning undefined every time
     * makes the handler rethrow — the mock defeating the code under test.
     */
    const real = queries.findArtistByName;
    let firstCall = true;

const claim = vi.spyOn(queries, 'findArtistByName').mockImplementation(async (name) => {
      if (!firstCall) return real(name);
      firstCall = false;
      await db.execute(sql`INSERT INTO artists (name) VALUES ('Discharge')`);
      return undefined;
    });

    try {
      const response = await createArtist(
        jsonRequest('/api/artists', 'POST', { name: 'Discharge' }),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('DUPLICATE');
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent create claims the discogsArtistId', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/artists');

        /**
     * Only the FIRST call is hooked. The recovery path re-reads by name to
     * supply §5.4's existingId, so a mock returning undefined every time
     * makes the handler rethrow — the mock defeating the code under test.
     */
    const real = queries.findArtistByName;
    let firstCall = true;

const claim = vi.spyOn(queries, 'findArtistByName').mockImplementation(async (name) => {
      if (!firstCall) return real(name);
      firstCall = false;
      await db.execute(sql`INSERT INTO artists (name, discogs_artist_id) VALUES ('Other', 4321)`);
      return undefined;
    });

    try {
      const response = await createArtist(
        jsonRequest('/api/artists', 'POST', { name: 'Discharge', discogsArtistId: 4321 }),
      );

      expect(response.status).toBe(409);
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('GET /api/artists/:id', () => {
  it('returns the artist', async () => {
    const id = await insertArtist('Discharge', 1977);
    const response = await getArtist(request(`/api/artists/${id}`), params(id));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, name: 'Discharge', formedYear: 1977 });
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const response = await getArtist(request(`/api/artists/${UNUSED_UUID}`), params(UNUSED_UUID));
    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await getArtist(request('/api/artists/nope'), params('nope'));
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/artists/:id', () => {
  it('updates only the fields supplied', async () => {
    const id = await insertArtist('Discharge', 1977);

    const response = await patchArtist(
      jsonRequest(`/api/artists/${id}`, 'PATCH', { originCountry: 'UK' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: 'Discharge',
      formedYear: 1977,
      originCountry: 'UK',
    });
  });

  it('clears a nullable field when explicitly sent null', async () => {
    const id = await insertArtist('Discharge', 1977);

    const response = await patchArtist(
      jsonRequest(`/api/artists/${id}`, 'PATCH', { formedYear: null }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).formedYear).toBeNull();
  });

  it('applies the formedYear bound on PATCH too, not only POST', async () => {
    // The bound is easy to wire into create and forget on update.
    const id = await insertArtist('Discharge', 1977);

    const response = await patchArtist(
      jsonRequest(`/api/artists/${id}`, 'PATCH', { formedYear: 1200 }),
      params(id),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.formedYear).toBeDefined();

    const rows = await db.execute<{ formed_year: number }>(
      sql`SELECT formed_year FROM artists WHERE id = ${id}`,
    );
    expect(rows.rows[0].formed_year).toBe(1977);
  });

  it('accepts next year on PATCH', async () => {
    const id = await insertArtist('Discharge', 1977);

    const response = await patchArtist(
      jsonRequest(`/api/artists/${id}`, 'PATCH', { formedYear: CURRENT_YEAR + 1 }),
      params(id),
    );

    expect(response.status).toBe(200);
  });

  it('rejects an empty body', async () => {
    const id = await insertArtist('Discharge');
    const response = await patchArtist(jsonRequest(`/api/artists/${id}`, 'PATCH', {}), params(id));

    expect(response.status).toBe(400);
  });

  it('rejects unknown keys', async () => {
    const id = await insertArtist('Discharge');

    const response = await patchArtist(
      jsonRequest(`/api/artists/${id}`, 'PATCH', { name: 'ok', createdAt: '2020-01-01' }),
      params(id),
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchArtist(
      jsonRequest(`/api/artists/${UNUSED_UUID}`, 'PATCH', { name: 'x' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await patchArtist(
      jsonRequest('/api/artists/nope', 'PATCH', { name: 'x' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('rejects renaming onto an existing name with 409', async () => {
    await insertArtist('Discharge');
    const id = await insertArtist('Amebix');

    const response = await patchArtist(
      jsonRequest(`/api/artists/${id}`, 'PATCH', { name: 'Discharge' }),
      params(id),
    );

    expect(response.status).toBe(409);
  });

  it('returns 409 when a concurrent rename wins the unique index', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/artists');
    const id = await insertArtist('Amebix');

    const claim = vi.spyOn(queries, 'artistNameTakenByOther').mockImplementation(async () => {
      await db.execute(sql`INSERT INTO artists (name) VALUES ('Discharge')`);
      return false;
    });

    try {
      const response = await patchArtist(
        jsonRequest(`/api/artists/${id}`, 'PATCH', { name: 'Discharge' }),
        params(id),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('DUPLICATE');
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/artists/:id', () => {
  it('deletes an unreferenced artist', async () => {
    const id = await insertArtist('Discharge');

    const response = await deleteArtist(
      request(`/api/artists/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await artistNames()).toEqual([]);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await deleteArtist(
      request(`/api/artists/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await deleteArtist(
      request('/api/artists/nope', { method: 'DELETE' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('refuses to delete an artist referenced by a record', async () => {
    const id = await insertArtist('Discharge');
    await db.execute(sql`INSERT INTO records (artist_id, title) VALUES (${id}, 'Hear Nothing')`);

    const response = await deleteArtist(
      request(`/api/artists/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);
    expect(await artistNames()).toEqual(['Discharge']);
  });

  it('refuses to delete an artist referenced by a want-list item', async () => {
    const id = await insertArtist('Amebix');
    await db.execute(sql`INSERT INTO want_list (artist_id, title) VALUES (${id}, 'Arise!')`);

    const response = await deleteArtist(
      request(`/api/artists/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.referenceCount).toBe(1);
  });

  it('sums references across both blocking referrers', async () => {
    const id = await insertArtist('Discharge');
    await db.execute(sql`INSERT INTO records (artist_id, title) VALUES (${id}, 'Hear Nothing')`);
    await db.execute(sql`INSERT INTO want_list (artist_id, title) VALUES (${id}, 'Why?')`);

    const response = await deleteArtist(
      request(`/api/artists/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect((await response.json()).error.referenceCount).toBe(2);
  });

  /**
   * The distinction that matters for this resource: three of artists' five
   * foreign keys CASCADE. Counting them would refuse a delete the database
   * would happily perform, which is the inverse error and just as wrong.
   */
  it('DELETES an artist whose only links are cascading ones', async () => {
    const id = await insertArtist('Discharge');
    const other = await insertArtist('Amebix');

    // artist_genres and both artist_influences FKs all cascade.
    const genre = await db.execute<{ id: string }>(
      sql`INSERT INTO genres (name) VALUES ('UK82') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO artist_genres (artist_id, genre_id) VALUES (${id}, ${genre.rows[0].id})`,
    );
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${id}, ${other})`,
    );
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id) VALUES (${other}, ${id})`,
    );

    const response = await deleteArtist(
      request(`/api/artists/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await artistNames()).toEqual(['Amebix']);

    // The cascading rows went with it; the genre and the other artist remain.
    const links = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM artist_influences`,
    );
    expect(links.rows[0].n).toBe(0);

    const genres = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM genres`);
    expect(genres.rows[0].n).toBe(1);
  });

  it('returns 409, not 500, when a reference appears after the count', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/artists');
    const id = await insertArtist('Discharge');

    const hook = vi.spyOn(queries, 'countArtistReferences').mockImplementation(async () => {
      await db.execute(sql`INSERT INTO records (artist_id, title) VALUES (${id}, 'Hear Nothing')`);
      return 0;
    });

    try {
      const response = await deleteArtist(
        request(`/api/artists/${id}`, { method: 'DELETE' }),
        params(id),
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('IN_USE');
      expect(body.error.referenceCount).toBe(1);
    } finally {
      hook.mockRestore();
    }

    expect(await artistNames()).toEqual(['Discharge']);
    expect(spy).not.toHaveBeenCalled();
  });
});
