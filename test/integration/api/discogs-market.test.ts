import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAll, closeTestDb } from '../../helpers/db';
import { GET as market } from '@/app/api/discogs/market/[id]/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';
import * as clientModule from '@/lib/discogs/client';
import { readCachedMarket, writeCachedMarket } from '@/lib/discogs/market-cache';

/**
 * SPEC.md §10a layers 1 and 2: `GET /api/discogs/market/:id`.
 *
 * **On demand, per release.** A search returns fifty results and search
 * payloads carry no price data, so rendering this across a page would cost up
 * to a hundred calls against a sixty-per-minute budget. Measured before the
 * endpoint was designed, and §10a is amended to say so.
 *
 * **Layer 2 degrades to absence, never to a guess.** `price_suggestions` 404s
 * without completed Discogs seller settings; the app then shows layer 1 alone
 * and says the range is unavailable. It never interpolates a ladder from the
 * floor.
 */

const STATS = JSON.parse(
  readFileSync('test/fixtures/discogs/marketplace-stats-381756.json', 'utf8'),
) as Record<string, unknown>;

const SUGGESTIONS = JSON.parse(
  readFileSync('test/fixtures/discogs/price-suggestions-381756.json', 'utf8'),
) as Record<string, unknown>;

/** Routes each Discogs path to a fixture, so one fake covers both calls. */
function mockDiscogs(options: { stats?: unknown; suggestions?: unknown | Error } = {}) {
  const get = vi.fn(async (path: string) => {
    if (path.includes('price_suggestions')) {
      const value = options.suggestions ?? SUGGESTIONS;
      if (value instanceof Error) throw value;
      return value;
    }
    if (path.includes('marketplace/stats')) {
      const value = options.stats ?? STATS;
      if (value instanceof Error) throw value;
      return value;
    }
    throw new Error(`unexpected path: ${path}`);
  });

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
    fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
  });

  return get;
}

const request = (id: string) =>
  market(new Request(`http://test/api/discogs/market/${id}`), {
    params: Promise.resolve({ id }),
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

describe('GET /api/discogs/market/:id', () => {
  it('returns both layers for a release (happy path)', async () => {
    mockDiscogs();

    const response = await request('381756');

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.numForSale).toBe(11);
    expect(body.lowestPrice).toEqual({ value: 47.28, currency: 'USD' });
    expect(body.conditions).toHaveLength(8);
    expect(body.range).toEqual({ low: 7.67, high: 145.8 });
  });

  it('requests layer 1 in USD, which is what makes the two layers agree', async () => {
    /**
     * Measured 2026-08-12: `marketplace/stats` honours `curr_abbr` while
     * `price_suggestions` ignores it and returns USD regardless — even against
     * an account set to EUR. Requesting USD is the only way the floor and the
     * ladder are in one currency, and converting between them would invent a
     * number nobody quoted.
     */
    const get = mockDiscogs();

    await request('381756');

    const statsCall = get.mock.calls.find(([path]) => String(path).includes('marketplace/stats'));
    expect(statsCall?.[0]).toContain('curr_abbr=USD');
  });

  it('shows layer 1 alone when price_suggestions 404s, and says so', async () => {
    /**
     * §10a: seller settings are required for the ladder, and without them the
     * app "shows layer 1 alone and says the range is unavailable; it never
     * interpolates one".
     */
    mockDiscogs({
      suggestions: new clientModule.DiscogsError('seller settings', { status: 404 }),
    });

    const response = await request('381756');

    expect(response.status, 'a missing ladder is not an error').toBe(200);
    const body = await response.json();

    expect(body.numForSale, 'layer 1 is unaffected').toBe(11);
    expect(body.conditions).toEqual([]);
    expect(body.range).toBeNull();
    expect(body.rangeUnavailable, 'the UI must be able to SAY why').toBe(true);
  });

  it('never derives a condition ladder from the floor', async () => {
    // The interpolation §10a forbids: `lowest_price` is one listing at an
    // unknown condition, and spreading it across grades invents six numbers.
    mockDiscogs({
      suggestions: new clientModule.DiscogsError('seller settings', { status: 404 }),
    });

    const body = await (await request('381756')).json();

    /**
     * The floor is still reported — it is layer 1 and it is real. What must NOT
     * happen is that value reappearing as a condition price.
     *
     * A first version asserted the response did not contain "47.28" at all,
     * which failed against the legitimate `lowestPrice` — an assertion so broad
     * it forbade the correct behaviour. The property is that no CONDITION
     * carries a value derived from the floor.
     */
    expect(body.lowestPrice.value, 'layer 1 survives').toBe(47.28);
    expect(body.conditions).toHaveLength(0);
    expect(body.range, 'and no range is synthesised from one number').toBeNull();
  });

  it('survives layer 1 failing while layer 2 succeeds', async () => {
    // The layers are independent (§10a). One failing must not take the other
    // down, or a transient error erases data that was fetched successfully.
    mockDiscogs({ stats: new clientModule.DiscogsError('stats down', { status: 502 }) });

    const response = await request('381756');

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.numForSale).toBeNull();
    expect(body.conditions, 'the ladder still arrived').toHaveLength(8);
  });

  it('400s on a non-numeric release id rather than requesting it', async () => {
    /**
     * The coercion class at a path boundary: `z.coerce.number()` reads '0x50'
     * as 80 and would fetch market data for a DIFFERENT release, presenting it
     * as the answer — the §7.7 confusion arriving through a URL.
     */
    const get = mockDiscogs();

    for (const id of ['abc', '0x50', '5e4', '-1', '1.5']) {
      expect((await request(id)).status, id).toBe(400);
    }

    expect(get, 'nothing may be requested for an id we cannot parse').not.toHaveBeenCalled();
  });

  it('is behind auth (unauthenticated)', () => {
    expect(middlewareRuns('/api/discogs/market/381756')).toBe(true);
    expect(routeAuthMode('/api/discogs/market/381756')).toBe('session');
  });

  it('surfaces a Discogs outage as a Discogs error, not our own', async () => {
    // Both layers failing is the case where the app genuinely knows nothing.
    mockDiscogs({
      stats: new clientModule.DiscogsError('unreachable', { status: 502 }),
      suggestions: new clientModule.DiscogsError('unreachable', { status: 502 }),
    });

    const response = await request('381756');

    expect(response.status).toBe(502);
  });

  it('never includes a marketplace link (§13)', async () => {
    // §13 and CLAUDE.md §8: this app never sells anything. The range is
    // information; the purchase is not its business.
    mockDiscogs();

    const body = JSON.stringify(await (await request('381756')).json());

    expect(body).not.toMatch(/marketplace\/(sell|item|buy)/i);
    expect(body).not.toContain('discogs.com/sell');
  });
});

