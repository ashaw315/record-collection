import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { loadDiscogsPrefill } from '@/app/records/discogs-prefill';
import * as clientModule from '@/lib/discogs/client';

/**
 * FOUND IN REAL USE: the year field prefilled empty for a record Discogs dates
 * to 1971.
 *
 * The cause, established by reading the cached payload rather than guessing:
 * release 12856557 (the US Carpenters LP, `SP-3502`) carries **`year: 0` and no
 * `released` field at all**. Discogs does not record a year on that release —
 * the 1971 the user sees comes from the MASTER, which the release endpoint
 * never fetches.
 *
 * So `toYear(0)` returning null is correct; a year of zero is not a date, and
 * writing it into `release_year` would file a 1971 record under the year
 * nought. What was missing is that the release alone cannot answer the
 * question.
 *
 * §4.2 makes this worth the extra call: `release_year` is the ALBUM's original
 * year, and a master is precisely a description of an album across its
 * pressings. It is the correct source, not merely an available one.
 */

const db = getTestDb();

const CARPENTERS = 12856557;
const MASTER = 84975;

/** The real payload's shape: a year of 0 and no `released`. */
const RELEASE_WITHOUT_YEAR = {
  id: CARPENTERS,
  title: 'Carpenters',
  year: 0,
  country: 'US',
  master_id: MASTER,
  artists: [{ name: 'Carpenters', id: 123 }],
  labels: [{ name: 'A&M Records', catno: 'SP-3502', id: 456 }],
  formats: [{ name: 'Vinyl', descriptions: ['LP', 'Album'] }],
};

beforeEach(async () => {
  await truncateAll();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

async function seedRelease(payload: unknown, id = CARPENTERS) {
  await db.execute(
    sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
        VALUES (${id}, ${JSON.stringify(payload)}::jsonb, now())`,
  );
}

/**
 * The master, which is where this album's year actually lives.
 *
 * NO DEFAULT on `year`. An earlier version defaulted to 1971, so
 * `mockMaster(undefined)` — meant to model a master with no year — silently
 * got 1971 and the test failed against correct code. The default was the
 * defect, in the fixture rather than the implementation.
 */
function mockMaster(year: number | null) {
  const get = vi.fn(async () => ({ id: MASTER, ...(year === null ? {} : { year }), title: 'Carpenters' }));

  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: get as unknown as clientModule.DiscogsClient['get'],
  });

  return get;
}

describe('a release Discogs gives no year', () => {
  it('falls back to the master year', async () => {
    await seedRelease(RELEASE_WITHOUT_YEAR);
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.releaseYear, 'the album year, from the master').toBe('1971');
  });

  it('fills the PRESSING year from the master too', async () => {
    // §4.2 keeps these distinct — release_year is the album's, year_pressed is
    // this pressing's — but when Discogs offers only one date, it is the best
    // available answer for both and the user corrects what is wrong. An empty
    // field asks them to find a date the app already has.
    await seedRelease(RELEASE_WITHOUT_YEAR);
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.pressing.yearPressed).toBe('1971');
  });

  it('asks the master only when the release has no year of its own', async () => {
    /**
     * The release's own year is more specific: a 1989 reissue of a 1971 album
     * has `year: 1989`, and the master says 1971. Preferring the master would
     * date every reissue to its original release — the §8 collapse, arriving
     * through a date field.
     *
     * It also costs a rate-limited call, so it must not be made when the
     * release already answers.
     */
    await seedRelease({ ...RELEASE_WITHOUT_YEAR, year: 1989 });
    const get = mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.releaseYear).toBe('1989');
    expect(get, 'no master call when the release knows its own year').not.toHaveBeenCalled();
  });

  it('leaves the year empty when neither the release nor the master has one', async () => {
    // Honest rather than invented. §10's form works blank, and a year nobody
    // recorded is a field the user fills from the sleeve.
    await seedRelease(RELEASE_WITHOUT_YEAR);
    mockMaster(null);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.releaseYear).toBe('');
  });

  it('still prefills everything else when the master lookup fails', async () => {
    /**
     * A failed master must not cost the user the whole prefill. The release is
     * already in hand; the master is an enhancement, and degrading to "no year"
     * is the same shape as the versions endpoint degrading to tier 1.
     */
    await seedRelease(RELEASE_WITHOUT_YEAR);
    vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
      get: vi.fn(async () => {
        throw new clientModule.DiscogsError('Could not reach Discogs');
      }) as unknown as clientModule.DiscogsClient['get'],
    });

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill, 'the prefill survives').not.toBeNull();
    expect(prefill?.values.title).toBe('Carpenters');
    expect(prefill?.pressing.catalogNumber).toBe('SP-3502');
    expect(prefill?.values.releaseYear).toBe('');
  });

  it('does not ask for a master the release does not name', async () => {
    await seedRelease({ ...RELEASE_WITHOUT_YEAR, master_id: null });
    const get = mockMaster(1971);

    await loadDiscogsPrefill(CARPENTERS);

    expect(get).not.toHaveBeenCalled();
  });
});
