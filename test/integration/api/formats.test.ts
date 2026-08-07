import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listFormats, POST as createFormat } from '@/app/api/formats/route';
import {
  GET as getFormat,
  PATCH as patchFormat,
  DELETE as deleteFormat,
} from '@/app/api/formats/[id]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.4 reference CRUD for `formats`, plus §4.1's seeded-row rule.
 *
 * This resource is the awkward one: `truncateAll` preserves `formats`, because
 * the seven seeded rows are migration-created reference data rather than test
 * state. So NO test here may assume an empty table — every assertion is
 * relative to the seeded baseline, and every user-created row is cleaned up by
 * the beforeEach below rather than by truncation.
 */

const db = getTestDb();

const SEEDED_COUNT = 7;

/**
 * `formats` is the one table truncateAll preserves, so this file must restore
 * it by hand — and restoring means BOTH halves. Deleting user rows alone is not
 * enough: the rename tests below legitimately rename seeded rows, and those
 * renames persist for the whole run, breaking formats-seed.test.ts and every
 * later assertion about the seeded names. Found by the full suite, which failed
 * while this file passed in isolation.
 */
const SEEDED_NAMES = ['LP', '2xLP', '7"', '10"', '12" Single', 'Box Set', 'Picture Disc'];

beforeEach(async () => {
  await truncateAll();
  await db.execute(sql`DELETE FROM formats WHERE is_seeded = false`);

  // Restore the seeded names, in two phases. A single pass collides: renaming
  // row A to "LP" fails while row B still holds that name, and which rows are
  // out of place depends on which test ran last. Parking every row on a
  // guaranteed-unique temporary name first makes the restore order-independent.
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM formats WHERE is_seeded = true ORDER BY created_at, id`,
  );
  if (rows.rows.length !== SEEDED_COUNT) {
    throw new Error(`expected ${SEEDED_COUNT} seeded formats, found ${rows.rows.length}`);
  }

  for (const row of rows.rows) {
    await db.execute(sql`UPDATE formats SET name = ${`restoring-${row.id}`} WHERE id = ${row.id}`);
  }
  for (const [index, row] of rows.rows.entries()) {
    await db.execute(sql`UPDATE formats SET name = ${SEEDED_NAMES[index]} WHERE id = ${row.id}`);
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  // beforeEach cleans up ahead of each test, which leaves the LAST test's rows
  // behind for whichever file runs next — formats survives truncateAll, so that
  // leak is permanent for the run. Cleaning up here too is what keeps this file
  // from breaking others.
  // Records first: a user format left referenced by the last test cannot be
  // deleted while the record exists (records.format_id is NO ACTION), and this
  // cleanup would then fail on the foreign key.
  await db.execute(sql`DELETE FROM records`);
  await db.execute(sql`DELETE FROM formats WHERE is_seeded = false`);
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

async function seededFormatId(name = 'LP'): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM formats WHERE name = ${name} AND is_seeded = true`,
  );
  if (rows.rows.length === 0) throw new Error(`seeded format ${name} missing`);
  return rows.rows[0].id;
}

