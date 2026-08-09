import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as importRoute } from '@/app/api/discogs/import/route';
import * as clientModule from '@/lib/discogs/client';

/**
 * SPEC.md §5.7 `POST /api/discogs/import`, at the endpoint.
 *
 * The transactional behaviour is covered against the query-layer primitive in
 * test/integration/discogs-import.test.ts. This file covers what only the
 * endpoint decides: validation, where the payload comes from, and the §7.8
 * guarantee surviving the wiring.
 */

const db = getTestDb();

const DETAILED = JSON.parse(
  readFileSync('test/fixtures/discogs/release-detailed.json', 'utf8'),
) as { id: number };

function mockDiscogs(response: unknown = DETAILED) {
  const get = vi.fn(async () => response);

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
  });

  return get;
}

const post = (body: unknown) =>
  new Request('https://x.test/api/discogs/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('importing', () => {
  it('creates a record and returns 201', async () => {
    mockDiscogs();

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.title).toBe('Hear Nothing See Nothing Say Nothing');
  });

  it('creates a want-list item when asked for one', async () => {
    mockDiscogs();

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'want_list' }));

    expect(response.status).toBe(201);

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM want_list`);
    expect(rows.rows[0].n).toBe(1);
  });

  it('applies the user overrides over the Discogs values', async () => {
    // §5.7: the user has verified against the physical record, so their
    // corrections win. This is the whole reason import is two-stage.
    mockDiscogs();

    const created = await (
      await importRoute(
        post({
          discogsReleaseId: 381756,
          target: 'record',
          overrides: { title: 'My copy', conditionMedia: 'VG+' },
        }),
      )
    ).json();

    expect(created.title).toBe('My copy');
    expect(created.conditionMedia).toBe('VG+');
  });

  it('keeps a user-entered matrix through the endpoint on re-import', async () => {
    /**
     * §7.8 asserted at the layer a user reaches, not only at the primitive.
     * The wiring lesson from unit 4: a route that bypassed the find-or-create
     * would leave every query-layer test passing while destroying hand-typed
     * data.
     */
    mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));
    await db.execute(sql`UPDATE pressings SET matrix_runout = 'HAND READ FROM THE WAX'`);
    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    const rows = await db.execute<{ matrix_runout: string }>(
      sql`SELECT matrix_runout FROM pressings`,
    );
    expect(rows.rows[0].matrix_runout).toBe('HAND READ FROM THE WAX');
  });
});

describe('where the payload comes from', () => {
  it('re-fetches the release rather than trusting a client payload', async () => {
    /**
     * §5.7 gives the body as `{ discogsReleaseId, target, overrides }` — no
     * release payload. A client-supplied one could assert anything about a
     * pressing, and pressing identity is what §7.7's ownership distinction
     * rests on. Corrections arrive as `overrides`, which are explicit and
     * bounded.
     */
    const get = mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(get).toHaveBeenCalledTimes(1);
    const [path] = get.mock.calls[0] as unknown as [string];
    expect(path).toBe('/releases/381756');
  });

  it('rejects a release payload sent by the client', async () => {
    const response = await importRoute(
      post({ discogsReleaseId: 381756, target: 'record', release: { title: 'Anything' } }),
    );

    expect(response.status).toBe(400);
  });

  it('uses the cache rather than spending a second rate-limited call', async () => {
    // The user has just viewed this release in the form; re-fetching it burns
    // one of 60 calls a minute for a payload we already hold.
    const get = mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));
    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('validation', () => {
  it.each([
    ['a missing target', { discogsReleaseId: 381756 }],
    ['an unknown target', { discogsReleaseId: 381756, target: 'shelf' }],
    ['a missing release id', { target: 'record' }],
    ['a string release id', { discogsReleaseId: '381756', target: 'record' }],
    ['a hex-shaped release id', { discogsReleaseId: '0x50', target: 'record' }],
    ['a negative release id', { discogsReleaseId: -1, target: 'record' }],
    ['a fractional release id', { discogsReleaseId: 381756.5, target: 'record' }],
    ['an unknown override key', { discogsReleaseId: 381756, target: 'record', overrides: { colour: 'red' } }],
  ])('rejects %s', async (_label, body) => {
    const get = mockDiscogs();

    const response = await importRoute(post(body));

    expect(response.status).toBe(400);
    expect(get, 'nothing is fetched for a request that cannot be served').not.toHaveBeenCalled();
  });

  it('writes nothing when validation fails', async () => {
    await importRoute(post({ discogsReleaseId: 381756, target: 'shelf' }));

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records`);
    expect(rows.rows[0].n).toBe(0);
  });

  it('rejects malformed JSON', async () => {
    const response = await importRoute(
      new Request('https://x.test/api/discogs/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not json',
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe('failures', () => {
  it('reports an unknown release as 404 and writes nothing', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs request failed with status 404', {
          status: 404,
        });
      }) as unknown as clientModule.DiscogsClient['get'],
    });

    const response = await importRoute(post({ discogsReleaseId: 99999999, target: 'record' }));

    expect(response.status).toBe(404);

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM records`);
    expect(rows.rows[0].n).toBe(0);
  });

  it('surfaces a rate limit as 429', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs rate limit reached.', { status: 429 });
      }) as unknown as clientModule.DiscogsClient['get'],
    });

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(response.status).toBe(429);
  });
});
