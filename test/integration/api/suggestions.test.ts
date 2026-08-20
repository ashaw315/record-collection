import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET } from '@/app/api/suggestions/route';
import { artists, artistInfluences, records } from '@/db/schema';

/**
 * SPEC.md §5.8: `GET /api/suggestions` — "Relationship-based suggestions, §9.1.
 * Query: `limit` (default 10)."
 *
 * **No auth stanza here, deliberately.** `routeAuthMode` returns `'session'` for
 * any path outside two hardcoded sets, so asserting it for this path restates a
 * default rather than testing this endpoint — 18 such stanzas were removed after
 * a mutation pass showed `routes.test.ts` and `middleware.test.ts` catch a
 * blanket-public mutation 36 times between them. Re-adding one here would
 * reintroduce exactly what that pass deleted.
 *
 * **No not-found case, deliberately.** §5.8 defines no id parameter: the
 * endpoint describes the whole collection, so there is no entity to miss. The
 * fourth case that earns its place instead is the EMPTY result, below.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedOneCandidate() {
  const [owned] = await db.insert(artists).values({ name: 'Discharge' }).returning();
  const [candidate] = await db.insert(artists).values({ name: 'Anti-Cimex' }).returning();
  await db.insert(records).values({ title: 'Why', artistId: owned.id });
  await db.insert(artistInfluences).values({
    sourceArtistId: candidate.id,
    targetArtistId: owned.id,
    strength: 4,
  });
  return { owned, candidate };
}

const call = (url: string) => GET(new Request(url), { params: Promise.resolve({}) });

describe('GET /api/suggestions', () => {
  /**
   * Fails against: a route that does not exist, does not return 200, or returns
   * a shape without the score and reasons §9.1 requires.
   */
  it('returns scored suggestions with their reasons (happy path)', async () => {
    const { candidate } = await seedOneCandidate();

    const response = await call('http://localhost/api/suggestions');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      artistId: candidate.id,
      artistName: 'Anti-Cimex',
      score: 8,
    });
    expect(body.data[0].reasons).toEqual(['Linked to 1 artist you own']);
  });

  /**
   * Fails against: a route ignoring `limit`, or defaulting to something other
   * than §5.8's 10.
   *
   * Eleven candidates so the default actually cuts — with ten or fewer, a
   * missing limit and a limit of 10 return the same rows and the assertion
   * cannot separate them.
   */
  it('defaults to 10 results', async () => {
    const [owned] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    await db.insert(records).values({ title: 'Why', artistId: owned.id });

    for (let i = 0; i < 11; i += 1) {
      const [candidate] = await db
        .insert(artists)
        .values({ name: `Band ${String(i).padStart(2, '0')}` })
        .returning();
      await db.insert(artistInfluences).values({
        sourceArtistId: candidate.id,
        targetArtistId: owned.id,
        strength: i + 1,
      });
    }

    const body = await (await call('http://localhost/api/suggestions')).json();

    expect(body.data).toHaveLength(10);
  });

  /**
   * Fails against: a route that ignores an explicit `limit`.
   */
  it('honours an explicit limit', async () => {
    await seedOneCandidate();

    const body = await (await call('http://localhost/api/suggestions?limit=1')).json();

    expect(body.data).toHaveLength(1);
  });

  /**
   * Fails against: `Number(raw)` in place of the digit-and-safe-integer check.
   *
   * These are the values NOTES measured `z.coerce.number()` accepting and
   * silently transforming: `'5e4'` → 50000, `'0x50'` → 80, `' 1 '` → 1. A limit
   * is less dangerous than a Discogs id — it cannot fetch the wrong record — but
   * the same parser mistake produces a page size nobody asked for, and the
   * shared `parseIntegerParam` already rejects all of them. This test is what
   * stops a future author "simplifying" it to a coercion.
   */
  it.each(['0', 'abc', '1e3', '0x50', ' 1 ', '-1', '1.5', ''])(
    'rejects limit=%j with 400',
    async (raw) => {
      await seedOneCandidate();

      const response = await call(
        `http://localhost/api/suggestions?limit=${encodeURIComponent(raw)}`,
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    },
  );

  /**
   * Fails against: a route with no upper bound on `limit`.
   *
   * Unbounded, a large `limit` reaches the slice unchecked. That is harmless for
   * an in-memory slice today and would not be if this ever became a SQL LIMIT —
   * NOTES records exactly that progression for `page`, where an unbounded value
   * reached Postgres and came back as a 22P02 the client could not act on.
   * Bounded at the boundary, once.
   */
  it('rejects a limit above the maximum', async () => {
    await seedOneCandidate();

    /*
     * **201, not 99999999999999999999.** The huge value was the first version of
     * this test and it passed for the WRONG REASON: it is not a safe integer, so
     * `parseIntegerParam` rejects it before the bound is consulted. Measured —
     * deleting `|| limit > MAX_LIMIT` passed all 14 tests including this one.
     *
     * A value one past the ceiling is the only kind that reaches the bound, and
     * it is what makes this test about the bound rather than about the parser.
     */
    const response = await call('http://localhost/api/suggestions?limit=201');

    expect(response.status).toBe(400);
    expect((await response.json()).error.fieldErrors.limit).toMatch(/between 1 and 200/);
  });

  /**
   * Fails against: an off-by-one in the bound that rejects the ceiling itself.
   *
   * Paired with the test above so the boundary is pinned from both sides: one
   * asserting 201 is refused, one asserting 200 is not. Either alone is
   * satisfied by a bound off by one in the permissive direction.
   */
  it('accepts a limit at exactly the maximum', async () => {
    await seedOneCandidate();

    const response = await call('http://localhost/api/suggestions?limit=200');

    expect(response.status).toBe(200);
  });

  /**
   * Fails against: a route that 500s, returns null, or omits `data` when nothing
   * is linked.
   *
   * **The realistic case, not the edge case.** `artist_influences` is
   * hand-entered and currently holds nothing, so §9.1 rides on the shared-member
   * route alone, and a collection whose artists have had no lineup walk has
   * neither. The UI must be able to say "nothing suggested" rather than showing
   * an error — those are different facts, and an empty array is what keeps them
   * distinguishable.
   */
  it('returns an empty array, not an error, when nothing is linked', async () => {
    const [owned] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    await db.insert(records).values({ title: 'Why', artistId: owned.id });

    const response = await call('http://localhost/api/suggestions');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  /**
   * Fails against: a route passing unknown query keys through to the query
   * layer, or rejecting them.
   *
   * §5.8 defines exactly one parameter. An unknown key is ignored rather than
   * 400'd — matching the list endpoints, which accept filter keys this endpoint
   * has none of — and the test exists so that behaviour is a decision rather
   * than an accident.
   */
  it('ignores unknown query parameters', async () => {
    await seedOneCandidate();

    const response = await call('http://localhost/api/suggestions?sort=score&page=2');

    expect(response.status).toBe(200);
    expect((await response.json()).data).toHaveLength(1);
  });
});