async function insertUserFormat(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO formats (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function formatExists(id: string): Promise<boolean> {
  const rows = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM formats WHERE id = ${id}`,
  );
  return rows.rows[0].n > 0;
}

async function insertArtist(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

describe('unauthenticated access', () => {
  it('routes both paths through middleware as session-protected', () => {
    expect(middlewareRuns('/api/formats')).toBe(true);
    expect(middlewareRuns(`/api/formats/${UNUSED_UUID}`)).toBe(true);
    expect(routeAuthMode('/api/formats')).toBe('session');
    expect(routeAuthMode(`/api/formats/${UNUSED_UUID}`)).toBe('session');
  });
});

describe('unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks nothing when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await db.execute(sql`ALTER TABLE formats RENAME TO formats_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await listFormats(request('/api/formats'));
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE formats_hidden RENAME TO formats`);
    }

    expect(status).toBe(500);
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('formats_hidden');
  });
});

describe('GET /api/formats', () => {
  it('returns the seven seeded formats with isSeeded true', async () => {
    const response = await listFormats(request('/api/formats?pageSize=200'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta.total).toBe(SEEDED_COUNT);
    expect(body.data.every((f: { isSeeded: boolean }) => f.isSeeded)).toBe(true);
    expect(body.data.map((f: { name: string }) => f.name)).toContain('LP');
  });

  it('includes user-created formats alongside the seeded ones', async () => {
    await insertUserFormat('Cassette');

    const response = await listFormats(request('/api/formats?pageSize=200'));
    const body = await response.json();

    expect(body.meta.total).toBe(SEEDED_COUNT + 1);
    const cassette = body.data.find((f: { name: string }) => f.name === 'Cassette');
    expect(cassette.isSeeded).toBe(false);
  });

  it('rejects an out-of-range page with 400, never reaching SQL', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const response = await listFormats(request('/api/formats?page=99999999999999999999'));

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a real but unenumerated sort column with 400', async () => {
    // `is_seeded` is a real column and would sort fine; it is refused because
    // it is not enumerated.
    const response = await listFormats(request('/api/formats?sort=isSeeded:asc'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.sort).toBeDefined();
  });

  it('clamps pageSize to 200 instead of rejecting it', async () => {
    const response = await listFormats(request('/api/formats?pageSize=5000'));

    expect(response.status).toBe(200);
    expect((await response.json()).meta.pageSize).toBe(200);
  });
});

describe('POST /api/formats', () => {
  it('creates a user format with isSeeded false', async () => {
    const response = await createFormat(jsonRequest('/api/formats', 'POST', { name: 'Cassette' }));

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ name: 'Cassette', isSeeded: false });
  });

  it('rejects a duplicate of a seeded name with 409', async () => {
    const response = await createFormat(jsonRequest('/api/formats', 'POST', { name: 'LP' }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('DUPLICATE');
  });

  /**
   * Specified explicitly: is_seeded must not be settable through the API.
   * strictObject should already reject it, but asserting it rather than
   * assuming is the point — this is the guard that would let a user mint an
   * undeletable format.
   */
  it('rejects an attempt to set isSeeded through POST', async () => {
    const response = await createFormat(
      jsonRequest('/api/formats', 'POST', { name: 'Cassette', isSeeded: true }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.isSeeded).toBeDefined();

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM formats WHERE name = 'Cassette'`,
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it('rejects the snake_case spelling too', async () => {
    // A client copying the column name from the schema rather than the API.
    const response = await createFormat(
      jsonRequest('/api/formats', 'POST', { name: 'Cassette', is_seeded: true }),
    );

    expect(response.status).toBe(400);
  });

  it('rejects a missing name with 400 and a field error', async () => {
    const response = await createFormat(jsonRequest('/api/formats', 'POST', {}));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.name).toBeDefined();
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createFormat(
      request('/api/formats', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('returns 409 when a concurrent create wins the unique index', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/formats');

        /**
     * Only the FIRST call is hooked. The recovery path re-reads by name to
     * supply §5.4's existingId, so a mock returning undefined every time
     * makes the handler rethrow — the mock defeating the code under test.
     */
    const real = queries.findFormatByName;
    let firstCall = true;

const claim = vi.spyOn(queries, 'findFormatByName').mockImplementation(async (name) => {
      if (!firstCall) return real(name);
      firstCall = false;
      await db.execute(sql`INSERT INTO formats (name) VALUES ('Cassette')`);
      return undefined;
    });

    try {
      const response = await createFormat(
        jsonRequest('/api/formats', 'POST', { name: 'Cassette' }),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('DUPLICATE');
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('GET /api/formats/:id', () => {
  it('returns a seeded format with isSeeded true', async () => {
    const id = await seededFormatId('LP');
    const response = await getFormat(request(`/api/formats/${id}`), params(id));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, name: 'LP', isSeeded: true });
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const response = await getFormat(request(`/api/formats/${UNUSED_UUID}`), params(UNUSED_UUID));
    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await getFormat(request('/api/formats/nope'), params('nope'));
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/formats/:id', () => {
  it('renames a user-created format', async () => {
    const id = await insertUserFormat('Cassete');

    const response = await patchFormat(
      jsonRequest(`/api/formats/${id}`, 'PATCH', { name: 'Cassette' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: 'Cassette', isSeeded: false });
  });

  it('allows renaming a SEEDED format, per §4.1', async () => {
    const id = await seededFormatId('Picture Disc');

    const response = await patchFormat(
      jsonRequest(`/api/formats/${id}`, 'PATCH', { name: 'Picture LP' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: 'Picture LP', isSeeded: true });
  });

  it('rejects an attempt to clear isSeeded through PATCH', async () => {
    // The other half of the unsettable rule: clearing the flag would make a
    // seeded row deletable, achieving by PATCH what DELETE refuses.
    const id = await seededFormatId('LP');

    const response = await patchFormat(
      jsonRequest(`/api/formats/${id}`, 'PATCH', { isSeeded: false }),
      params(id),
    );

    expect(response.status).toBe(400);

    const rows = await db.execute<{ is_seeded: boolean }>(
      sql`SELECT is_seeded FROM formats WHERE id = ${id}`,
    );
    expect(rows.rows[0].is_seeded).toBe(true);
  });

  it('rejects setting isSeeded alongside a legitimate rename', async () => {
    // The smuggling case: a valid field carrying an invalid one.
    const id = await insertUserFormat('Cassette');

    const response = await patchFormat(
      jsonRequest(`/api/formats/${id}`, 'PATCH', { name: 'Tape', isSeeded: true }),
      params(id),
    );

    expect(response.status).toBe(400);

    const rows = await db.execute<{ name: string; is_seeded: boolean }>(
      sql`SELECT name, is_seeded FROM formats WHERE id = ${id}`,
    );
    // Neither change applied.
    expect(rows.rows[0]).toMatchObject({ name: 'Cassette', is_seeded: false });
  });

  it('rejects renaming onto an existing name with 409', async () => {
    const id = await insertUserFormat('Cassette');

    const response = await patchFormat(
      jsonRequest(`/api/formats/${id}`, 'PATCH', { name: 'LP' }),
      params(id),
    );

    expect(response.status).toBe(409);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchFormat(
      jsonRequest(`/api/formats/${UNUSED_UUID}`, 'PATCH', { name: 'x' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await patchFormat(
      jsonRequest('/api/formats/nope', 'PATCH', { name: 'x' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('rejects an empty name with 400', async () => {
    const id = await insertUserFormat('Cassette');

    const response = await patchFormat(
      jsonRequest(`/api/formats/${id}`, 'PATCH', { name: '' }),
      params(id),
    );

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/formats/:id — the seeded guard (SPEC.md §4.1)', () => {
  it('refuses to delete a seeded, UNREFERENCED format with 409 SEEDED', async () => {
    // Unreferenced is the whole point: IN_USE would not fire here, and without
    // this guard the row would be permanently gone with nothing to re-seed it.
    const id = await seededFormatId('LP');

    const response = await deleteFormat(
      request(`/api/formats/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('SEEDED');
    expect(await formatExists(id)).toBe(true);
  });

  it('deletes a user-created, unreferenced format', async () => {
    const id = await insertUserFormat('Cassette');

    const response = await deleteFormat(
      request(`/api/formats/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await formatExists(id)).toBe(false);
  });

  /**
   * The case a name-matched guard would have broken, and the reason the column
   * exists. Renaming a seeded row must not make it deletable.
   */
  it('still refuses a seeded format after it has been renamed', async () => {
    const id = await seededFormatId('Box Set');

    const renamed = await patchFormat(
      jsonRequest(`/api/formats/${id}`, 'PATCH', { name: 'Boxed Set Edition' }),
      params(id),
    );
    expect(renamed.status).toBe(200);

    const response = await deleteFormat(
      request(`/api/formats/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('SEEDED');
    expect(await formatExists(id)).toBe(true);
  });

  it('distinguishes SEEDED from IN_USE, since the remedies differ', async () => {
    // A seeded row that is ALSO referenced still reports SEEDED: removing the
    // referencing records would not make it deletable, so telling the user to
    // do that would send them on an impossible errand.
    const id = await seededFormatId('7"');
    const artistId = await insertArtist('Wire');
    await db.execute(
      sql`INSERT INTO records (artist_id, format_id, title) VALUES (${artistId}, ${id}, 'Outdoor Miner')`,
    );

    const response = await deleteFormat(
      request(`/api/formats/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('SEEDED');
  });
});

describe('DELETE /api/formats/:id — the ordinary rules', () => {
  it('returns 404 for an id that does not exist', async () => {
    const response = await deleteFormat(
      request(`/api/formats/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await deleteFormat(
      request('/api/formats/nope', { method: 'DELETE' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('refuses a referenced user format with 409 IN_USE', async () => {
    const id = await insertUserFormat('Cassette');
    const artistId = await insertArtist('Bad Brains');
    await db.execute(
      sql`INSERT INTO records (artist_id, format_id, title) VALUES (${artistId}, ${id}, 'ROIR Sessions')`,
    );

    const response = await deleteFormat(
      request(`/api/formats/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);
    expect(await formatExists(id)).toBe(true);
  });

  it('returns 409, not 500, when a reference appears after the count', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/formats');
    const id = await insertUserFormat('Cassette');
    const artistId = await insertArtist('Void');

    const hook = vi.spyOn(queries, 'countFormatReferences').mockImplementation(async () => {
      await db.execute(
        sql`INSERT INTO records (artist_id, format_id, title) VALUES (${artistId}, ${id}, 'Faith/Void')`,
      );
      return 0;
    });

    try {
      const response = await deleteFormat(
        request(`/api/formats/${id}`, { method: 'DELETE' }),
        params(id),
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('IN_USE');
      expect(body.error.referenceCount).toBe(1);
    } finally {
      hook.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});
