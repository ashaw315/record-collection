import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as versions } from '@/app/api/discogs/master/[id]/versions/route';
import * as clientModule from '@/lib/discogs/client';

/**
 * SPEC.md §5.7 `GET /api/discogs/master/:id/versions` — the drill-down.
 *
 * The properties are asserted HERE as well as in the normalizer, per the wiring
 * lesson from unit 4: making the route return raw payloads left all 24
 * normalizer tests passing and failed 5 endpoint tests. A pure-function test
 * proves the transformation, never that anything calls it.
 */

const db = getTestDb();

const VERSIONS = JSON.parse(
  readFileSync('test/fixtures/discogs/master-versions-discharge.json', 'utf8'),
) as unknown;

const MASTER = JSON.parse(
  readFileSync('test/fixtures/discogs/master-discharge-hear-nothing.json', 'utf8'),
) as unknown;

/**
 * Answers BOTH calls this endpoint makes: the versions list, and the master
 * itself for the artist name.
 *
 * Version rows carry a title and no artist — verified against the captured
 * payload — so §7.7's tiers 2 and 3 have nothing to match on without the
 * master. A mock returning the versions fixture for both would leave every
 * unowned row badgeless and the tests would agree with it.
 */
function mockDiscogs(response: unknown = VERSIONS) {
  const get = vi.fn(async (path: string) =>
    path.endsWith('/versions') ? response : MASTER,
  );

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
    // Unused here; the type requires it since the cover fetch was added.
    fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
  });

  return get;
}

