import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as release } from '@/app/api/discogs/release/[id]/route';
import * as clientModule from '@/lib/discogs/client';

/**
 * SPEC.md §5.7 `GET /api/discogs/release/:id`, and §6's cache.
 *
 * This is the endpoint that prefills the form, so the properties are asserted
 * here as well as in the normalizer — the wiring lesson from unit 4, where
 * returning raw payloads left all 24 normalizer tests green and failed 5
 * endpoint tests.
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
  });

  return get;
}

const request = () => new Request(`https://x.test/api/discogs/release/${RELEASE_ID}`);
const params = (id: string | number) => ({ params: Promise.resolve({ id: String(id) }) });

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('the prefill payload', () => {
  it('returns the matrix runouts, which identify the exact pressing', async () => {
    // CLAUDE.md §8: the matrix is user-authoritative and is what tells two
    // pressings apart when everything else agrees. All eight variants survive.
    mockDiscogs();

    const body = await (await release(request(), params(RELEASE_ID))).json();

    expect(body.matrixRunout).toHaveLength(8);
    expect(body.matrixRunout[0]).toContain('CLAY-LP-3-A2');
  });

  it('returns the pressing plant rather than the label', async () => {
    // Four companies on this release; only Damont pressed it. `companies[0]`
    // is Clay Records, which is the label.
    mockDiscogs();

    const body = await (await release(request(), params(RELEASE_ID))).json();

    expect(body.pressingPlant).toBe('Damont');
  });

  it('keeps genres and styles separate through the endpoint', async () => {
    // The last point before this data reaches a form the user saves.
    mockDiscogs();

    const body = await (await release(request(), params(RELEASE_ID))).json();

    expect(body.genres).toEqual(['Rock']);
    expect(body.styles).toContain('Hardcore');
    expect(body.styles).toContain('Punk');
  });

  it('returns normalized field names, not Discogs payloads', async () => {
    mockDiscogs();

    const body = await (await release(request(), params(RELEASE_ID))).json();

    expect(body).not.toHaveProperty('estimated_weight');
    expect(body).not.toHaveProperty('identifiers');
    expect(body.catalogNumber).toBe('CLAY LP 3');

    /**
     * NULL, not 230. This test asserted 230 and so encoded a defect found in
     * real use: `estimated_weight` is Discogs' guess at the weight of the
     * PACKAGE, and it was prefilling a field labelled "Weight (g)" where vinyl
     * weights are 140, 180 or 200. §5.7 says the weight comes from a format
     * descriptor "when present", and this release has none.
     */
    expect(body.vinylWeightGrams, 'a shipping estimate is not a vinyl weight').toBeNull();
  });
});

describe('caching (SPEC §6)', () => {
  it('caches the release on first fetch', async () => {
    // §6: "cache release detail responses in a discogs_cache table". Unlike a
    // search, a release is a stable description of a physical object.
    mockDiscogs();

    await release(request(), params(RELEASE_ID));

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM discogs_cache WHERE discogs_release_id = ${RELEASE_ID}`,
    );
    expect(rows.rows[0].n).toBe(1);
  });

  it('serves a second request from cache without calling Discogs', async () => {
    /**
     * The whole point: 60 requests/minute is the budget, and the version table
     * invites opening several releases in a row. A cache that stored but never
     * served would satisfy the previous test and none of the purpose.
     */
    const get = mockDiscogs();

    await release(request(), params(RELEASE_ID));
    await release(request(), params(RELEASE_ID));

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('serves the same normalized body from cache as from the network', async () => {
    // A cached path that returned the RAW payload would be a different shape
    // on the second request — the kind of bug that only appears in production,
    // once something has been fetched twice.
    mockDiscogs();

    const fresh = await (await release(request(), params(RELEASE_ID))).json();
    const cached = await (await release(request(), params(RELEASE_ID))).json();

    expect(cached).toEqual(fresh);
  });

  it('refetches when the cached entry is older than 7 days', async () => {
    // §6's freshness rule, at the endpoint. Unit 2 pins the boundary itself;
    // this asserts the endpoint consults it.
    const get = mockDiscogs();

    await release(request(), params(RELEASE_ID));

    await db.execute(
      sql`UPDATE discogs_cache SET fetched_at = now() - interval '8 days'
          WHERE discogs_release_id = ${RELEASE_ID}`,
    );

    await release(request(), params(RELEASE_ID));

    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not refetch an entry that is 6 days old', async () => {
    const get = mockDiscogs();

    await release(request(), params(RELEASE_ID));

    await db.execute(
      sql`UPDATE discogs_cache SET fetched_at = now() - interval '6 days'
          WHERE discogs_release_id = ${RELEASE_ID}`,
    );

    await release(request(), params(RELEASE_ID));

    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('the request', () => {
  it('asks Discogs for the release in the path', async () => {
    const get = mockDiscogs();

    await release(request(), params(RELEASE_ID));

    const [path] = get.mock.calls[0] as unknown as [string];
    expect(path).toBe(`/releases/${RELEASE_ID}`);
  });

  it.each([
    ['a non-numeric id', 'not-a-release'],
    ['a path traversal', '381756/../../masters/1'],
    ['scientific notation', '5e4'],
    ['hexadecimal', '0x50'],
    ['a padded value', ' 381756 '],
    ['zero', '0'],
    ['a negative id', '-1'],
  ])('rejects %s rather than fetching a different release', async (_label, id) => {
    /**
     * Same reasoning as the versions endpoint, and the same demonstrated trap:
     * `z.coerce.number()` accepts '5e4' as 50000 and '0x50' as 80, so without
     * an explicit format check this endpoint would fetch a DIFFERENT release
     * and prefill the form with it. The user would be invited to save someone
     * else's pressing.
     */
    const get = mockDiscogs();

    const response = await release(request(), params(id));

    expect(response.status).toBe(400);
    expect(get, 'no Discogs call for an ambiguous id').not.toHaveBeenCalled();
  });
});

describe('failures', () => {
  it('reports an unknown release as 404', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs request failed with status 404', {
          status: 404,
        });
      }) as unknown as clientModule.DiscogsClient['get'],
    });

    expect((await release(request(), params(99999999))).status).toBe(404);
  });

  it('surfaces a rate limit as 429', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs rate limit reached.', { status: 429 });
      }) as unknown as clientModule.DiscogsClient['get'],
    });

    expect((await release(request(), params(RELEASE_ID))).status).toBe(429);
  });

  it('does not cache a failed fetch', async () => {
    /**
     * A 404 or an outage must not be written to the cache, or the failure
     * becomes sticky for seven days — and the cache would then serve an error
     * for a release that exists.
     */
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Could not reach Discogs');
      }) as unknown as clientModule.DiscogsClient['get'],
    });

    await release(request(), params(RELEASE_ID));

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM discogs_cache`);
    expect(rows.rows[0].n).toBe(0);
  });
});
