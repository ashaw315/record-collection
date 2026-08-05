import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listTags, POST as createTag } from '@/app/api/tags/route';
import {
  GET as getTag,
  PATCH as patchTag,
  DELETE as deleteTag,
} from '@/app/api/tags/[id]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';

/**
 * SPEC.md §5.4 reference CRUD, proven against the simplest reference resource.
 * This is the template every endpoint in steps 5–12 copies, so it covers all
 * four cases per handler (happy path, validation failure, not found,
 * unauthenticated) plus the two rules that are easy to write in a way that
 * passes without constraining anything: the §7.4 409 and the sort allowlist.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
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

/** Next 15+ passes route params as a promise. */
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function insertTag(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO tags (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertArtist(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertRecord(artistId: string, title: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO records (artist_id, title) VALUES (${artistId}, ${title}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function tagRecord(recordId: string, tagId: string): Promise<void> {
  await db.execute(
    sql`INSERT INTO record_tags (record_id, tag_id) VALUES (${recordId}, ${tagId})`,
  );
}

async function tagNames(): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(sql`SELECT name FROM tags ORDER BY name`);
  return rows.rows.map((r) => r.name);
}

// --- Unauthenticated ---------------------------------------------------------

/**
 * Auth is enforced in middleware (SPEC.md §3), not per handler, so asserting a
 * 401 from a directly-invoked handler would be vacuous — it would pass whether
 * or not the route were actually protected. What actually protects these paths
 * is that middleware runs for them and classifies them as session-protected, so
 * that is what is asserted.
 */
describe('unauthenticated access', () => {
  it('routes /api/tags and /api/tags/:id through middleware', () => {
    expect(middlewareRuns('/api/tags')).toBe(true);
    expect(middlewareRuns(`/api/tags/${UNUSED_UUID}`)).toBe(true);
  });

  it('classifies both as session-protected, not public or cron', () => {
    expect(routeAuthMode('/api/tags')).toBe('session');
    expect(routeAuthMode(`/api/tags/${UNUSED_UUID}`)).toBe('session');
  });
});

// --- GET /api/tags -----------------------------------------------------------

describe('GET /api/tags', () => {
  it('returns the §5 list envelope with meta', async () => {
    await insertTag('signed');
    await insertTag('gift');

    const response = await listTags(request('/api/tags'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ total: 2, page: 1, pageSize: 50 });
    expect(body.data[0]).toHaveProperty('id');
    expect(body.data[0]).toHaveProperty('name');
  });

  it('returns an empty list rather than 404 when there are no tags', async () => {
    const response = await listTags(request('/api/tags'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });

  it('paginates, reporting total across all pages not just the page', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) await insertTag(name);

    const response = await listTags(request('/api/tags?page=2&pageSize=2'));
    const body = await response.json();

    expect(body.data).toHaveLength(2);
    expect(body.meta).toEqual({ total: 5, page: 2, pageSize: 2 });
    expect(body.data.map((t: { name: string }) => t.name)).toEqual(['c', 'd']);
  });

  it('clamps pageSize to 200 instead of rejecting it', async () => {
    await insertTag('signed');

    const response = await listTags(request('/api/tags?pageSize=5000'));
    expect(response.status).toBe(200);
    expect((await response.json()).meta.pageSize).toBe(200);
  });

  it('sorts by an allowlisted field in both directions', async () => {
    for (const name of ['beta', 'alpha', 'gamma']) await insertTag(name);

    const asc = await listTags(request('/api/tags?sort=name:asc'));
    expect((await asc.json()).data.map((t: { name: string }) => t.name)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);

    const desc = await listTags(request('/api/tags?sort=name:desc'));
    expect((await desc.json()).data.map((t: { name: string }) => t.name)).toEqual([
      'gamma',
      'beta',
      'alpha',
    ]);
  });

  /**
   * The sort allowlist is trivially easy to test in a way that passes without
   * constraining anything — asserting only that `?sort=name` works proves
   * nothing about what happens to `?sort=id`. These assert the rejection side,
   * including that a real-but-unenumerated column is refused, which is what
   * separates an allowlist from a blocklist.
   */
  it('rejects a sort field that is not enumerated, with 400', async () => {
    const response = await listTags(request('/api/tags?sort=id:asc'));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fieldErrors.sort).toBeDefined();
  });

  it('rejects a SQL injection payload in sort without executing it', async () => {
    await insertTag('signed');

    const response = await listTags(
      request(`/api/tags?sort=${encodeURIComponent('name; DROP TABLE tags--')}`),
    );
    expect(response.status).toBe(400);

    // The table is still there and still populated: proof the payload was
    // rejected rather than interpolated.
    expect(await tagNames()).toEqual(['signed']);
  });

  it('rejects an invalid page with 400 and a field error', async () => {
    const response = await listTags(request('/api/tags?page=0'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.page).toBeDefined();
  });
});

// --- POST /api/tags ----------------------------------------------------------

describe('POST /api/tags', () => {
  it('creates a tag and returns 201 with the created row', async () => {
    const response = await createTag(jsonRequest('/api/tags', 'POST', { name: 'signed' }));
    expect(response.status).toBe(201);

    const body = await response.json();
    expect(body.name).toBe('signed');
    expect(body.id).toEqual(expect.any(String));
    expect(await tagNames()).toEqual(['signed']);
  });

  it('rejects a missing name with 400 and a field error', async () => {
    const response = await createTag(jsonRequest('/api/tags', 'POST', {}));
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.fieldErrors.name).toBeDefined();
    expect(await tagNames()).toEqual([]);
  });

  it('rejects an empty name', async () => {
    const response = await createTag(jsonRequest('/api/tags', 'POST', { name: '' }));
    expect(response.status).toBe(400);
    expect(await tagNames()).toEqual([]);
  });

  it('rejects unknown keys rather than silently dropping them', async () => {
    // CLAUDE.md §6. Silently ignoring `id` would let a client believe it had set
    // one; this is also how a mass-assignment bug enters later resources.
    const response = await createTag(
      jsonRequest('/api/tags', 'POST', { name: 'signed', id: UNUSED_UUID }),
    );
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.fieldErrors.id).toBeDefined();
    expect(await tagNames()).toEqual([]);
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createTag(
      request('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('rejects a duplicate name with 409, not a 500 from the unique index', async () => {
    await insertTag('signed');

    const response = await createTag(jsonRequest('/api/tags', 'POST', { name: 'signed' }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('DUPLICATE');
    expect(await tagNames()).toEqual(['signed']);
  });

  it('trims surrounding whitespace so " signed" cannot shadow "signed"', async () => {
    await insertTag('signed');

    const response = await createTag(jsonRequest('/api/tags', 'POST', { name: '  signed  ' }));
    expect(response.status).toBe(409);
    expect(await tagNames()).toEqual(['signed']);
  });
});

// --- GET /api/tags/:id -------------------------------------------------------

describe('GET /api/tags/:id', () => {
  it('returns the tag', async () => {
    const id = await insertTag('signed');

    const response = await getTag(request(`/api/tags/${id}`), params(id));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toMatchObject({ id, name: 'signed' });
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const response = await getTag(request(`/api/tags/${UNUSED_UUID}`), params(UNUSED_UUID));
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for a non-UUID id rather than attempting a lookup', async () => {
    // SPEC.md §5.2 states this for records; the same rule applies to every
    // dynamic segment, and a bad UUID is a Postgres error, not a 404, if passed
    // through to a query.
    const response = await getTag(request('/api/tags/not-a-uuid'), params('not-a-uuid'));
    expect(response.status).toBe(400);
  });
});

// --- PATCH /api/tags/:id -----------------------------------------------------

describe('PATCH /api/tags/:id', () => {
  it('updates the name and returns the updated row', async () => {
    const id = await insertTag('signed');

    const response = await patchTag(
      jsonRequest(`/api/tags/${id}`, 'PATCH', { name: 'autographed' }),
      params(id),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).name).toBe('autographed');
    expect(await tagNames()).toEqual(['autographed']);
  });

  it('rejects an empty name with 400', async () => {
    const id = await insertTag('signed');

    const response = await patchTag(
      jsonRequest(`/api/tags/${id}`, 'PATCH', { name: '' }),
      params(id),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.name).toBeDefined();
    expect(await tagNames()).toEqual(['signed']);
  });

  it('rejects unknown keys', async () => {
    const id = await insertTag('signed');

    const response = await patchTag(
      jsonRequest(`/api/tags/${id}`, 'PATCH', { name: 'ok', createdAt: '2020-01-01' }),
      params(id),
    );
    expect(response.status).toBe(400);
    expect(await tagNames()).toEqual(['signed']);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchTag(
      jsonRequest(`/api/tags/${UNUSED_UUID}`, 'PATCH', { name: 'x' }),
      params(UNUSED_UUID),
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await patchTag(
      jsonRequest('/api/tags/nope', 'PATCH', { name: 'x' }),
      params('nope'),
    );
    expect(response.status).toBe(400);
  });

  it('rejects renaming onto an existing name with 409', async () => {
    await insertTag('signed');
    const id = await insertTag('gift');

    const response = await patchTag(
      jsonRequest(`/api/tags/${id}`, 'PATCH', { name: 'signed' }),
      params(id),
    );
    expect(response.status).toBe(409);
    expect(await tagNames()).toEqual(['gift', 'signed']);
  });
});

// --- DELETE /api/tags/:id ----------------------------------------------------

describe('DELETE /api/tags/:id', () => {
  it('deletes an unreferenced tag', async () => {
    const id = await insertTag('signed');

    const response = await deleteTag(request(`/api/tags/${id}`, { method: 'DELETE' }), params(id));
    expect(response.status).toBe(200);
    expect(await tagNames()).toEqual([]);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await deleteTag(
      request(`/api/tags/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );
    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await deleteTag(
      request('/api/tags/nope', { method: 'DELETE' }),
      params('nope'),
    );
    expect(response.status).toBe(400);
  });

  /**
   * SPEC.md §7.4 / §5.4. This rule is the one most easily faked: a test that
   * only asserts `status === 409` passes against an implementation that always
   * refuses, and a test that only deletes an unreferenced tag passes against one
   * that never checks. Both sides are asserted, and — critically — that the tag
   * and its junction row SURVIVE the refusal.
   *
   * The survival assertion matters because record_tags.tag_id is ON DELETE
   * CASCADE (§4.3). The database would happily delete the tag and silently
   * un-tag every record, so the 409 must come from the query layer. Without
   * this assertion, an implementation that returned 409 *after* deleting would
   * still pass.
   */
  it('refuses to delete a tag referenced by a record, with 409 IN_USE', async () => {
    const tagId = await insertTag('signed');
    const artistId = await insertArtist('Discharge');
    const recordId = await insertRecord(artistId, 'Hear Nothing');
    await tagRecord(recordId, tagId);

    const response = await deleteTag(
      request(`/api/tags/${tagId}`, { method: 'DELETE' }),
      params(tagId),
    );
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);

    // The refusal must not have cascaded anything away.
    expect(await tagNames()).toEqual(['signed']);
    const links = await db.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM record_tags WHERE tag_id = ${tagId}`,
    );
    expect(links.rows[0].count).toBe('1');
  });

  it('reports the true reference count, not a placeholder', async () => {
    // A hardcoded `referenceCount: 1` passes the single-reference test above.
    const tagId = await insertTag('signed');
    const artistId = await insertArtist('Amebix');
    for (const title of ['Arise!', 'Monolith', 'No Sanctuary']) {
      const recordId = await insertRecord(artistId, title);
      await tagRecord(recordId, tagId);
    }

    const response = await deleteTag(
      request(`/api/tags/${tagId}`, { method: 'DELETE' }),
      params(tagId),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.referenceCount).toBe(3);
  });

  it('deletes a tag whose only referencing record has itself been deleted', async () => {
    // Guards the inverse mistake: a check that counts historical links, or one
    // that never re-reads, would refuse forever once a tag had ever been used.
    const tagId = await insertTag('signed');
    const artistId = await insertArtist('Rudimentary Peni');
    const recordId = await insertRecord(artistId, 'Death Church');
    await tagRecord(recordId, tagId);
    await db.execute(sql`DELETE FROM records WHERE id = ${recordId}`);

    const response = await deleteTag(
      request(`/api/tags/${tagId}`, { method: 'DELETE' }),
      params(tagId),
    );
    expect(response.status).toBe(200);
    expect(await tagNames()).toEqual([]);
  });

  it('leaves other tags untouched when refusing', async () => {
    const tagId = await insertTag('signed');
    await insertTag('gift');
    const artistId = await insertArtist('Antisect');
    const recordId = await insertRecord(artistId, 'In Darkness');
    await tagRecord(recordId, tagId);

    await deleteTag(request(`/api/tags/${tagId}`, { method: 'DELETE' }), params(tagId));
    expect(await tagNames()).toEqual(['gift', 'signed']);
  });
});
