import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listGenres, POST as createGenre } from '@/app/api/genres/route';
import {
  GET as getGenre,
  PATCH as patchGenre,
  DELETE as deleteGenre,
} from '@/app/api/genres/[id]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.4 reference CRUD for `genres`, plus the two things unique to this
 * resource: the self-referencing parent (§4.1, cycle-guarded at the
 * application layer) and `?tree=true` (§5.4).
 *
 * The cycle guard is the ONLY protection against a cycle — verified directly
 * against the test database, where `UPDATE genres SET parent_genre_id = id`
 * succeeds. There is no second layer, so these tests constrain it directly.
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

async function insertGenre(name: string, parentId?: string | null): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO genres (name, parent_genre_id) VALUES (${name}, ${parentId ?? null}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertArtist(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function genreNames(): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(sql`SELECT name FROM genres ORDER BY name`);
  return rows.rows.map((r) => r.name);
}

async function parentOf(id: string): Promise<string | null> {
  const rows = await db.execute<{ parent_genre_id: string | null }>(
    sql`SELECT parent_genre_id FROM genres WHERE id = ${id}`,
  );
  return rows.rows[0].parent_genre_id;
}

/** Punk > UK82 > Oi — a three-level chain, for the deep-cycle cases. */
async function seedChain(): Promise<{ punk: string; uk82: string; oi: string }> {
  const punk = await insertGenre('Punk');
  const uk82 = await insertGenre('UK82', punk);
  const oi = await insertGenre('Oi', uk82);
  return { punk, uk82, oi };
}

describe('unauthenticated access', () => {
  it('routes both paths through middleware as session-protected', () => {
    expect(middlewareRuns('/api/genres')).toBe(true);
    expect(middlewareRuns(`/api/genres/${UNUSED_UUID}`)).toBe(true);
    expect(routeAuthMode('/api/genres')).toBe('session');
    expect(routeAuthMode(`/api/genres/${UNUSED_UUID}`)).toBe('session');
  });
});

describe('unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks nothing when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await db.execute(sql`ALTER TABLE genres RENAME TO genres_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await listGenres(request('/api/genres'));
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE genres_hidden RENAME TO genres`);
    }

    expect(status).toBe(500);
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('genres_hidden');
  });
});

// --- GET /api/genres (flat) --------------------------------------------------

describe('GET /api/genres', () => {
  it('returns the §5 list envelope with parentGenreId', async () => {
    const punk = await insertGenre('Punk');
    await insertGenre('UK82', punk);

    const response = await listGenres(request('/api/genres'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta).toEqual({ total: 2, page: 1, pageSize: 50 });
    expect(body.data.find((g: { name: string }) => g.name === 'UK82').parentGenreId).toBe(punk);
    expect(body.data.find((g: { name: string }) => g.name === 'Punk').parentGenreId).toBeNull();
  });

  it('returns a flat list by default, not a nested one', async () => {
    // Default must stay flat: §5.4 makes tree opt-in, and a client expecting
    // { data, meta } would break if nesting appeared unasked.
    await seedChain();

    const response = await listGenres(request('/api/genres'));
    const body = await response.json();

    expect(body.data).toHaveLength(3);
    expect(body.data.every((g: Record<string, unknown>) => !('children' in g))).toBe(true);
  });

  it('paginates the flat list', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) await insertGenre(name);

    const response = await listGenres(request('/api/genres?page=2&pageSize=2'));
    const body = await response.json();

    expect(body.meta).toEqual({ total: 5, page: 2, pageSize: 2 });
    expect(body.data.map((g: { name: string }) => g.name)).toEqual(['c', 'd']);
  });

  it('rejects an out-of-range page with 400, never reaching SQL', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const response = await listGenres(request('/api/genres?page=99999999999999999999'));

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a real but unenumerated sort column with 400', async () => {
    const response = await listGenres(request('/api/genres?sort=description:asc'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.sort).toBeDefined();
  });

  it('pages consistently when every createdAt is identical', async () => {
    const shared = '2020-01-01T00:00:00.000Z';
    const names = Array.from({ length: 60 }, (_, i) => `genre-${String(i).padStart(3, '0')}`);
    for (const name of names) {
      await db.execute(
        sql`INSERT INTO genres (name, created_at) VALUES (${name}, ${shared}::timestamptz)`,
      );
    }

    const seen: string[] = [];
    for (let page = 1; page <= 6; page += 1) {
      const response = await listGenres(
        request(`/api/genres?sort=createdAt:asc&page=${page}&pageSize=10`),
      );
      seen.push(...(await response.json()).data.map((g: { name: string }) => g.name));
      await db.execute(sql`UPDATE genres SET updated_at = now() WHERE name = ${names[page]}`);
    }

    expect(seen).toHaveLength(60);
    expect([...new Set(seen)]).toHaveLength(60);
  });
});

// --- GET /api/genres?tree=true -----------------------------------------------

/**
 * §5.4: "?tree=true to return the nested hierarchy rather than a flat list."
 *
 * Deliberately NOT paginated. A page of 50 would cut subtrees at an arbitrary
 * boundary and return orphans whose parents are on another page, which is not a
 * hierarchy in any useful sense. The envelope differs accordingly, and that
 * difference is asserted rather than left implicit.
 */
describe('GET /api/genres?tree=true', () => {
  it('nests children under their parent', async () => {
    const { punk, uk82 } = await seedChain();

    const response = await listGenres(request('/api/genres?tree=true'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(1);

    const [root] = body.data;
    expect(root).toMatchObject({ id: punk, name: 'Punk' });
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ id: uk82, name: 'UK82' });
    expect(root.children[0].children[0]).toMatchObject({ name: 'Oi' });
  });

  it('returns every root, not only the first', async () => {
    await insertGenre('Punk');
    await insertGenre('Metal');
    await insertGenre('Jazz');

    const response = await listGenres(request('/api/genres?tree=true'));
    const body = await response.json();

    expect(body.data.map((g: { name: string }) => g.name).sort()).toEqual([
      'Jazz',
      'Metal',
      'Punk',
    ]);
  });

  it('gives a leaf an empty children array rather than omitting the key', async () => {
    // A client rendering the tree should not have to test for undefined.
    await insertGenre('Punk');

    const response = await listGenres(request('/api/genres?tree=true'));
    expect((await response.json()).data[0].children).toEqual([]);
  });

  it('returns an empty array when there are no genres', async () => {
    const response = await listGenres(request('/api/genres?tree=true'));

    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([]);
  });

  it('includes every genre exactly once across the whole tree', async () => {
    // The property that actually matters: no genre dropped, none duplicated.
    const punk = await insertGenre('Punk');
    const uk82 = await insertGenre('UK82', punk);
    await insertGenre('Oi', uk82);
    await insertGenre('Metal');
    await insertGenre('Doom', await insertGenre('Sludge'));

    const response = await listGenres(request('/api/genres?tree=true'));
    const body = await response.json();

    const flatten = (nodes: Array<{ name: string; children: unknown[] }>): string[] =>
      nodes.flatMap((n) => [
        n.name,
        ...flatten(n.children as Array<{ name: string; children: unknown[] }>),
      ]);

    const names = flatten(body.data);
    expect(names.sort()).toEqual(['Doom', 'Metal', 'Oi', 'Punk', 'Sludge', 'UK82']);
    expect(new Set(names).size).toBe(6);
  });

  it('omits pagination meta, which does not apply to a tree', async () => {
    await seedChain();

    const response = await listGenres(request('/api/genres?tree=true'));
    const body = await response.json();

    // A `page`/`pageSize` here would imply the tree can be paged, which it
    // cannot without cutting subtrees arbitrarily.
    expect(body.meta).toEqual({ total: 3 });
  });

  it('ignores page and pageSize rather than truncating the hierarchy', async () => {
    // Silently returning 2 of 3 genres would look like a working tree while
    // hiding a subtree.
    await seedChain();

    const response = await listGenres(request('/api/genres?tree=true&pageSize=2'));
    const body = await response.json();

    expect(body.meta.total).toBe(3);
    expect(body.data[0].children[0].children).toHaveLength(1);
  });

  it('rejects tree with a value other than true', async () => {
    // `?tree=false` and `?tree=maybe` must not silently mean "flat" — a typo
    // that changes the response shape should be a 400, not a surprise.
    for (const value of ['false', 'maybe', '1']) {
      const response = await listGenres(request(`/api/genres?tree=${value}`));
      expect(response.status, `tree=${value}`).toBe(400);
    }
  });
});

// --- POST /api/genres --------------------------------------------------------

describe('POST /api/genres', () => {
  it('creates a root genre', async () => {
    const response = await createGenre(
      jsonRequest('/api/genres', 'POST', { name: 'Punk', description: 'Loud' }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: 'Punk',
      description: 'Loud',
      parentGenreId: null,
    });
  });

  it('creates a child genre under an existing parent', async () => {
    const punk = await insertGenre('Punk');

    const response = await createGenre(
      jsonRequest('/api/genres', 'POST', { name: 'UK82', parentGenreId: punk }),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).parentGenreId).toBe(punk);
  });

  it('rejects a parentGenreId that does not exist with 400, not 500', async () => {
    // A dangling FK would otherwise surface as an unshaped foreign-key error.
    const response = await createGenre(
      jsonRequest('/api/genres', 'POST', { name: 'UK82', parentGenreId: UNUSED_UUID }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.parentGenreId).toBeDefined();
    expect(await genreNames()).toEqual([]);
  });

  it('rejects a non-UUID parentGenreId', async () => {
    const response = await createGenre(
      jsonRequest('/api/genres', 'POST', { name: 'UK82', parentGenreId: 'not-a-uuid' }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a missing name with 400 and a field error', async () => {
    const response = await createGenre(jsonRequest('/api/genres', 'POST', {}));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.name).toBeDefined();
  });

  it('rejects unknown keys', async () => {
    const response = await createGenre(
      jsonRequest('/api/genres', 'POST', { name: 'Punk', id: UNUSED_UUID }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createGenre(
      request('/api/genres', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('rejects a duplicate name with 409', async () => {
    await insertGenre('Punk');

    const response = await createGenre(jsonRequest('/api/genres', 'POST', { name: 'Punk' }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('DUPLICATE');
  });

  it('treats NFC and NFD forms of the same name as a duplicate', async () => {
    // From escapes: a typed NFD literal normalizes to NFC on being written to
    // disk, destroying the precondition.
    const nfc = 'Bj\u00F6rk-core';
    const nfd = 'Bjo\u0308rk-core';
    expect(nfc).not.toBe(nfd);

    expect((await createGenre(jsonRequest('/api/genres', 'POST', { name: nfd }))).status).toBe(201);
    const second = await createGenre(jsonRequest('/api/genres', 'POST', { name: nfc }));

    expect(second.status).toBe(409);
    expect(await genreNames()).toEqual([nfc]);
  });

  it('returns 409 when a concurrent create wins the unique index', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/genres');

        /**
     * Only the FIRST call is hooked. The recovery path re-reads by name to
     * supply §5.4's existingId, so a mock returning undefined every time
     * makes the handler rethrow — the mock defeating the code under test.
     */
    const real = queries.findGenreByName;
    let firstCall = true;

const claim = vi.spyOn(queries, 'findGenreByName').mockImplementation(async (name) => {
      if (!firstCall) return real(name);
      firstCall = false;
      await db.execute(sql`INSERT INTO genres (name) VALUES ('Punk')`);
      return undefined;
    });

    try {
      const response = await createGenre(jsonRequest('/api/genres', 'POST', { name: 'Punk' }));

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('DUPLICATE');
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

// --- GET /api/genres/:id -----------------------------------------------------

describe('GET /api/genres/:id', () => {
  it('returns the genre', async () => {
    const punk = await insertGenre('Punk');
    const uk82 = await insertGenre('UK82', punk);

    const response = await getGenre(request(`/api/genres/${uk82}`), params(uk82));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: uk82, name: 'UK82', parentGenreId: punk });
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const response = await getGenre(request(`/api/genres/${UNUSED_UUID}`), params(UNUSED_UUID));
    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await getGenre(request('/api/genres/nope'), params('nope'));
    expect(response.status).toBe(400);
  });
});

// --- PATCH /api/genres/:id — the cycle guard ---------------------------------

/**
 * SPEC.md §4.1: "a genre may not be its own ancestor", guarded at the
 * application layer.
 *
 * There is NO second layer. Verified against the test database: `UPDATE genres
 * SET parent_genre_id = id` succeeds, and a two-node cycle is accepted just as
 * readily. So unlike the formats seeded guard, nothing else catches a mistake
 * here — a cycle would make the §7.1 recursive CTE loop forever and the tree
 * endpoint drop every genre in the cycle.
 */
describe('PATCH /api/genres/:id — cycle guard', () => {
  it('rejects a genre becoming its own parent', async () => {
    const punk = await insertGenre('Punk');

    const response = await patchGenre(
      jsonRequest(`/api/genres/${punk}`, 'PATCH', { parentGenreId: punk }),
      params(punk),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.parentGenreId).toBeDefined();
    expect(await parentOf(punk)).toBeNull();
  });

  it('rejects a two-node cycle', async () => {
    // Punk > UK82, then UK82 as Punk's parent.
    const punk = await insertGenre('Punk');
    const uk82 = await insertGenre('UK82', punk);

    const response = await patchGenre(
      jsonRequest(`/api/genres/${punk}`, 'PATCH', { parentGenreId: uk82 }),
      params(punk),
    );

    expect(response.status).toBe(400);
    expect(await parentOf(punk)).toBeNull();
  });

  it('rejects a three-node cycle, not only adjacent ones', async () => {
    // The case a naive "is the new parent my direct child?" check would miss.
    const { punk, oi } = await seedChain();

    const response = await patchGenre(
      jsonRequest(`/api/genres/${punk}`, 'PATCH', { parentGenreId: oi }),
      params(punk),
    );

    expect(response.status).toBe(400);
    expect(await parentOf(punk)).toBeNull();
  });

  it('rejects a cycle through a long chain', async () => {
    // Depth beyond anything a fixed-depth check would cover.
    let previous = await insertGenre('level-0');
    const root = previous;
    for (let depth = 1; depth < 12; depth += 1) {
      previous = await insertGenre(`level-${depth}`, previous);
    }

    const response = await patchGenre(
      jsonRequest(`/api/genres/${root}`, 'PATCH', { parentGenreId: previous }),
      params(root),
    );

    expect(response.status).toBe(400);
    expect(await parentOf(root)).toBeNull();
  });

  it('ALLOWS a legitimate reparent that creates no cycle', async () => {
    // The other side: a guard that refused everything would pass every test
    // above while making the hierarchy uneditable.
    const punk = await insertGenre('Punk');
    const metal = await insertGenre('Metal');
    const doom = await insertGenre('Doom', punk);

    const response = await patchGenre(
      jsonRequest(`/api/genres/${doom}`, 'PATCH', { parentGenreId: metal }),
      params(doom),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).parentGenreId).toBe(metal);
    expect(await parentOf(doom)).toBe(metal);
  });

  it('allows moving a genre to the root by setting parentGenreId null', async () => {
    const { punk, uk82 } = await seedChain();

    const response = await patchGenre(
      jsonRequest(`/api/genres/${uk82}`, 'PATCH', { parentGenreId: null }),
      params(uk82),
    );

    expect(response.status).toBe(200);
    expect(await parentOf(uk82)).toBeNull();
    expect(await parentOf(punk)).toBeNull();
  });

  it('allows a sibling to become a parent of another subtree', async () => {
    // Punk > UK82, Punk > Oi. Making Oi a child of UK82 is legal: they are
    // siblings, not ancestors.
    const punk = await insertGenre('Punk');
    const uk82 = await insertGenre('UK82', punk);
    const oi = await insertGenre('Oi', punk);

    const response = await patchGenre(
      jsonRequest(`/api/genres/${oi}`, 'PATCH', { parentGenreId: uk82 }),
      params(oi),
    );

    expect(response.status).toBe(200);
    expect(await parentOf(oi)).toBe(uk82);
  });

  it('rejects a parentGenreId that does not exist', async () => {
    const punk = await insertGenre('Punk');

    const response = await patchGenre(
      jsonRequest(`/api/genres/${punk}`, 'PATCH', { parentGenreId: UNUSED_UUID }),
      params(punk),
    );

    expect(response.status).toBe(400);
    expect(await parentOf(punk)).toBeNull();
  });
});

// --- PATCH /api/genres/:id — the ordinary rules ------------------------------

describe('PATCH /api/genres/:id', () => {
  it('renames without touching the parent', async () => {
    const { punk, uk82 } = await seedChain();

    const response = await patchGenre(
      jsonRequest(`/api/genres/${uk82}`, 'PATCH', { name: 'UK 82' }),
      params(uk82),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: 'UK 82', parentGenreId: punk });
  });

  it('clears description when explicitly sent null', async () => {
    const id = await insertGenre('Punk');
    await db.execute(sql`UPDATE genres SET description = 'Loud' WHERE id = ${id}`);

    const response = await patchGenre(
      jsonRequest(`/api/genres/${id}`, 'PATCH', { description: null }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).description).toBeNull();
  });

  it('rejects an empty body', async () => {
    const id = await insertGenre('Punk');
    const response = await patchGenre(jsonRequest(`/api/genres/${id}`, 'PATCH', {}), params(id));

    expect(response.status).toBe(400);
    // The message, not just the status: a status-only assertion cannot tell a
    // considered rejection from one whose explanation was discarded.
    expect((await response.json()).error.message).toBe(
      'At least one field must be supplied',
    );
  });

  it('rejects unknown keys', async () => {
    const id = await insertGenre('Punk');

    const response = await patchGenre(
      jsonRequest(`/api/genres/${id}`, 'PATCH', { name: 'ok', createdAt: '2020-01-01' }),
      params(id),
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchGenre(
      jsonRequest(`/api/genres/${UNUSED_UUID}`, 'PATCH', { name: 'x' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await patchGenre(
      jsonRequest('/api/genres/nope', 'PATCH', { name: 'x' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('rejects renaming onto an existing name with 409', async () => {
    await insertGenre('Punk');
    const metal = await insertGenre('Metal');

    const response = await patchGenre(
      jsonRequest(`/api/genres/${metal}`, 'PATCH', { name: 'Punk' }),
      params(metal),
    );

    expect(response.status).toBe(409);
  });

  it('returns 409 when a concurrent rename wins the unique index', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/genres');
    const metal = await insertGenre('Metal');

    const claim = vi.spyOn(queries, 'genreNameTakenByOther').mockImplementation(async () => {
      await db.execute(sql`INSERT INTO genres (name) VALUES ('Punk')`);
      return false;
    });

    try {
      const response = await patchGenre(
        jsonRequest(`/api/genres/${metal}`, 'PATCH', { name: 'Punk' }),
        params(metal),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('DUPLICATE');
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

// --- DELETE /api/genres/:id --------------------------------------------------

describe('DELETE /api/genres/:id', () => {
  it('deletes an unreferenced genre', async () => {
    const id = await insertGenre('Punk');

    const response = await deleteGenre(
      request(`/api/genres/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await genreNames()).toEqual([]);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await deleteGenre(
      request(`/api/genres/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await deleteGenre(
      request('/api/genres/nope', { method: 'DELETE' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  /**
   * Four blocking referrers, verified from pg_constraint — including the
   * SELF-reference. Each gets its own test: a count that enumerates three of
   * four under-reports silently, and the child case is the one a developer
   * copying another resource would omit.
   */
  it('refuses to delete a genre used by a record', async () => {
    const genre = await insertGenre('Punk');
    const artist = await insertArtist('Discharge');
    const record = await db.execute<{ id: string }>(
      sql`INSERT INTO records (artist_id, title) VALUES (${artist}, 'Hear Nothing') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${record.rows[0].id}, ${genre})`,
    );

    const response = await deleteGenre(
      request(`/api/genres/${genre}`, { method: 'DELETE' }),
      params(genre),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);
    expect(await genreNames()).toEqual(['Punk']);
  });

  it('refuses to delete a genre used by a want-list item', async () => {
    const genre = await insertGenre('Punk');
    const artist = await insertArtist('Amebix');
    const want = await db.execute<{ id: string }>(
      sql`INSERT INTO want_list (artist_id, title) VALUES (${artist}, 'Arise!') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO want_list_genres (want_list_id, genre_id) VALUES (${want.rows[0].id}, ${genre})`,
    );

    const response = await deleteGenre(
      request(`/api/genres/${genre}`, { method: 'DELETE' }),
      params(genre),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.referenceCount).toBe(1);
  });

  it('refuses to delete a genre attached to an artist', async () => {
    const genre = await insertGenre('Punk');
    const artist = await insertArtist('Crass');
    await db.execute(
      sql`INSERT INTO artist_genres (artist_id, genre_id) VALUES (${artist}, ${genre})`,
    );

    const response = await deleteGenre(
      request(`/api/genres/${genre}`, { method: 'DELETE' }),
      params(genre),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.referenceCount).toBe(1);
  });

  it('refuses to delete a genre that still has CHILD genres', async () => {
    // The self-referencing referrer. Deleting Punk while UK82 points at it
    // would orphan the child, and the FK refuses — so it must be counted.
    const { punk } = await seedChain();

    const response = await deleteGenre(
      request(`/api/genres/${punk}`, { method: 'DELETE' }),
      params(punk),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);
    expect(await genreNames()).toContain('Punk');
  });

  it('deletes a leaf genre whose parent remains', async () => {
    // The inverse: a child with no referrers of its own is deletable, and its
    // parent is untouched.
    const { punk, uk82, oi } = await seedChain();

    const response = await deleteGenre(
      request(`/api/genres/${oi}`, { method: 'DELETE' }),
      params(oi),
    );

    expect(response.status).toBe(200);
    expect(await parentOf(uk82)).toBe(punk);
    expect(await genreNames()).toEqual(['Punk', 'UK82']);
  });

  it('sums references across all four sources', async () => {
    const genre = await insertGenre('Punk');
    await insertGenre('UK82', genre);

    const artist = await insertArtist('Discharge');
    await db.execute(
      sql`INSERT INTO artist_genres (artist_id, genre_id) VALUES (${artist}, ${genre})`,
    );

    const record = await db.execute<{ id: string }>(
      sql`INSERT INTO records (artist_id, title) VALUES (${artist}, 'Hear Nothing') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${record.rows[0].id}, ${genre})`,
    );

    const want = await db.execute<{ id: string }>(
      sql`INSERT INTO want_list (artist_id, title) VALUES (${artist}, 'Why?') RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO want_list_genres (want_list_id, genre_id) VALUES (${want.rows[0].id}, ${genre})`,
    );

    const response = await deleteGenre(
      request(`/api/genres/${genre}`, { method: 'DELETE' }),
      params(genre),
    );

    expect(response.status).toBe(409);
    // One from each of the four referrers.
    expect((await response.json()).error.referenceCount).toBe(4);
  });

  it('returns 409, not 500, when a reference appears after the count', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/genres');
    const genre = await insertGenre('Punk');
    const artist = await insertArtist('Antisect');

    const hook = vi.spyOn(queries, 'countGenreReferences').mockImplementation(async () => {
      await db.execute(
        sql`INSERT INTO artist_genres (artist_id, genre_id) VALUES (${artist}, ${genre})`,
      );
      return 0;
    });

    try {
      const response = await deleteGenre(
        request(`/api/genres/${genre}`, { method: 'DELETE' }),
        params(genre),
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('IN_USE');
      expect(body.error.referenceCount).toBe(1);
    } finally {
      hook.mockRestore();
    }

    expect(await genreNames()).toEqual(['Punk']);
    expect(spy).not.toHaveBeenCalled();
  });
});