describe('the market cache (§10a, "Where it is cached")', () => {
  /**
   * **What makes layer 3 affordable.** The spread costs one call per version —
   * eleven for a single master — and without a cache every expand pays it
   * again. These tests assert the CALL COUNT, not just the response body: a
   * cache that returns the right figures while still hitting Discogs has not
   * done the thing it exists for.
   */

  it('does not call Discogs a second time for the same release', async () => {
    const get = mockDiscogs();

    const first = await (await request('381756')).json();
    const callsAfterFirst = get.mock.calls.length;

    const second = await (await request('381756')).json();

    expect(get.mock.calls.length, 'served from cache').toBe(callsAfterFirst);
    expect(second).toEqual(first);
  });

  it('still calls Discogs for a DIFFERENT release', async () => {
    // Guards the obvious cache bug: a hit keyed on nothing, serving one
    // release's prices for every release.
    const get = mockDiscogs();

    await request('381756');
    const callsAfterFirst = get.mock.calls.length;

    await request('249504');

    expect(get.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });

  it('re-fetches once the entry is older than 7 days', async () => {
    /**
     * Written directly at 8 days, because the route's own clock cannot be
     * moved from here. A stale entry must read as a miss and be refreshed.
     */
    const get = mockDiscogs();
    const EIGHT_DAYS = 8 * 24 * 60 * 60 * 1000;

    await writeCachedMarket(381756, { forSale: 99 }, () => Date.now() - EIGHT_DAYS);

    const body = await (await request('381756')).json();

    expect(get, 'a stale entry is a miss').toHaveBeenCalled();
    expect(body.forSale, 'the refreshed figures, not the stale ones').not.toBe(99);
  });

  it('serves a fresh cached entry without asking Discogs at all', async () => {
    const get = mockDiscogs();

    await writeCachedMarket(381756, { forSale: 7, conditions: [], rangeUnavailable: true });

    const body = await (await request('381756')).json();

    expect(get, 'nothing fresh needs fetching').not.toHaveBeenCalled();
    expect(body.forSale).toBe(7);
  });

  it('does not cache a response when Discogs was unreachable', async () => {
    /**
     * The dangerous write. If a total failure were cached, the app would serve
     * "nothing for sale" for seven days after a one-minute outage — absence
     * recorded as fact, which is §10a's central prohibition.
     */
    const unreachable = new clientModule.DiscogsError('unreachable', { status: 502 });
    mockDiscogs({ stats: unreachable, suggestions: unreachable });

    expect((await request('381756')).status).toBe(502);

    expect(
      await readCachedMarket(381756),
      'a failure must not be stored as an answer',
    ).toBeNull();
  });

  it('treats a floor-only row from the spread as a MISS, not a complete answer', async () => {
    /**
     * **The two writers store different amounts of truth.** The spread fetches
     * only `marketplace/stats` (the floor) — never `price_suggestions` — so its
     * rows carry no condition ladder. Serving one here as a complete market
     * answer would render "no ladder available" for seven days for a release
     * layer 2 was never asked about: absence recorded as fact, which is exactly
     * what §10a forbids.
     */
    const get = mockDiscogs();

    await writeCachedMarket(381756, {
      layersFetched: ['floor'],
      lowestPrice: { value: 20, currency: 'USD' },
    });

    const body = await (await request('381756')).json();

    expect(get, 'a floor-only row cannot answer a full market request').toHaveBeenCalled();
    expect(body.conditions.length, 'the ladder is fetched, not assumed empty').toBeGreaterThan(0);
  });
});
