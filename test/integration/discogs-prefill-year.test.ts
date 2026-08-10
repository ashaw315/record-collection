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

describe('format and label matching', () => {
  /**
   * FOUND IN REAL USE: three imported Carpenters records had no label and no
   * format. Three separate causes, and only two are defects.
   *
   * **Format was never mapped at all.** §6's field mapping says
   * `formats[0].name`→`formats.name`, but the real payload puts the MEDIUM in
   * `name` ("Vinyl") and the format we seed in `descriptions` (["LP","Album"]).
   * Matching on `name` would never match any of the seven seeded formats, so
   * the spec's mapping is written against a field that does not hold that
   * value.
   */
  it('matches a seeded format from the DESCRIPTIONS, not the medium', async () => {
    await seedRelease({
      ...RELEASE_WITHOUT_YEAR,
      formats: [{ name: 'Vinyl', descriptions: ['LP', 'Album'] }],
    });
    mockMaster(1971);

    const lp = await db.execute<{ id: string }>(
      sql`SELECT id FROM formats WHERE name = 'LP'`,
    );

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.formatId, 'the LP row, matched from descriptions').toBe(
      lp.rows[0].id,
    );
  });

  it('leaves the format empty when nothing matches, rather than guessing', async () => {
    // §10: matched, never created. A format Discogs names that we do not have
    // is a blank select and a notice, not a new reference row.
    await seedRelease({
      ...RELEASE_WITHOUT_YEAR,
      formats: [{ name: 'CD', descriptions: ['Album', 'Compilation'] }],
    });
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.formatId).toBe('');
  });

  it('prefers a more specific descriptor over a general one', async () => {
    // "7\"" and "Single" can both appear; the seeded set has 7" and
    // 12" Single, so the descriptor that names a physical format wins.
    await seedRelease({
      ...RELEASE_WITHOUT_YEAR,
      formats: [{ name: 'Vinyl', descriptions: ['7"', 'Single'] }],
    });
    mockMaster(1971);

    const seven = await db.execute<{ id: string }>(
      sql`SELECT id FROM formats WHERE name = '7"'`,
    );

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.formatId).toBe(seven.rows[0].id);
  });

  it('names a label it could not match, so the near-miss is visible', async () => {
    /**
     * THE reported case. Adam's row is "A&M"; Discogs says "A&M Records".
     * Exact matching is deliberate — fuzzy matching a label risks attaching a
     * record to the wrong one, which is the §8-adjacent direction to avoid —
     * but the field emptying silently gave him no way to see why.
     *
     * Naming it lets him act without the app guessing.
     */
    await db.execute(sql`INSERT INTO labels (name) VALUES ('A&M')`);
    await seedRelease(RELEASE_WITHOUT_YEAR);
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.labelId, 'no guess').toBe('');
    expect(prefill?.unmatched.label, 'but the name Discogs gave is reported').toBe(
      'A&M Records',
    );
  });

  it('matches a label whose name agrees exactly', async () => {
    await db.execute(sql`INSERT INTO labels (name) VALUES ('A&M Records')`);
    await seedRelease(RELEASE_WITHOUT_YEAR);
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.labelId).not.toBe('');
    expect(prefill?.unmatched.label).toBeNull();
  });

  it('names an unmatched FORMAT too, for the same reason', async () => {
    await seedRelease({
      ...RELEASE_WITHOUT_YEAR,
      formats: [{ name: 'Cassette', descriptions: ['Album'] }],
    });
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.unmatched.format).toBe('Cassette');
  });
});

describe('a release Discogs gives no year', () => {
  it('falls back to the master year', async () => {
    await seedRelease(RELEASE_WITHOUT_YEAR);
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.releaseYear, 'the album year, from the master').toBe('1971');
  });

  it('does NOT fill the pressing year from the master', async () => {
    /**
     * FOUND BY THE SECURITY REVIEW, and I wrote both halves of the mistake.
     *
     * §4.2 keeps the two years distinct: `release_year` is the ALBUM's original
     * year, `year_pressed` is THIS pressing's. The master describes the album
     * across all its pressings, so it can answer the first and never the
     * second — a 1989 reissue of a 1971 album was pressed in 1989.
     *
     * The `masterYear` comment two lines above the offending line says exactly
     * this: "preferring the master would date every reissue to its original,
     * which is CLAUDE.md §8's collapse arriving through a date field". The
     * argument was written about `release_year` and never applied to the field
     * beside it.
     *
     * **The compounding is what makes it more than a wrong default.**
     * `yearPressed` is one of `IDENTIFYING_FIELDS`, so a user who corrects the
     * fabricated year contradicts an identifying field and silently loses tier
     * 1 — punished for fixing our error.
     */
    await seedRelease(RELEASE_WITHOUT_YEAR);
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.values.releaseYear, 'the ALBUM year, which the master knows').toBe('1971');
    expect(
      prefill?.pressing.yearPressed,
      'the PRESSING year, which it does not — empty rather than fabricated',
    ).toBe('');
  });

  it('does fill the pressing year when the RELEASE carries one', async () => {
    // The release is a description of one pressing, so its year IS that
    // pressing's year. Only the master's is unusable here.
    await seedRelease({ ...RELEASE_WITHOUT_YEAR, year: 1989 });

    const prefill = await loadDiscogsPrefill(CARPENTERS);

    expect(prefill?.pressing.yearPressed).toBe('1989');
    expect(prefill?.values.releaseYear).toBe('1989');
  });

  it('leaves a user who corrects the year with their tier 1 intact', async () => {
    /**
     * The compounding, asserted end to end: with the pressing year no longer
     * fabricated, there is nothing for the user to correct, so nothing
     * contradicts identity and the release id survives.
     *
     * Before the fix the prefill offered 1971, a user with a 1989 repress
     * corrected it, and `discogsIdToSubmit` read that as contradicting the
     * release — dropping the id and the badge.
     */
    const { discogsIdToSubmit } = await import('@/app/records/pressing-identity');

    await seedRelease(RELEASE_WITHOUT_YEAR);
    mockMaster(1971);

    const prefill = await loadDiscogsPrefill(CARPENTERS);
    const asPrefilled = prefill!.pressing;

    // The user fills in the year from the record in their hand.
    const corrected = { ...asPrefilled, yearPressed: '1989' };

    expect(
      discogsIdToSubmit(asPrefilled.discogsReleaseId, asPrefilled, corrected),
      'filling in a blank is adding information, not contradicting it',
    ).toBe(CARPENTERS);
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
