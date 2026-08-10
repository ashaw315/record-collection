import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as search } from '@/app/api/discogs/search/route';
import * as clientModule from '@/lib/discogs/client';
import { logger } from '@/lib/logger';

/**
 * SPEC.md §5.7 `GET /api/discogs/search`.
 *
 * The Discogs client is MOCKED at the module boundary (CLAUDE.md §2: never a
 * live external call, "not even 'just once to check'"), and the responses come
 * from the captured fixtures so the endpoint is exercised against payloads
 * Discogs actually sent.
 *
 * **Absence-prose is asserted HERE as well as in the normalizer**, deliberately.
 * `normalize-search.test.ts` covers pure functions; a wiring change that
 * returned raw results would leave every one of those tests passing while a
 * user saw a record pressed in a country called "Unknown". This is the layer
 * where a regression reaches someone.
 */

const db = getTestDb();

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8'));

const BY_CATNO = fixture('search-by-catno');
const BY_ARTIST = fixture('search-by-artist-only');

/**
 * Captures what the endpoint asked Discogs for, and answers with a fixture.
 *
 * The cast is at the mock, not on the client: `get` is generic (`get<T>`) so
 * callers can name the payload type they expect, and a mock returning
 * `unknown` cannot satisfy that signature. Loosening the real type to suit a
 * test would be the wrong direction — the generic is what keeps route handlers
 * from treating a payload as `any`.
 */
function mockDiscogs(response: unknown = BY_CATNO) {
  const get = vi.fn(async () => response);

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
  });

  return get;
}

