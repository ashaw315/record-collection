import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { logger } from '@/lib/logger';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as listStores, POST as createStore } from '@/app/api/stores/route';
import {
  GET as getStore,
  PATCH as patchStore,
  DELETE as deleteStore,
} from '@/app/api/stores/[id]/route';

/**
 * SPEC.md §5.4 reference CRUD for `record_stores`, mounted at /api/stores.
 *
 * Two things distinguish this resource. `name` has NO unique constraint (§4.1)
 * — deliberate, since two shops can share a name in different cities — so there
 * is no duplicate check, no rename collision, and no name race to test. And
 * `city` is nullable and sortable, making this the first endpoint where NULLS
 * LAST is observable through the API.
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

async function insertStore(name: string, city?: string | null): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO record_stores (name, city) VALUES (${name}, ${city ?? null}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function insertArtist(name: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function storeNames(): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(
    sql`SELECT name FROM record_stores ORDER BY name`,
  );
  return rows.rows.map((r) => r.name);
}


describe('unanticipated server errors', () => {
  it('returns the §5 500 shape and leaks nothing when the query fails', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {});

    await db.execute(sql`ALTER TABLE record_stores RENAME TO stores_hidden`);
    let status = 0;
    let serialized = '';
    try {
      const response = await listStores(request('/api/stores'));
      status = response.status;
      serialized = JSON.stringify(await response.json());
    } finally {
      await db.execute(sql`ALTER TABLE stores_hidden RENAME TO record_stores`);
    }

    expect(status).toBe(500);
    expect(serialized).not.toContain('select');
    expect(serialized).not.toContain('stores_hidden');
  });
});

describe('GET /api/stores', () => {
  it('returns the §5 list envelope with every field', async () => {
    await insertStore('Amoeba', 'Los Angeles');

    const response = await listStores(request('/api/stores'));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.meta).toEqual({ total: 1, page: 1, pageSize: 50 });
    expect(body.data[0]).toMatchObject({
      name: 'Amoeba',
      city: 'Los Angeles',
      isFavorite: false,
    });
  });

  it('returns an empty list rather than 404 when there are none', async () => {
    const response = await listStores(request('/api/stores'));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([]);
  });

  it('allows two stores to share a name, per §4.1', async () => {
    // The absence of a unique constraint is a real requirement, not an
    // oversight: chains exist. A duplicate check would reject this.
    expect(
      (await createStore(jsonRequest('/api/stores', 'POST', { name: 'Rough Trade', city: 'London' })))
        .status,
    ).toBe(201);
    expect(
      (await createStore(
        jsonRequest('/api/stores', 'POST', { name: 'Rough Trade', city: 'New York' }),
      )).status,
    ).toBe(201);

    expect(await storeNames()).toEqual(['Rough Trade', 'Rough Trade']);
  });

  it('paginates, reporting total across all pages', async () => {
    for (const name of ['a', 'b', 'c', 'd', 'e']) await insertStore(name);

    const response = await listStores(request('/api/stores?page=2&pageSize=2'));
    const body = await response.json();

    expect(body.meta).toEqual({ total: 5, page: 2, pageSize: 2 });
    expect(body.data.map((s: { name: string }) => s.name)).toEqual(['c', 'd']);
  });

  it('rejects an out-of-range page with 400, never reaching SQL', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const response = await listStores(request('/api/stores?page=99999999999999999999'));

    expect(response.status).toBe(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a real but unenumerated sort column with 400', async () => {
    const response = await listStores(request('/api/stores?sort=address:asc'));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.sort).toBeDefined();
  });

  /**
   * Criterion 6, and the first place it is observable through the API: Postgres
   * defaults to NULLS LAST for ASC but NULLS FIRST for DESC, so without the
   * explicit clause "sort by city descending" leads with every store whose city
   * is unknown.
   */
  it('puts null cities last when sorting by city ascending', async () => {
    await insertStore('Amoeba', 'Los Angeles');
    await insertStore('Unknown Shop A', null);
    await insertStore('Academy', 'Brooklyn');
    await insertStore('Unknown Shop B', null);

    const response = await listStores(request('/api/stores?sort=city:asc'));
    const names = (await response.json()).data.map((s: { name: string }) => s.name);

    expect(names.slice(0, 2)).toEqual(['Academy', 'Amoeba']);
    expect(names.slice(2).sort()).toEqual(['Unknown Shop A', 'Unknown Shop B']);
  });

  it('puts null cities last when sorting by city DESCENDING, against the default', async () => {
    await insertStore('Amoeba', 'Los Angeles');
    await insertStore('Unknown Shop A', null);
    await insertStore('Academy', 'Brooklyn');
    await insertStore('Unknown Shop B', null);

    const response = await listStores(request('/api/stores?sort=city:desc'));
    const names = (await response.json()).data.map((s: { name: string }) => s.name);

    expect(names.slice(0, 2)).toEqual(['Amoeba', 'Academy']);
    expect(names.slice(2).sort()).toEqual(['Unknown Shop A', 'Unknown Shop B']);
  });

  it('pages consistently when every createdAt is identical', async () => {
    const shared = '2020-01-01T00:00:00.000Z';
    const names = Array.from({ length: 60 }, (_, i) => `store-${String(i).padStart(3, '0')}`);
    for (const name of names) {
      await db.execute(
        sql`INSERT INTO record_stores (name, created_at) VALUES (${name}, ${shared}::timestamptz)`,
      );
    }

    const seen: string[] = [];
    for (let page = 1; page <= 6; page += 1) {
      const response = await listStores(
        request(`/api/stores?sort=createdAt:asc&page=${page}&pageSize=10`),
      );
      seen.push(...(await response.json()).data.map((s: { name: string }) => s.name));
      await db.execute(
        sql`UPDATE record_stores SET updated_at = now() WHERE name = ${names[page]}`,
      );
    }

    expect(seen).toHaveLength(60);
    expect([...new Set(seen)]).toHaveLength(60);
  });
});

