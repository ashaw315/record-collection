import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAll, closeTestDb } from '../../helpers/db';
import { GET as spread } from '@/app/api/discogs/master/[id]/spread/route';
import * as clientModule from '@/lib/discogs/client';
import { readCachedMarket, writeCachedMarket } from '@/lib/discogs/market-cache';
import { GET as market } from '@/app/api/discogs/market/[id]/route';

/**
 * SPEC.md §10a layer 3 — the version spread.
 *
 * **The cost is the design.** One call per version: eleven for the Hot Tuna
 * master, a fifth of a 60/minute budget on a single expand. Two expands in
 * quick succession, or one while a search resolves market panels, and this
 * contends with everything else on the page.
 *
 * So: fetch on expand only, stop when the budget says stop, and report a
 * partial spread AS partial. §10a — "later layers degrade to absence, never to
 * a guess."
 */

const VERSIONS = [
  { id: 1001, catno: 'LSP-4353', country: 'US', released: '1970', major_formats: ['Vinyl'] },
  { id: 1002, catno: 'LSP-4353', country: 'US', released: '1970', major_formats: ['Vinyl'] },
  { id: 1003, catno: 'LSP-4353', country: 'UK', released: '1971', major_formats: ['Vinyl'] },
];

/** Routes versions and per-release stats to fixtures; `fail` marks the exhaustion point. */
function mockDiscogs(options: { prices?: Record<number, number | null>; failAfter?: number } = {}) {
  let statsCalls = 0;

  const get = vi.fn(async (path: string) => {
    if (path.includes('/versions')) {
      return { versions: VERSIONS, pagination: { items: VERSIONS.length, pages: 1 } };
    }

    if (path.includes('marketplace/stats')) {
      statsCalls += 1;
      if (options.failAfter !== undefined && statsCalls > options.failAfter) {
        // What the client throws when the reservation exceeds its deadline.
        throw new clientModule.DiscogsError('rate limited', { status: 429 });
      }

      const id = Number(/stats\/(\d+)/.exec(path)?.[1]);
      const price = options.prices?.[id];
      return {
        num_for_sale: price === null || price === undefined ? 0 : 3,
        lowest_price: price === null || price === undefined ? null : { value: price, currency: 'USD' },
      };
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
  spread(new Request(`http://test/api/discogs/master/${id}/spread`), {
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

describe('GET /api/discogs/master/:id/spread', () => {
  it('reports the range across every version (happy path)', async () => {
    mockDiscogs({ prices: { 1001: 8, 1002: 45, 1003: 400 } });

    const response = await request('133514');

    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.range).toEqual({ low: 8, high: 400 });
    expect(body.partial).toBe(false);
    expect(body.verdict).toBe('pressing-matters');
  });

  it('costs one call per version, and no more', async () => {
    /**
     * The budget arithmetic made into an assertion. Three versions must be
     * three stats calls plus one for the version list — a fetch that
     * double-counted would quietly double the cost of every expand.
     */
    const get = mockDiscogs({ prices: { 1001: 8, 1002: 45, 1003: 400 } });

    await request('133514');

    const statsCalls = get.mock.calls.filter(([path]) =>
      String(path).includes('marketplace/stats'),
    );
    expect(statsCalls).toHaveLength(3);
  });

  it('stops when the budget is exhausted and says the answer is PARTIAL', async () => {
    /**
     * THE case this endpoint is shaped around. The rate limiter refuses the
     * third call; two versions were priced, and the answer says so rather than
     * presenting a two-version range as the master's full spread.
     */
    mockDiscogs({ prices: { 1001: 8, 1002: 45, 1003: 400 }, failAfter: 2 });

    const response = await request('133514');

    expect(response.status, 'a partial answer is still an answer').toBe(200);
    const body = await response.json();

    expect(body.partial).toBe(true);
    expect(body.checked).toBe(2);
    expect(body.total).toBe(3);
    expect(body.text).toContain('2 of 3');
  });

  it('withholds the verdict on a partial spread', async () => {
    /**
     * The unchecked version is the £400 one — exactly the case where a verdict
     * from the sample reverses. A range may be honestly partial; a conclusion
     * may not.
     */
    mockDiscogs({ prices: { 1001: 8, 1002: 10, 1003: 400 }, failAfter: 2 });

    const body = await (await request('133514')).json();

    expect(body.partial).toBe(true);
    expect(body.verdict, 'a conclusion from part of the evidence is a guess').toBeNull();
  });

  it('stops calling once the budget refuses — it does not retry every version', async () => {
    // A limiter that has said no will say no again; hammering it wastes the
    // remaining budget and delays the answer the user is waiting for.
    const get = mockDiscogs({ prices: { 1001: 8, 1002: 45, 1003: 400 }, failAfter: 1 });

    await request('133514');

    const statsCalls = get.mock.calls.filter(([path]) =>
      String(path).includes('marketplace/stats'),
    );
    expect(statsCalls.length, 'one success, one refusal, then stop').toBeLessThanOrEqual(2);
  });

  it('400s on a non-numeric master id rather than requesting it', async () => {
    const get = mockDiscogs();

    for (const id of ['abc', '0x50', '5e4']) {
      expect((await request(id)).status, id).toBe(400);
    }

    expect(get).not.toHaveBeenCalled();
  });

  it('surfaces a failed version list as a Discogs error', async () => {
    // Without the version list there is nothing to price, which is different
    // from a spread that could not be completed.
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('unreachable', { status: 502 });
      }) as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    expect((await request('133514')).status).toBe(502);
  });
});

describe('the market cache (§10a, "Where it is cached")', () => {
  /**
   * **This is the layer the cache was specified for.** The spread costs one
   * call per version — eleven for the Hot Tuna master, a fifth of the
   * per-minute budget — and §10a: "a second expand of the same master is free,
   * and versions already seen through search or a previous expand are free the
   * first time."
   */

  it('a second expand of the same master costs no Discogs calls', async () => {
    const get = mockDiscogs({ prices: { 1001: 8, 1002: 45, 1003: 400 } });

    const first = await (await request('133514')).json();

    const statsCalls = () =>
      get.mock.calls.filter(([path]) => String(path).includes('marketplace/stats')).length;
    expect(statsCalls(), 'one per version the first time').toBe(3);

    const second = await (await request('133514')).json();

    expect(statsCalls(), 'the second expand is free').toBe(3);
    expect(second.range, 'and gives the same answer').toEqual(first.range);
  });

  it('prices only the versions not already cached', async () => {
    /**
     * The partial-hit case, and the one that pays off in normal use: a version
     * seen through an earlier expand or a record-detail panel is already
     * priced, so only the rest cost anything.
     */
    await writeCachedMarket(1002, { lowestPrice: { value: 45, currency: 'USD' } });

    const get = mockDiscogs({ prices: { 1001: 8, 1003: 400 } });

    const body = await (await request('133514')).json();

    const statsCalls = get.mock.calls.filter(([path]) =>
      String(path).includes('marketplace/stats'),
    );
    expect(statsCalls, 'two fetched, one served from cache').toHaveLength(2);

    // The cached version still counts toward the answer.
    expect(body.checked).toBe(3);
    expect(body.range).toEqual({ low: 8, high: 400 });
  });

  it('stores each version it priced, so a later master sharing it is cheaper', async () => {
    mockDiscogs({ prices: { 1001: 8, 1002: 45, 1003: 400 } });

    await request('133514');

    expect(await readCachedMarket(1001)).not.toBeNull();
    expect(await readCachedMarket(1003)).not.toBeNull();
  });

  it('does not cache a version the limiter refused', async () => {
    /**
     * A refusal is not a price. Caching it would record "nothing for sale" for
     * seven days because the budget ran out once — the absent-versus-unknown
     * failure, persisted.
     */
    mockDiscogs({ prices: { 1001: 8, 1002: 45, 1003: 400 }, failAfter: 1 });

    await request('133514');

    expect(await readCachedMarket(1002), 'a refusal is not an answer').toBeNull();
    expect(await readCachedMarket(1003)).toBeNull();
  });

  it('leaves rows the MARKET endpoint will refetch, rather than a hollow ladder', async () => {
    /**
     * **The two routes tested against each other, not against my idea of each
     * other.** A mutation that mislabelled the spread's floor-only rows as
     * carrying both layers survived every test here — because each route's
     * tests wrote their own fixture rows and never read the other's.
     *
     * The spread fetches only `marketplace/stats`. If it claims the ladder too,
     * the market panel serves an empty condition ladder as a cached fact for
     * seven days for a release layer 2 was never asked about.
     */
    mockDiscogs({ prices: { 1001: 8, 1002: 45, 1003: 400 } });

    await request('133514');
    vi.restoreAllMocks();

    // A real market request for a version the spread just priced.
    const marketGet = vi.fn(async (path: string) => {
      if (path.includes('price_suggestions')) {
        return { 'Very Good Plus (VG+)': { value: 30, currency: 'USD' } };
      }
      return { num_for_sale: 3, lowest_price: { value: 8, currency: 'USD' } };
    });
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: marketGet as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    const body = await (
      await market(new Request('http://test/api/discogs/market/1001'), {
        params: Promise.resolve({ id: '1001' }),
      })
    ).json();

    expect(marketGet, "the spread's row cannot answer a ladder request").toHaveBeenCalled();
    expect(body.conditions.length, 'a real ladder, not a cached emptiness').toBeGreaterThan(0);
  });
});

describe('format family and per-version prices (§10a, QA round 2)', () => {
  /**
   * Two QA findings, both about the spread being unactionable.
   *
   * 1. The verdict says "which pressing you get matters" over a table with no
   *    prices in it — the user learns the answer varies and has no way to act.
   *    The per-version prices are already fetched to compute the spread and
   *    were then discarded.
   * 2. The Carpenters master priced 8-track cartridges and cassettes beside
   *    LPs, so the spread measured FORMAT rather than pressing.
   */

  function mockMixedFormats(prices: Record<number, number | null>) {
    const versions = [
      { id: 2001, catno: 'SP-3502', country: 'UK', released: '1971', major_formats: ['Vinyl'] },
      {
        id: 2002,
        catno: 'SP-3502',
        country: 'US',
        released: '1971',
        major_formats: ['8-Track Cartridge'],
      },
      { id: 2003, catno: 'SP-3502', country: 'US', released: '1971', major_formats: ['Cassette'] },
      { id: 2004, catno: 'OLE-009', country: 'South Korea', released: '1971', major_formats: ['Vinyl'] },
    ];

    const get = vi.fn(async (path: string) => {
      if (path.includes('/versions')) {
        return { versions, pagination: { items: versions.length, pages: 1 } };
      }
      if (path.includes('marketplace/stats')) {
        const id = Number(/stats\/(\d+)/.exec(path)?.[1]);
        const price = prices[id];
        return {
          num_for_sale: price === null || price === undefined ? 0 : 2,
          lowest_price: price === null || price === undefined ? null : { value: price, currency: 'USD' },
        };
      }
      throw new Error(`unexpected path: ${path}`);
    });

    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: get as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    return get;
  }

  const requestFor = (id: string, format: string) =>
    spread(new Request(`http://test/api/discogs/master/${id}/spread?format=${format}`), {
      params: Promise.resolve({ id }),
    });

  it('filters BEFORE the cap, so the budget buys comparable versions', async () => {
    /**
     * **The mutation-resistant version of the budget claim.** With a sample
     * smaller than MAX_VERSIONS_PRICED, cap-before-filter and filter-before-cap
     * produce identical results — a four-version fixture cannot tell them
     * apart, and a mutation swapping the order passed against one.
     *
     * So: 20 versions, alternating vinyl and cassette, against a cap of 15.
     *   - filter first  -> 10 vinyl available, all 10 priced
     *   - cap first     -> first 15 taken, of which 8 are vinyl
     *
     * The difference is the two vinyl pressings a user would never see priced,
     * and the calls spent on cassettes to lose them.
     */
    const versions = Array.from({ length: 20 }, (_, index) => ({
      id: 3000 + index,
      catno: `CAT-${index}`,
      country: 'US',
      released: '1971',
      major_formats: [index % 2 === 0 ? 'Vinyl' : 'Cassette'],
    }));

    const get = vi.fn(async (path: string) => {
      if (path.includes('/versions')) {
        return { versions, pagination: { items: versions.length, pages: 1 } };
      }
      if (path.includes('marketplace/stats')) {
        return { num_for_sale: 1, lowest_price: { value: 10, currency: 'USD' } };
      }
      throw new Error(`unexpected path: ${path}`);
    });
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: get as unknown as clientModule.DiscogsClient['get'],
      fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
    });

    const body = await (await requestFor('84975', 'Vinyl')).json();

    const pricedIds = get.mock.calls
      .map(([path]) => /stats\/(\d+)/.exec(String(path))?.[1])
      .filter((id): id is string => id !== undefined);

    expect(pricedIds, 'every vinyl version, no cassettes').toHaveLength(10);
    expect(pricedIds.every((id) => Number(id) % 2 === 0), 'no cassette was priced').toBe(true);
    expect(body.total, 'the vinyl population, not all 20').toBe(10);
    expect(body.partial, 'all 10 comparable versions checked').toBe(false);
  });

  it('never SPENDS a call on a version outside the format family', async () => {
    /**
     * The budget assertion, and the reason filtering happens BEFORE the cap:
     * the same fifteen calls must buy fifteen COMPARABLE versions rather than
     * twelve. Measured on the real Carpenters master, the first fifteen in
     * Discogs order are 12 vinyl and 3 other.
     */
    const get = mockMixedFormats({ 2001: 1.28, 2002: 30, 2003: 13.18, 2004: 40 });

    await requestFor('84975', 'Vinyl');

    const pricedIds = get.mock.calls
      .map(([path]) => /stats\/(\d+)/.exec(String(path))?.[1])
      .filter((id): id is string => id !== undefined);

    expect(pricedIds, 'only the two vinyl versions').toEqual(['2001', '2004']);
  });

  it('excludes other media from the range', async () => {
    // The 8-track at $30 sits inside the vinyl range and must not appear as a
    // pressing observation either way.
    mockMixedFormats({ 2001: 1.28, 2002: 30, 2003: 13.18, 2004: 40 });

    const body = await (await requestFor('84975', 'Vinyl')).json();

    expect(body.range).toEqual({ low: 1.28, high: 40 });
    expect(body.total, 'and the denominator counts only comparable versions').toBe(2);
  });

  it('returns the per-version prices it already fetched', async () => {
    /**
     * §10a QA: the verdict answers "does this matter", the column answers
     * "which one". Without it the user is told the answer varies and given no
     * way to act on it.
     */
    mockMixedFormats({ 2001: 1.28, 2002: 30, 2003: 13.18, 2004: 40 });

    const body = await (await requestFor('84975', 'Vinyl')).json();

    expect(body.prices, 'keyed by release id, for the table to join on').toEqual({
      '2001': 1.28,
      '2004': 40,
    });
  });

  it('reports a version with no listing as null rather than omitting it', async () => {
    // Absent-versus-unknown at the row level: "nobody is selling this" and "we
    // did not check this" must not render identically.
    mockMixedFormats({ 2001: 1.28, 2004: null });

    const body = await (await requestFor('84975', 'Vinyl')).json();

    expect(body.prices['2004'], 'checked, and nothing for sale').toBeNull();
    expect(Object.keys(body.prices)).toContain('2004');
  });

  it('prices everything when no format is given', async () => {
    // A caller that cannot say what it is looking at gets the unfiltered
    // behaviour rather than an empty spread.
    const get = mockMixedFormats({ 2001: 1.28, 2002: 30, 2003: 13.18, 2004: 40 });

    await spread(new Request('http://test/api/discogs/master/84975/spread'), {
      params: Promise.resolve({ id: '84975' }),
    });

    const statsCalls = get.mock.calls.filter(([path]) =>
      String(path).includes('marketplace/stats'),
    );
    expect(statsCalls).toHaveLength(4);
  });
});