const request = (query = '') =>
  new Request(`https://x.test/api/discogs/master/50683/versions${query}`);

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('identifying a pressing', () => {
  it('returns rows that distinguish the original from its reissue', async () => {
    /**
     * The reason this endpoint exists, asserted end to end. Releases 381756 and
     * 6779382 share country, label AND catalog number; only year and format
     * descriptors separate a 1982 Clay original from a 1989 reissue.
     *
     * A table that lost either field would show two identical-looking rows, and
     * CLAUDE.md §8 calls collapsing that distinction the worst bug this app can
     * ship — it is the one that costs real money in a shop.
     */
    mockDiscogs();

    const body = await (await versions(request(), params('50683'))).json();

    const original = body.data.find((v: { discogsId: number }) => v.discogsId === 381756);
    const reissue = body.data.find((v: { discogsId: number }) => v.discogsId === 6779382);

    expect(original.catalogNumber).toBe(reissue.catalogNumber);
    expect(original.year).toBe(1982);
    expect(reissue.year).toBe(1989);
    expect(original.isReissue).toBe(false);
    expect(reissue.isReissue).toBe(true);
  });

  it('carries every §10 comparison field through the endpoint', async () => {
    mockDiscogs();

    const body = await (await versions(request(), params('50683'))).json();
    const original = body.data.find((v: { discogsId: number }) => v.discogsId === 381756);

    expect(original.country).toBe('UK');
    expect(original.year).toBe(1982);
    expect(original.label).toBe('Clay Records');
    expect(original.catalogNumber).toBe('CLAY LP 3');
    expect(original.formats).toContain('LP');
    expect(original.thumbUrl).toMatch(/^https:\/\//);
  });

  it('returns normalized rows, not raw Discogs payloads', async () => {
    mockDiscogs();

    const body = await (await versions(request(), params('50683'))).json();

    for (const row of body.data) {
      expect(row).not.toHaveProperty('catno');
      expect(row).not.toHaveProperty('released');
      expect(row).toHaveProperty('catalogNumber');
    }
  });

  it('reports how many versions exist, so the user keeps looking', async () => {
    // §5.7: "Paginated." 57 versions across 3 pages. A table that showed 25
    // with no total lets the user conclude theirs is not listed.
    mockDiscogs();

    const body = await (await versions(request(), params('50683'))).json();

    expect(body.meta.total).toBe(57);
    expect(body.meta.pages).toBe(3);
    expect(body.data).toHaveLength(25);
  });
});

describe('the request', () => {
  it('asks Discogs for the master in the path', async () => {
    const get = mockDiscogs();

    await versions(request(), params('50683'));

    const [path] = get.mock.calls[0] as unknown as [string];
    expect(path).toBe('/masters/50683/versions');
  });

  it('passes the page through', async () => {
    const get = mockDiscogs();

    await versions(request('?page=2'), params('50683'));

    const [, query] = get.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(query.page).toBe(2);
  });

  it('rejects a non-numeric master id rather than asking Discogs', async () => {
    /**
     * A Discogs master id is an integer. Forwarding `../../releases/1` or a
     * bare word would build a request path from unvalidated input — the same
     * reasoning as §5.2's "reject a non-UUID with 400 rather than attempting a
     * lookup", and here it also keeps user input out of a URL we construct.
     */
    const get = mockDiscogs();

    const response = await versions(request(), params('not-a-master'));

    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a path-traversal attempt in the id', async () => {
    const get = mockDiscogs();

    const response = await versions(request(), params('50683/../../releases/1'));

    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects a negative or zero master id', async () => {
    const get = mockDiscogs();

    expect((await versions(request(), params('-1'))).status).toBe(400);
    expect((await versions(request(), params('0'))).status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ['scientific notation', '5e4', 50000],
    ['hexadecimal', '0x50', 80],
    ['a padded value', ' 50683 ', 50683],
    ['a trailing newline', '50683\n', 50683],
  ])('rejects %s rather than coercing it to a different master', async (_label, id) => {
    /**
     * `z.coerce.number()` ACCEPTS all of these — probed, not assumed:
     * "5e4" becomes 50000 and "0x50" becomes 80. Without the digit check the
     * endpoint would silently fetch a DIFFERENT master's versions and present
     * them as the answer to the request that was made.
     *
     * That is the worst available outcome for this endpoint: not an error, but
     * the wrong pressings shown as the right ones, which is the §7.7 confusion
     * arriving from a completely different direction.
     *
     * Found because a mutation removing the digit check failed nothing — the
     * original tests only sent ids that coercion rejects anyway.
     */
    const get = mockDiscogs();

    const response = await versions(request(), params(id));

    expect(response.status).toBe(400);
    expect(get, 'no Discogs call for an ambiguous id').not.toHaveBeenCalled();
  });

  it('rejects a page that is not a positive integer', async () => {
    const get = mockDiscogs();

    expect((await versions(request('?page=0'), params('50683'))).status).toBe(400);
    expect((await versions(request('?page=abc'), params('50683'))).status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });
});

describe('ownership travels with every version (§5.7)', () => {
  /**
   * §5.7: "This applies to the versions list as much as to search. The
   * drill-down is where the user chooses BETWEEN pressings, so knowing which of
   * them are already on the shelf matters more there than anywhere else — a
   * version table without ownership is a list of candidates with the answer
   * withheld."
   *
   * And this is the table where 381756 (UK 1982 Clay) and 6779382 (UK 1989
   * reissue) sit next to each other sharing CLAY LP 3. If the badge is wrong
   * anywhere, it is wrong here, in front of both rows at once.
   */
  async function ownTheOriginal() {
    const artist = await db.execute<{ id: string }>(
      sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`,
    );
    const pressing = await db.execute<{ id: string }>(
      sql`INSERT INTO pressings (discogs_release_id, catalog_number, country_pressed, year_pressed)
          VALUES (381756, 'CLAY LP 3', 'UK', 1982) RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO records (artist_id, pressing_id, title)
          VALUES (${artist.rows[0].id}, ${pressing.rows[0].id},
                  'Hear Nothing See Nothing Say Nothing')`,
    );
  }

  it('carries an ownership tier on every version row', async () => {
    mockDiscogs();

    const body = await (await versions(request(), params('50683'))).json();

    for (const row of body.data) {
      expect(row).toHaveProperty('ownership');
    }
  });

  it('marks the owned pressing and NOT the reissue beside it', async () => {
    /**
     * The single most important assertion on this screen. Both rows are UK,
     * both are Clay Records, both are CLAY LP 3. Only the year and the format
     * descriptors differ — and the user is choosing between them.
     */
    await ownTheOriginal();
    mockDiscogs();

    const body = await (await versions(request(), params('50683'))).json();

    const original = body.data.find((v: { discogsId: number }) => v.discogsId === 381756);
    const reissue = body.data.find((v: { discogsId: number }) => v.discogsId === 6779382);

    expect(original.ownership.tier).toBe('owned_exact');
    expect(reissue.ownership.tier, 'the reissue is NOT the one owned').toBe(
      'owned_different_pressing',
    );
    expect(reissue.ownership.ownedPressing.year, 'and the table says which is').toBe(1982);
  });

  it('leaves unowned versions with a null tier', async () => {
    mockDiscogs();

    const body = await (await versions(request(), params('50683'))).json();

    expect(body.data.every((v: { ownership: { tier: string | null } }) => v.ownership.tier === null)).toBe(
      true,
    );
  });
});

describe('when ownership cannot be checked', () => {
  /**
   * THE HIGHEST-STAKES ABSENCE-AS-SUCCESS INSTANCE in this project, and the
   * reason it gets its own signal rather than a log line.
   *
   * §7.7's tiers 2 and 3 match on artist, and version rows carry none — the
   * endpoint fetches the master to supply it. When that lookup fails the artist
   * is null, corroboration is impossible, and EVERY row comes back with no
   * badge.
   *
   * A version table with no badges is indistinguishable from a version table
   * where you own nothing. Someone standing in a shop reads that as "buy it",
   * and the failure mode is buying a record they already own because the app
   * quietly could not tell them.
   *
   * So the response says plainly that ownership could not be checked. An
   * absence that looks like an answer is worse than an admitted gap.
   */
  function mockVersionsOnly() {
    const get = vi.fn(async (path: string) => {
      if (path.endsWith('/versions')) return VERSIONS;
      throw new clientModule.DiscogsError('Could not reach Discogs');
    });

    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: get as unknown as clientModule.DiscogsClient['get'],
      // Unused here; the type requires it since the cover fetch was added.
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    return get;
  }

  it('still returns the version table, since the comparison is useful', async () => {
    // Degrading, not failing: the year/country/catalog comparison is the point
    // of the screen and it does not depend on the master.
    mockVersionsOnly();

    const response = await versions(request(), params('50683'));

    expect(response.status).toBe(200);
    expect((await response.json()).data.length).toBeGreaterThan(0);
  });

  it('SAYS ownership could not be checked, rather than showing an absence', async () => {
    mockVersionsOnly();

    const body = await (await versions(request(), params('50683'))).json();

    expect(body.meta.ownershipChecked, 'the screen can say so').toBe(false);
  });

  it('reports ownership as checked on the ordinary path', async () => {
    // The flag must discriminate, or it is decoration: a screen that always
    // showed the warning would be ignored within a day.
    mockDiscogs();

    const body = await (await versions(request(), params('50683'))).json();

    expect(body.meta.ownershipChecked).toBe(true);
  });

  it('does not claim ownership was checked when the master had no artist', async () => {
    /**
     * The subtler case: the master lookup SUCCEEDS but carries no artist, so
     * corroboration is still impossible. A flag keyed on "did the call throw"
     * would report checked and show nothing.
     */
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
      get: vi.fn(async (path: string) =>
        path.endsWith('/versions') ? VERSIONS : { id: 50683, artists: [] },
      ) as unknown as clientModule.DiscogsClient['get'],
    });

    const body = await (await versions(request(), params('50683'))).json();

    expect(body.meta.ownershipChecked).toBe(false);
  });
});

describe('caching', () => {
  it('does not cache version listings', async () => {
    // §6 caches release DETAIL only. A version list is a view over a master
    // that gains rows as contributors add pressings — and a stale one hides
    // exactly the pressing a user is trying to find.
    mockDiscogs();

    await versions(request(), params('50683'));

    const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM discogs_cache`);
    expect(rows.rows[0].n).toBe(0);
  });
});

describe('failures', () => {
  it('reports an unknown master as 404 rather than as our own error', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs request failed with status 404', {
          status: 404,
        });
      }) as unknown as clientModule.DiscogsClient['get'],
    });

    const response = await versions(request(), params('99999999'));

    expect(response.status).toBe(404);
  });

  it('surfaces a rate limit as 429', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs rate limit reached.', { status: 429 });
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    const response = await versions(request(), params('50683'));

    expect(response.status).toBe(429);
  });

  it('reports an unreachable Discogs as 502', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Could not reach Discogs');
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    const response = await versions(request(), params('50683'));

    expect(response.status).toBe(502);
  });
});
