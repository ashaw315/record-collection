import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { POST as createPressing } from '@/app/api/pressings/route';
import { PATCH as patchPressing } from '@/app/api/pressings/[id]/route';
import * as clientModule from '@/lib/discogs/client';

/**
 * SPEC.md §7.7: "`discogsReleaseId` supplied to `POST` or `PATCH
 * /api/pressings` must be verified against the release it names before being
 * stored. The server holds the release detail and the cache; a client asserting
 * a fact the server can establish is the pattern to eliminate wherever it
 * appears."
 *
 * Found by the security review, and verified before fixing: posting a pressing
 * with `discogsReleaseId: 381756` and entirely unrelated details returned 201,
 * stored the id, and made `matchOwnership` answer `exact` for a record by "Some
 * Other Band".
 *
 * The corroboration added to tier 1 already defuses the badge. This closes the
 * other half — the database should not carry a claim the server never checked,
 * because every future reader of that row inherits it.
 */

const db = getTestDb();

const DETAILED = JSON.parse(
  readFileSync('test/fixtures/discogs/release-detailed.json', 'utf8'),
) as { id: number };

const RELEASE_ID = DETAILED.id;

function mockDiscogs(response: unknown = DETAILED) {
  const get = vi.fn(async () => response);

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
    // Unused here; the type requires it since the cover fetch was added.
    fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
  });

  return get;
}

const post = (body: unknown) =>
  createPressing(
    new Request('https://x.test/api/pressings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('POST verifies a supplied discogsReleaseId', () => {
  it('accepts an id the server can confirm exists', async () => {
    mockDiscogs();

    const response = await post({
      catalogNumber: 'CLAY LP 3',
      countryPressed: 'UK',
      yearPressed: 1982,
      discogsReleaseId: RELEASE_ID,
    });

    expect(response.status).toBe(201);
    expect((await response.json()).discogsReleaseId).toBe(RELEASE_ID);
  });

  it('REFUSES an id naming a release Discogs does not have', async () => {
    // The forgery, at the point it enters the database rather than at the badge.
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs request failed with status 404', {
          status: 404,
        });
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    const response = await post({ catalogNumber: 'FORGED', discogsReleaseId: 999000111 });

    expect(response.status).toBe(400);
  });

  it('stores nothing when verification fails', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs request failed with status 404', {
          status: 404,
        });
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    await post({ catalogNumber: 'FORGED', discogsReleaseId: 999000111 });

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM pressings`);
    expect(rows.rows[0].n, 'no row carries an unverified claim').toBe(0);
  });

  it('does not call Discogs when no id is supplied', async () => {
    /**
     * A manually entered pressing claims no release, so verification would be
     * a rate-limited call for nothing — and §10's in-store case must stay fast.
     */
    const get = mockDiscogs();

    const response = await post({ catalogNumber: 'HAND-ENTERED', countryPressed: 'UK' });

    expect(response.status).toBe(201);
    expect(get).not.toHaveBeenCalled();
  });

  it('serves verification from the cache rather than spending a call', async () => {
    // The normal path: the user just viewed this release in the form, so the
    // server already holds it. §6's cache, reused rather than re-fetched.
    await db.execute(
      sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
          VALUES (${RELEASE_ID}, ${JSON.stringify(DETAILED)}::jsonb, now())`,
    );
    const get = mockDiscogs();

    const response = await post({ catalogNumber: 'CLAY LP 3', discogsReleaseId: RELEASE_ID });

    expect(response.status).toBe(201);
    expect(get, 'the cache answered').not.toHaveBeenCalled();
  });

  it('reports an unreachable Discogs as upstream, not as a bad request', async () => {
    /**
     * The distinction matters: a 400 tells the user their input is wrong, and
     * an outage is not their fault. §5's error shape, and the same reasoning
     * the search endpoint uses for 502.
     */
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Could not reach Discogs');
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    const response = await post({ catalogNumber: 'X', discogsReleaseId: RELEASE_ID });

    expect(response.status).toBe(502);
  });
});

describe('PATCH verifies it too', () => {
  async function seedPressing(): Promise<string> {
    const rows = await db.execute<{ id: string }>(
      sql`INSERT INTO pressings (catalog_number) VALUES ('EXISTING') RETURNING id`,
    );
    return rows.rows[0].id;
  }

  const patch = (id: string, body: unknown) =>
    patchPressing(
      new Request(`https://x.test/api/pressings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );

  it('accepts a verified id', async () => {
    mockDiscogs();
    const id = await seedPressing();

    const response = await patch(id, { discogsReleaseId: RELEASE_ID });

    expect(response.status).toBe(200);
  });

  it('REFUSES an unverifiable id', async () => {
    // PATCH is the same hole as POST — closing one and not the other would
    // leave the claim reachable by a second request.
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs request failed with status 404', {
          status: 404,
        });
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });
    const id = await seedPressing();

    const response = await patch(id, { discogsReleaseId: 999000111 });

    expect(response.status).toBe(400);
  });

  it('allows CLEARING the id without verification', async () => {
    // Removing a claim needs no proof — null asserts nothing.
    const get = mockDiscogs();
    const id = await seedPressing();

    const response = await patch(id, { discogsReleaseId: null });

    expect(response.status).toBe(200);
    expect(get).not.toHaveBeenCalled();
  });
});