function request(query: string): Request {
  return new Request(`https://x.test/api/discogs/search${query}`);
}

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('at least one parameter is required', () => {
  /**
   * §5.7: "At least one must be present."
   *
   * A bare request is REJECTED rather than answered with an unfiltered search.
   * The captured artist-only fixture reports 920 results and the live API
   * returned 5,315 for a broader query — a no-params search is that problem as
   * an API defect: it burns a rate-limited call to return something nobody can
   * use, and it reads to the client as a working search.
   */
  it('rejects a request with no parameters at all', async () => {
    const get = mockDiscogs();

    const response = await search(request(''));

    expect(response.status).toBe(400);
    expect(get, 'no Discogs call is made for a request that cannot be served').not.toHaveBeenCalled();
  });

  it('says what is wrong rather than returning an empty result set', async () => {
    // An empty `data: []` would read as "Discogs has nothing", the
    // absence-as-success shape — the caller cannot tell it from a real miss.
    const response = await search(request(''));
    const body = await response.json();

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toMatch(/at least one/i);
    expect(body).not.toHaveProperty('data');
  });

  it('rejects a request whose only parameters are blank', async () => {
    // `?artist=&catno=` is present-but-empty. Treating that as "one param was
    // supplied" is the empty-string coercion trap from NOTES, in query form:
    // it would send Discogs an empty filter and return the whole database.
    const get = mockDiscogs();

    const response = await search(request('?artist=&catno='));

    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('accepts a single parameter', async () => {
    const get = mockDiscogs();

    const response = await search(request('?catno=CLAY+LP+3'));

    expect(response.status).toBe(200);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('the §5.7 parameter mapping', () => {
  /**
   * Every param maps one-to-one onto a Discogs search parameter. Asserted by
   * name rather than in bulk: a mapping that silently dropped `catno` would
   * still return results — Discogs answers a broader query happily — so the
   * failure is a search that quietly ignores the most identifying thing the
   * user typed.
   */
  it.each([
    ['artist', 'Discharge', 'artist'],
    ['title', 'Hear Nothing', 'release_title'],
    ['label', 'Clay', 'label'],
    ['catno', 'CLAY LP 3', 'catno'],
    ['barcode', '5013929100121', 'barcode'],
    ['country', 'UK', 'country'],
    ['year', '1982', 'year'],
    ['format', 'Vinyl', 'format'],
    ['genre', 'Rock', 'genre'],
    ['style', 'Hardcore', 'style'],
    ['track', 'The Nightmare Continues', 'track'],
    ['q', 'discharge', 'q'],
  ])('maps ?%s to Discogs %s', async (ours, value, theirs) => {
    const get = mockDiscogs();

    await search(request(`?${ours}=${encodeURIComponent(value)}`));

    const [, params] = get.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params[theirs]).toBe(value);
  });

  it('sends the catalog number as catno, which is what pins down a pressing', async () => {
    // §5.7 calls this "the single most effective way to pin down a specific
    // pressing". Worth its own assertion rather than trusting the table above.
    const get = mockDiscogs();

    await search(request('?artist=Discharge&catno=CLAY+LP+3'));

    const [, params] = get.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params.catno).toBe('CLAY LP 3');
    expect(params.artist).toBe('Discharge');
  });

  it('defaults type to release', async () => {
    // §5.7: "`type`: release | master. Default `release`."
    const get = mockDiscogs();

    await search(request('?artist=Discharge'));

    const [, params] = get.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params.type).toBe('release');
  });

  it('accepts type=master', async () => {
    const get = mockDiscogs();

    await search(request('?artist=Discharge&type=master'));

    const [, params] = get.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params.type).toBe('master');
  });

  it('rejects a type that is neither, rather than passing it through', async () => {
    const get = mockDiscogs();

    const response = await search(request('?artist=Discharge&type=bootleg'));

    expect(response.status).toBe(400);
    expect(get).not.toHaveBeenCalled();
  });

  it('rejects an unknown parameter rather than ignoring it', async () => {
    /**
     * CLAUDE.md §6: "Validate every route input with Zod at the boundary.
     * Reject unknown keys." A typo'd `?catalog=` silently ignored returns a
     * broad search that looks like a narrow one — the user believes they
     * filtered and they did not.
     */
    const response = await search(request('?artist=Discharge&catalog=CLAY+LP+3'));

    expect(response.status).toBe(400);
  });

  it('does not send parameters the caller omitted', async () => {
    // An absent param must not arrive as an empty filter — the client drops
    // empties, and this asserts the endpoint does not manufacture them.
    const get = mockDiscogs();

    await search(request('?catno=CLAY+LP+3'));

    const [, params] = get.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(params.artist).toBeUndefined();
    expect(params.barcode).toBeUndefined();
  });
});

describe('the response', () => {
  it('returns normalized results, not raw Discogs payloads', async () => {
    // §5.7: "Returns normalized results, not raw Discogs payloads."
    mockDiscogs(BY_CATNO);

    const body = await (await search(request('?catno=CLAY+LP+3'))).json();

    expect(body.data.length).toBeGreaterThan(0);
    for (const result of body.data) {
      expect(result, 'Discogs field names must not leak').not.toHaveProperty('catno');
      expect(result).toHaveProperty('catalogNumber');
      expect(result).toHaveProperty('discogsId');
    }
  });

  it('splits artist from title, so a card does not show the artist twice', async () => {
    mockDiscogs(BY_CATNO);

    const body = await (await search(request('?catno=CLAY+LP+3'))).json();
    const first = body.data.find((r: { discogsId: number }) => r.discogsId === 381756);

    expect(first.artist).toBe('Discharge');
    expect(first.title).toBe('Hear Nothing See Nothing Say Nothing');
  });

  it('keeps the specific styles through the endpoint, not just the normalizer', async () => {
    /**
     * CLAUDE.md §8 asserted at the layer a user reaches. The normalizer's own
     * test covers a pure function; this covers the wiring, and a route that
     * returned raw results would pass that test and fail this one.
     */
    mockDiscogs(BY_CATNO);

    const body = await (await search(request('?catno=CLAY+LP+3'))).json();
    const first = body.data.find((r: { discogsId: number }) => r.discogsId === 381756);

    expect(first.styles).toContain('Hardcore');
    expect(first.styles).toContain('Punk');
    expect(first.genres).toEqual(['Rock']);
  });

  it('normalizes absence-prose through the endpoint', async () => {
    /**
     * The finding from unit 3, asserted where it would actually reach a user:
     * Discogs sends `country: "Unknown"`, `catno: "none"` and
     * `label: ["Not On Label"]` as real values. Passed through, the UI shows a
     * record pressed in a country called Unknown — fabricated data that looks
     * entered rather than missing.
     */
    mockDiscogs({
      pagination: { items: 1, page: 1, per_page: 50 },
      results: [
        {
          id: 31178126,
          type: 'release',
          title: 'Discharge - Untitled',
          country: 'Unknown',
          catno: 'none',
          label: ['Not On Label'],
        },
      ],
    });

    const body = await (await search(request('?artist=Discharge'))).json();

    expect(body.data[0].country).toBeNull();
    expect(body.data[0].catalogNumber).toBeNull();
    expect(body.data[0].label).toBeNull();
  });

  it('reports the total, so the caller knows to narrow rather than scroll', async () => {
    // §5.7's meta. 920 results for a bare artist query is the number that
    // justifies the structured form.
    mockDiscogs(BY_ARTIST);

    const body = await (await search(request('?artist=Discharge'))).json();

    expect(body.meta.total).toBe(920);
    expect(body.meta.page).toBe(1);
  });
});

describe('ownership travels with every result (§5.7)', () => {
  /**
   * §5.7: "It is part of the result, not a second request. A card that renders
   * and acquires its badge a moment later is the worst version of this on the
   * one screen where a wrong glance costs money — someone looking during the
   * gap sees no warning at all."
   */
  it('carries an ownership tier on every result', async () => {
    mockDiscogs(BY_CATNO);

    const body = await (await search(request('?catno=CLAY+LP+3'))).json();

    for (const result of body.data) {
      expect(result, 'every card can render its badge from its own data').toHaveProperty(
        'ownership',
      );
    }
  });

  it('reports owned_exact for a pressing already on the shelf', async () => {
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

    mockDiscogs(BY_CATNO);
    const body = await (await search(request('?catno=CLAY+LP+3'))).json();

    const owned = body.data.find((r: { discogsId: number }) => r.discogsId === 381756);
    expect(owned.ownership.tier).toBe('owned_exact');
  });

  it('reports owned_different_pressing, naming the copy at home', async () => {
    /**
     * The tier that matters, end to end. The user owns the 1982 original; the
     * page also lists 1989 and 1991 reissues sharing its catalog number.
     * Reporting owned_exact on those is what makes someone put back a record
     * they wanted.
     */
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

    mockDiscogs(BY_CATNO);
    const body = await (await search(request('?catno=CLAY+LP+3'))).json();

    const reissue = body.data.find((r: { discogsId: number }) => r.discogsId === 6779382);
    expect(reissue.ownership.tier, 'a DIFFERENT pressing, not this one').toBe(
      'owned_different_pressing',
    );
    expect(reissue.ownership.ownedPressing.year, 'and it names which').toBe(1982);
    expect(reissue.ownership.ownedPressing.catalogNumber).toBe('CLAY LP 3');
  });

  it('reports a null tier for results the user has never seen', async () => {
    // §7.7: "No match: no badge." A string tier would be truthy on the client
    // and badge every unowned row.
    mockDiscogs(BY_CATNO);

    const body = await (await search(request('?catno=CLAY+LP+3'))).json();

    expect(body.data[0].ownership.tier).toBeNull();
  });

  it('gives different results different tiers on one page', async () => {
    // A batch resolver that computed one answer and applied it to the page
    // would pass every test above — a real page is mostly the same album in
    // different pressings, which is where a uniform answer looks plausible.
    const artist = await db.execute<{ id: string }>(
      sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`,
    );
    const pressing = await db.execute<{ id: string }>(
      sql`INSERT INTO pressings (discogs_release_id) VALUES (381756) RETURNING id`,
    );
    await db.execute(
      sql`INSERT INTO records (artist_id, pressing_id, title)
          VALUES (${artist.rows[0].id}, ${pressing.rows[0].id},
                  'Hear Nothing See Nothing Say Nothing')`,
    );

    mockDiscogs(BY_CATNO);
    const body = await (await search(request('?catno=CLAY+LP+3'))).json();

    const tiers = new Set(body.data.map((r: { ownership: { tier: string | null } }) => r.ownership.tier));
    expect(tiers.size, 'the page is not uniform').toBeGreaterThan(1);
  });
});

describe('a malformed row from Discogs', () => {
  /**
   * §5.7: Discogs is contributor-submitted and imperfect. A row we cannot parse
   * used to throw a ZodError out of the normalizer, which `withErrorHandling`
   * turned into a 500 — our bug reported for their malformation, with one bad
   * row taking down a page of good ones.
   */
  it('returns the good rows rather than failing the page', async () => {
    mockDiscogs({
      pagination: { items: 2, page: 1, per_page: 50 },
      results: [
        { id: 1, type: 'release', title: 'Good - Row' },
        { id: 'not-a-number' },
      ],
    });

    const response = await search(request('?artist=Discharge'));

    expect(response.status, 'their malformation is not our 500').toBe(200);
    expect((await response.json()).data).toHaveLength(1);
  });

  it('tells the CLIENT how many rows it dropped', async () => {
    /**
     * A search silently returning 47 of 50 is a quieter version of the same
     * problem: on the lookup screen a missing result reads as "Discogs does not
     * have it" rather than "we could not parse it", and the user stops looking
     * for a record that exists.
     */
    mockDiscogs({
      pagination: { items: 3, page: 1, per_page: 50 },
      results: [{ id: 1, type: 'release', title: 'Good - Row' }, { id: 'bad' }, { id: {} }],
    });

    const body = await (await search(request('?artist=Discharge'))).json();

    expect(body.meta.dropped).toBe(2);
  });

  it('tells the OPERATOR too, since a partial page looks like a small one', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    mockDiscogs({
      pagination: { items: 2, page: 1, per_page: 50 },
      results: [{ id: 1, type: 'release', title: 'Good - Row' }, { id: 'bad' }],
    });

    await search(request('?artist=Discharge'));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toMatch(/dropped 1/);
  });

  it('does not log when every row parsed', async () => {
    // A line per successful search would bury the one that matters.
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    mockDiscogs(BY_CATNO);

    await search(request('?catno=CLAY+LP+3'));

    expect(warn).not.toHaveBeenCalled();
  });

  it('does not let a hostile image URL reach the client', async () => {
    // The scheme allow-list, asserted at the layer a user reaches.
    mockDiscogs({
      pagination: { items: 1, page: 1, per_page: 50 },
      results: [
        { id: 1, type: 'release', title: 'A - B', thumb: 'javascript:alert(1)',
          cover_image: 'http://evil.test/pixel.gif' },
      ],
    });

    const body = await (await search(request('?artist=Discharge'))).json();

    expect(body.data[0].thumbUrl).toBeNull();
    expect(body.data[0].coverUrl).toBeNull();
  });
});

describe('caching', () => {
  it('does NOT cache search results', async () => {
    /**
     * §6: "Search results are not cached." Deferred from unit 2, where the
     * cache module existed but no search did — asserting that a function I had
     * not written did not write a row would have proved nothing.
     *
     * A release is a stable description of a physical object; a search is a
     * question whose answer depends on what was typed. Caching searches serves
     * yesterday's answer to today's question, and the in-store flow is exactly
     * where that misleads.
     */
    mockDiscogs(BY_CATNO);

    await search(request('?catno=CLAY+LP+3'));

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM discogs_cache`,
    );
    expect(rows.rows[0].n, 'a search must leave the cache untouched').toBe(0);
  });

  it('calls Discogs again for a repeated search rather than serving a cached answer', async () => {
    const get = mockDiscogs(BY_CATNO);

    await search(request('?catno=CLAY+LP+3'));
    await search(request('?catno=CLAY+LP+3'));

    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('failures', () => {
  it('surfaces a Discogs rate limit as a 429 rather than a 500', async () => {
    /**
     * §6: "On 429… surface a clear error to the client rather than silently
     * failing." The client throws a typed DiscogsError; a handler that let it
     * reach withErrorHandling would report an internal fault for a defined,
     * temporary condition the user can act on by waiting.
     */
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs rate limit reached.', { status: 429 });
      }),
    });

    const response = await search(request('?artist=Discharge'));

    expect(response.status).toBe(429);
    expect((await response.json()).error.message).toMatch(/rate limit/i);
  });

  it('reports an upstream failure as 502 rather than as our own error', async () => {
    // Discogs being down is not a bug in this app, and a 500 would send
    // someone looking for one.
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Could not reach Discogs');
      }),
    });

    const response = await search(request('?artist=Discharge'));

    expect(response.status).toBe(502);
  });

  it('never leaks the token in an error response', async () => {
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Discogs request failed with status 401', {
          status: 401,
        });
      }),
    });

    const response = await search(request('?artist=Discharge'));
    const body = JSON.stringify(await response.json());

    expect(body).not.toMatch(/Discogs token=/);
  });
});
