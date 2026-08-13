import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { truncateAll, closeTestDb } from '../../helpers/db';
import { GET as spread } from '@/app/api/discogs/master/[id]/spread/route';
import { middlewareRuns, routeAuthMode } from '@/lib/auth/routes';
import * as clientModule from '@/lib/discogs/client';

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
  { id: 1001, catno: 'LSP-4353', country: 'US', released: '1970' },
  { id: 1002, catno: 'LSP-4353', country: 'US', released: '1970' },
  { id: 1003, catno: 'LSP-4353', country: 'UK', released: '1971' },
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

  it('is behind auth (unauthenticated)', () => {
    expect(middlewareRuns('/api/discogs/master/133514/spread')).toBe(true);
    expect(routeAuthMode('/api/discogs/master/133514/spread')).toBe('session');
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
