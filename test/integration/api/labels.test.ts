import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listLabels, POST as createLabel } from '@/app/api/labels/route';
import {
  GET as getLabel,
  PATCH as patchLabel,
  DELETE as deleteLabel,
} from '@/app/api/labels/[id]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.4 reference CRUD for `labels`, against the template remediated in
 * units A–E. Differences from `tags`: two nullable fields (`notes`,
 * `discogsLabelId`) and a partial unique index on `discogsLabelId` that §4.1
 * requires to behave identically to artists and pressings.
 *
 * Race tests ship in this file, not a later one (NOTES.md acceptance criterion
 * 2): a fallback behind a pre-check that returns first is unreachable in normal
 * testing and can be dead while the suite stays green.
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

async function insertLabel(name: string, discogsLabelId?: number): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO labels (name, discogs_label_id) VALUES (${name}, ${discogsLabelId ?? null}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertArtist(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function labelNames(): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(sql`SELECT name FROM labels ORDER BY name`);
  return rows.rows.map((r) => r.name);
}

// --- Unauthenticated (criterion: middleware classification) ------------------

describe('unauthenticated access', () => {
  it('routes both paths through middleware as session-protected', () => {
    expect(middlewareRuns('/api/labels')).toBe(true);
    expect(middlewareRuns(`/api/labels/${UNUSED_UUID}`)).toBe(true);
    expect(routeAuthMode('/api/labels')).toBe('session');
    expect(routeAuthMode(`/api/labels/${UNUSED_UUID}`)).toBe('session');
  });
});

// --- Criterion 1: every handler wrapped --------------------------------------

describe('unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks nothing when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await db.execute(sql`ALTER TABLE labels RENAME TO labels_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await listLabels(request('/api/labels'));
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE labels_hidden RENAME TO labels`);
    }

    expect(status).toBe(500);
    expect(JSON.parse(serialized)).toEqual({
      error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
    });
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('labels_hidden');
  });
});

// --- GET /api/labels ---------------------------------------------------------

describe('GET /api/labels', () => {
  it('returns the §5 list envelope with hydrated fields', async () => {
    await insertLabel('Dischord', 1234);
    await insertLabel('Crass Records');

    const response = await listLabels(request('/api/labels'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta).toEqual({ total: 2, page: 1, pageSize: 50 });
    expect(body.data[0]).toMatchObject({ name: 'Crass Records', discogsLabelId: null });
    expect(body.data[1]).toMatchObject({ name: 'Dischord', discogsLabelId: 1234 });
  });

  it('returns an empty list rather than 404 when there are none', async () => {
    const response = await listLabels(request('/api/labels'));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([]);
  });

  it('paginates, reporting total across all pages', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) await insertLabel(name);

    const response = await listLabels(request('/api/labels?page=2&pageSize=2'));
    const body = await response.json();

    expect(body.meta).toEqual({ total: 5, page: 2, pageSize: 2 });
    expect(body.data.map((l: { name: string }) => l.name)).toEqual(['c', 'd']);
  });

  it('clamps pageSize to 200 instead of rejecting it', async () => {
    await insertLabel('Dischord');
    const response = await listLabels(request('/api/labels?pageSize=5000'));

    expect(response.status).toBe(200);
    expect((await response.json()).meta.pageSize).toBe(200);
  });

  it('rejects an out-of-range page with 400, never reaching SQL', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const response = await listLabels(request('/api/labels?page=99999999999999999999'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.page).toBeDefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sorts by an allowlisted field in both directions', async () => {
    for (const name of ['beta', 'alpha', 'gamma']) await insertLabel(name);

    const asc = await listLabels(request('/api/labels?sort=name:asc'));
    expect((await asc.json()).data.map((l: { name: string }) => l.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);

    const desc = await listLabels(request('/api/labels?sort=name:desc'));
    expect((await desc.json()).data.map((l: { name: string }) => l.name)).toEqual([
      'gamma',
      'beta',
      'alpha',
    ]);
  });

  // Criterion 7: the rejection side is what distinguishes an allowlist.
  it('rejects a real but unenumerated sort column with 400', async () => {
    const response = await listLabels(request('/api/labels?sort=notes:asc'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.sort).toBeDefined();
  });

  it('rejects a SQL injection payload in sort without executing it', async () => {
    await insertLabel('Dischord');

    const response = await listLabels(
      request(`/api/labels?sort=${encodeURIComponent('name; DROP TABLE labels--')}`),
    );

    expect(response.status).toBe(400);
    expect(await labelNames()).toEqual(['Dischord']);
  });

  // Criterion 6: the id tiebreaker, proven with genuine ties.
  it('pages consistently when every createdAt is identical', async () => {
    const shared = '2020-01-01T00:00:00.000Z';
    const names = Array.from({ length: 60 }, (_, i) => `label-${String(i).padStart(3, '0')}`);
    for (const name of names) {
      await db.execute(
        sql`INSERT INTO labels (name, created_at) VALUES (${name}, ${shared}::timestamptz)`,
      );
    }

    const seen: string[] = [];
    for (let page = 1; page <= 6; page += 1) {
      const response = await listLabels(
        request(`/api/labels?sort=createdAt:asc&page=${page}&pageSize=10`),
      );
      seen.push(...(await response.json()).data.map((l: { name: string }) => l.name));
      await db.execute(sql`UPDATE labels SET updated_at = now() WHERE name = ${names[page]}`);
    }

    expect(seen).toHaveLength(60);
    expect([...new Set(seen)]).toHaveLength(60);
  });
});

// --- POST /api/labels --------------------------------------------------------

describe('POST /api/labels', () => {
  it('creates a label and returns 201', async () => {
    const response = await createLabel(
      jsonRequest('/api/labels', 'POST', { name: 'Dischord', notes: 'DC' }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ name: 'Dischord', notes: 'DC', discogsLabelId: null });
    expect(await labelNames()).toEqual(['Dischord']);
  });

  it('accepts a discogsLabelId', async () => {
    const response = await createLabel(
      jsonRequest('/api/labels', 'POST', { name: 'Dischord', discogsLabelId: 1234 }),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).discogsLabelId).toBe(1234);
  });

  it('rejects a missing name with 400 and a field error', async () => {
    const response = await createLabel(jsonRequest('/api/labels', 'POST', {}));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.name).toBeDefined();
    expect(await labelNames()).toEqual([]);
  });

  it('rejects unknown keys rather than silently dropping them', async () => {
    const response = await createLabel(
      jsonRequest('/api/labels', 'POST', { name: 'Dischord', id: UNUSED_UUID }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.id).toBeDefined();
    expect(await labelNames()).toEqual([]);
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createLabel(
      request('/api/labels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('rejects a duplicate name with 409', async () => {
    await insertLabel('Dischord');
    const response = await createLabel(jsonRequest('/api/labels', 'POST', { name: 'Dischord' }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('DUPLICATE');
  });

  // Criterion 5: NFC/NFD, built from escapes so the precondition survives disk.
  it('treats NFC and NFD forms of the same name as a duplicate', async () => {
    // From escapes: a typed NFD literal is normalized to NFC on being written
    // to disk, which silently destroys the precondition (criterion 5).
    const nfc = 'Bj\u00F6rk Records';
    const nfd = 'Bjo\u0308rk Records';
    expect(nfc).not.toBe(nfd);

    expect((await createLabel(jsonRequest('/api/labels', 'POST', { name: nfd }))).status).toBe(201);
    const second = await createLabel(jsonRequest('/api/labels', 'POST', { name: nfc }));

    expect(second.status).toBe(409);
    expect(await labelNames()).toEqual([nfc]);
  });

  it('rejects a name of only invisible characters', async () => {
    const response = await createLabel(
      jsonRequest('/api/labels', 'POST', { name: '​‌﻿' }),
    );

    expect(response.status).toBe(400);
    expect(await labelNames()).toEqual([]);
  });

  it('rejects a duplicate discogsLabelId with 409, not a 500', async () => {
    // §4.1: the find-or-create key must be unique when present. The partial
    // unique index was missing until unit G; this is what makes it observable.
    await insertLabel('Dischord', 1234);

    const response = await createLabel(
      jsonRequest('/api/labels', 'POST', { name: 'Dischord Records', discogsLabelId: 1234 }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('DUPLICATE');
    expect(await labelNames()).toEqual(['Dischord']);
  });

  it('allows many labels with no discogsLabelId', async () => {
    // "Unique WHEN PRESENT" — a plain unique index would reject the second.
    expect(
      (await createLabel(jsonRequest('/api/labels', 'POST', { name: 'Crass Records' }))).status,
    ).toBe(201);
    expect(
      (await createLabel(jsonRequest('/api/labels', 'POST', { name: 'Spiderleg' }))).status,
    ).toBe(201);
  });

  // Criterion 2: race written alongside the pre-check it guards.
  it('returns 409 when a concurrent create wins the unique index', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/labels');

        /**
     * Only the FIRST call is hooked. The recovery path re-reads by name to
     * supply §5.4's existingId, so a mock returning undefined every time
     * makes the handler rethrow — the mock defeating the code under test.
     */
    const real = queries.findLabelByName;
    let firstCall = true;

const claim = vi.spyOn(queries, 'findLabelByName').mockImplementation(async (name) => {
      if (!firstCall) return real(name);
      firstCall = false;
      await db.execute(sql`INSERT INTO labels (name) VALUES ('Dischord')`);
      return undefined;
    });

    try {
      const response = await createLabel(jsonRequest('/api/labels', 'POST', { name: 'Dischord' }));

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('DUPLICATE');
    } finally {
      claim.mockRestore();
    }

    expect(await labelNames()).toEqual(['Dischord']);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent create claims the discogsLabelId', async () => {
    // The second unique constraint on this table needs its own race test: the
    // name pre-check does not look at discogsLabelId at all.
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/labels');

        /**
     * Only the FIRST call is hooked. The recovery path re-reads by name to
     * supply §5.4's existingId, so a mock returning undefined every time
     * makes the handler rethrow — the mock defeating the code under test.
     */
    const real = queries.findLabelByName;
    let firstCall = true;

const claim = vi.spyOn(queries, 'findLabelByName').mockImplementation(async (name) => {
      if (!firstCall) return real(name);
      firstCall = false;
      await db.execute(sql`INSERT INTO labels (name, discogs_label_id) VALUES ('Other', 4321)`);
      return undefined;
    });

    try {
      const response = await createLabel(
        jsonRequest('/api/labels', 'POST', { name: 'Dischord', discogsLabelId: 4321 }),
      );

      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('DUPLICATE');
    } finally {
      claim.mockRestore();
    }

    expect(spy).not.toHaveBeenCalled();
  });
});

// --- GET /api/labels/:id -----------------------------------------------------

describe('GET /api/labels/:id', () => {
  it('returns the label', async () => {
    const id = await insertLabel('Dischord', 1234);
    const response = await getLabel(request(`/api/labels/${id}`), params(id));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, name: 'Dischord', discogsLabelId: 1234 });
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const response = await getLabel(request(`/api/labels/${UNUSED_UUID}`), params(UNUSED_UUID));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for a non-UUID id rather than attempting a lookup', async () => {
    const response = await getLabel(request('/api/labels/not-a-uuid'), params('not-a-uuid'));
    expect(response.status).toBe(400);
  });
});

// --- PATCH /api/labels/:id ---------------------------------------------------

describe('PATCH /api/labels/:id', () => {
  it('updates only the fields supplied', async () => {
    const id = await insertLabel('Dischord', 1234);

    const response = await patchLabel(
      jsonRequest(`/api/labels/${id}`, 'PATCH', { notes: 'Washington DC' }),
      params(id),
    );

    expect(response.status).toBe(200);
    // Name and discogsLabelId untouched by a partial update.
    expect(await response.json()).toMatchObject({
      name: 'Dischord',
      notes: 'Washington DC',
      discogsLabelId: 1234,
    });
  });

  it('clears a nullable field when explicitly sent null', async () => {
    // Distinguishes "omitted" from "set to null" — a PATCH that cannot clear a
    // field leaves the user no way to remove a wrong Discogs id.
    const id = await insertLabel('Dischord', 1234);

    const response = await patchLabel(
      jsonRequest(`/api/labels/${id}`, 'PATCH', { discogsLabelId: null }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).discogsLabelId).toBeNull();
  });

  it('rejects an empty name with 400', async () => {
    const id = await insertLabel('Dischord');

    const response = await patchLabel(
      jsonRequest(`/api/labels/${id}`, 'PATCH', { name: '' }),
      params(id),
    );

    expect(response.status).toBe(400);
    expect(await labelNames()).toEqual(['Dischord']);
  });

  it('rejects unknown keys', async () => {
    const id = await insertLabel('Dischord');

    const response = await patchLabel(
      jsonRequest(`/api/labels/${id}`, 'PATCH', { name: 'ok', createdAt: '2020-01-01' }),
      params(id),
    );

    expect(response.status).toBe(400);
  });

  it('rejects an empty body rather than reporting a no-op success', async () => {
    const id = await insertLabel('Dischord');

    const response = await patchLabel(jsonRequest(`/api/labels/${id}`, 'PATCH', {}), params(id));

    expect(response.status).toBe(400);
    // The message, not just the status: a status-only assertion cannot tell a
    // considered rejection from one whose explanation was discarded.
    expect((await response.json()).error.message).toBe(
      'At least one field must be supplied',
    );
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchLabel(
      jsonRequest(`/api/labels/${UNUSED_UUID}`, 'PATCH', { name: 'x' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await patchLabel(
      jsonRequest('/api/labels/nope', 'PATCH', { name: 'x' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('rejects renaming onto an existing name with 409', async () => {
    await insertLabel('Dischord');
    const id = await insertLabel('Crass Records');

    const response = await patchLabel(
      jsonRequest(`/api/labels/${id}`, 'PATCH', { name: 'Dischord' }),
      params(id),
    );

    expect(response.status).toBe(409);
    expect(await labelNames()).toEqual(['Crass Records', 'Dischord']);
  });

  it('returns 409 when a concurrent rename wins the unique index', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/labels');
    const id = await insertLabel('Crass Records');

    const claim = vi.spyOn(queries, 'labelNameTakenByOther').mockImplementation(async () => {
      await db.execute(sql`INSERT INTO labels (name) VALUES ('Dischord')`);
      return false;
    });

    try {
      const response = await patchLabel(
        jsonRequest(`/api/labels/${id}`, 'PATCH', { name: 'Dischord' }),
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

// --- DELETE /api/labels/:id --------------------------------------------------

describe('DELETE /api/labels/:id', () => {
  it('deletes an unreferenced label', async () => {
    const id = await insertLabel('Dischord');

    const response = await deleteLabel(
      request(`/api/labels/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await labelNames()).toEqual([]);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await deleteLabel(
      request(`/api/labels/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await deleteLabel(
      request('/api/labels/nope', { method: 'DELETE' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('refuses to delete a label referenced by a record, with 409 IN_USE', async () => {
    const labelId = await insertLabel('Dischord');
    const artistId = await insertArtist('Minor Threat');
    await db.execute(
      sql`INSERT INTO records (artist_id, label_id, title) VALUES (${artistId}, ${labelId}, 'Out of Step')`,
    );

    const response = await deleteLabel(
      request(`/api/labels/${labelId}`, { method: 'DELETE' }),
      params(labelId),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);
    expect(await labelNames()).toEqual(['Dischord']);
  });

  it('counts want_list references too, not only records', async () => {
    // Criterion 3: labels has TWO blocking referrers. Counting only records
    // under-reports and lets a delete be attempted that the FK then refuses.
    const labelId = await insertLabel('Dischord');
    const artistId = await insertArtist('Fugazi');
    await db.execute(
      sql`INSERT INTO want_list (artist_id, label_id, title) VALUES (${artistId}, ${labelId}, 'Repeater')`,
    );

    const response = await deleteLabel(
      request(`/api/labels/${labelId}`, { method: 'DELETE' }),
      params(labelId),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.referenceCount).toBe(1);
  });

  it('sums references across both referrers', async () => {
    const labelId = await insertLabel('Dischord');
    const artistId = await insertArtist('Rites of Spring');
    await db.execute(
      sql`INSERT INTO records (artist_id, label_id, title) VALUES (${artistId}, ${labelId}, 'End on End')`,
    );
    await db.execute(
      sql`INSERT INTO want_list (artist_id, label_id, title) VALUES (${artistId}, ${labelId}, 'Deflowered')`,
    );

    const response = await deleteLabel(
      request(`/api/labels/${labelId}`, { method: 'DELETE' }),
      params(labelId),
    );

    expect((await response.json()).error.referenceCount).toBe(2);
  });

  // Criterion 2 + 4: reference appears after the count.
  it('returns 409, not 500, when a reference appears after the count', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/labels');
    const labelId = await insertLabel('Dischord');
    const artistId = await insertArtist('Embrace');

    const hook = vi.spyOn(queries, 'countLabelReferences').mockImplementation(async () => {
      await db.execute(
        sql`INSERT INTO records (artist_id, label_id, title) VALUES (${artistId}, ${labelId}, 'Embrace')`,
      );
      return 0;
    });

    try {
      const response = await deleteLabel(
        request(`/api/labels/${labelId}`, { method: 'DELETE' }),
        params(labelId),
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('IN_USE');
      // Re-read after the violation, not the stale zero the pre-check returned.
      expect(body.error.referenceCount).toBe(1);
    } finally {
      hook.mockRestore();
    }

    expect(await labelNames()).toEqual(['Dischord']);
    expect(spy).not.toHaveBeenCalled();
  });
});