describe('POST /api/stores', () => {
  it('creates a store with every optional field', async () => {
    const response = await createStore(
      jsonRequest('/api/stores', 'POST', {
        name: 'Amoeba',
        city: 'Los Angeles',
        stateRegion: 'CA',
        country: 'USA',
        address: '6400 Sunset Blvd',
        website: 'https://amoeba.com',
        notes: 'Big',
        isFavorite: true,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: 'Amoeba',
      city: 'Los Angeles',
      isFavorite: true,
    });
  });

  it('defaults isFavorite to false', async () => {
    const response = await createStore(jsonRequest('/api/stores', 'POST', { name: 'Amoeba' }));

    expect(response.status).toBe(201);
    expect((await response.json()).isFavorite).toBe(false);
  });

  it('rejects a missing name with 400 and a field error', async () => {
    const response = await createStore(jsonRequest('/api/stores', 'POST', {}));

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.name).toBeDefined();
    expect(await storeNames()).toEqual([]);
  });

  it('rejects unknown keys', async () => {
    const response = await createStore(
      jsonRequest('/api/stores', 'POST', { name: 'Amoeba', id: UNUSED_UUID }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.id).toBeDefined();
  });

  it('rejects a malformed JSON body with 400, not 500', async () => {
    const response = await createStore(
      request('/api/stores', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_JSON');
  });

  it('rejects a non-boolean isFavorite', async () => {
    const response = await createStore(
      jsonRequest('/api/stores', 'POST', { name: 'Amoeba', isFavorite: 'yes' }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.isFavorite).toBeDefined();
  });

  it('rejects a name of only invisible characters', async () => {
    const response = await createStore(
      jsonRequest('/api/stores', 'POST', { name: '​‌﻿' }),
    );

    expect(response.status).toBe(400);
    expect(await storeNames()).toEqual([]);
  });
});

describe('GET /api/stores/:id', () => {
  it('returns the store', async () => {
    const id = await insertStore('Amoeba', 'Los Angeles');
    const response = await getStore(request(`/api/stores/${id}`), params(id));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, name: 'Amoeba' });
  });

  it('returns 404 for a well-formed id that does not exist', async () => {
    const response = await getStore(request(`/api/stores/${UNUSED_UUID}`), params(UNUSED_UUID));
    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await getStore(request('/api/stores/nope'), params('nope'));
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/stores/:id', () => {
  it('toggles isFavorite without touching other fields', async () => {
    const id = await insertStore('Amoeba', 'Los Angeles');

    const response = await patchStore(
      jsonRequest(`/api/stores/${id}`, 'PATCH', { isFavorite: true }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: 'Amoeba',
      city: 'Los Angeles',
      isFavorite: true,
    });
  });

  it('clears a nullable field when explicitly sent null', async () => {
    const id = await insertStore('Amoeba', 'Los Angeles');

    const response = await patchStore(
      jsonRequest(`/api/stores/${id}`, 'PATCH', { city: null }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).city).toBeNull();
  });

  it('allows renaming onto a name another store already has', async () => {
    // No unique constraint (§4.1) — this must NOT be a 409.
    await insertStore('Rough Trade', 'London');
    const id = await insertStore('Sister Ray', 'London');

    const response = await patchStore(
      jsonRequest(`/api/stores/${id}`, 'PATCH', { name: 'Rough Trade' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await storeNames()).toEqual(['Rough Trade', 'Rough Trade']);
  });

  it('rejects an empty name with 400', async () => {
    const id = await insertStore('Amoeba');

    const response = await patchStore(
      jsonRequest(`/api/stores/${id}`, 'PATCH', { name: '' }),
      params(id),
    );

    expect(response.status).toBe(400);
  });

  it('rejects an empty body rather than reporting a no-op success', async () => {
    const id = await insertStore('Amoeba');
    const response = await patchStore(jsonRequest(`/api/stores/${id}`, 'PATCH', {}), params(id));

    expect(response.status).toBe(400);
    // The message, not just the status: a status-only assertion cannot tell a
    // considered rejection from one whose explanation was discarded.
    expect((await response.json()).error.message).toBe(
      'At least one field must be supplied',
    );
  });

  it('rejects unknown keys', async () => {
    const id = await insertStore('Amoeba');

    const response = await patchStore(
      jsonRequest(`/api/stores/${id}`, 'PATCH', { name: 'ok', createdAt: '2020-01-01' }),
      params(id),
    );

    expect(response.status).toBe(400);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await patchStore(
      jsonRequest(`/api/stores/${UNUSED_UUID}`, 'PATCH', { name: 'x' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await patchStore(
      jsonRequest('/api/stores/nope', 'PATCH', { name: 'x' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });
});

describe('DELETE /api/stores/:id', () => {
  it('deletes an unreferenced store', async () => {
    const id = await insertStore('Amoeba');

    const response = await deleteStore(
      request(`/api/stores/${id}`, { method: 'DELETE' }),
      params(id),
    );

    expect(response.status).toBe(200);
    expect(await storeNames()).toEqual([]);
  });

  it('returns 404 for an id that does not exist', async () => {
    const response = await deleteStore(
      request(`/api/stores/${UNUSED_UUID}`, { method: 'DELETE' }),
      params(UNUSED_UUID),
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for a non-UUID id', async () => {
    const response = await deleteStore(
      request('/api/stores/nope', { method: 'DELETE' }),
      params('nope'),
    );

    expect(response.status).toBe(400);
  });

  it('refuses to delete a store referenced by a record, with 409 IN_USE', async () => {
    const storeId = await insertStore('Amoeba');
    const artistId = await insertArtist('Black Flag');
    await db.execute(
      sql`INSERT INTO records (artist_id, store_id, title) VALUES (${artistId}, ${storeId}, 'Damaged')`,
    );

    const response = await deleteStore(
      request(`/api/stores/${storeId}`, { method: 'DELETE' }),
      params(storeId),
    );

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('IN_USE');
    expect(body.error.referenceCount).toBe(1);
    expect(await storeNames()).toEqual(['Amoeba']);
  });

  it('reports the true reference count, not a placeholder', async () => {
    const storeId = await insertStore('Amoeba');
    const artistId = await insertArtist('Minutemen');
    for (const title of ['Double Nickels', 'What Makes a Man', '3-Way Tie']) {
      await db.execute(
        sql`INSERT INTO records (artist_id, store_id, title) VALUES (${artistId}, ${storeId}, ${title})`,
      );
    }

    const response = await deleteStore(
      request(`/api/stores/${storeId}`, { method: 'DELETE' }),
      params(storeId),
    );

    expect((await response.json()).error.referenceCount).toBe(3);
  });

  it('returns 409, not 500, when a reference appears after the count', async () => {
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const queries = await import('@/lib/db/queries/stores');
    const storeId = await insertStore('Amoeba');
    const artistId = await insertArtist('Descendents');

    const hook = vi.spyOn(queries, 'countStoreReferences').mockImplementation(async () => {
      await db.execute(
        sql`INSERT INTO records (artist_id, store_id, title) VALUES (${artistId}, ${storeId}, 'Milo Goes to College')`,
      );
      return 0;
    });

    try {
      const response = await deleteStore(
        request(`/api/stores/${storeId}`, { method: 'DELETE' }),
        params(storeId),
      );

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('IN_USE');
      expect(body.error.referenceCount).toBe(1);
    } finally {
      hook.mockRestore();
    }

    expect(await storeNames()).toEqual(['Amoeba']);
    expect(spy).not.toHaveBeenCalled();
  });
});
