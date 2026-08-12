import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { POST as importRoute } from '@/app/api/discogs/import/route';
import { listRecords } from '@/lib/db/queries/records';
import { genres, recordGenres, records } from '@/db/schema';
import * as clientModule from '@/lib/discogs/client';

/**
 * **The seam test for §6's genre mapping: import in, collection query out, no
 * fixture in between.**
 *
 * The QA finding this exists for: imported records had NO genres. §6's mapping
 * was implemented correctly in `discogs-import.ts` and its tests passed — but
 * the UI reached the collection through a different path that read neither
 * `genres` nor `styles`. Honest tests of code nothing ran.
 *
 * Everything downstream of `record_genres` was correct and STARVED: §7.1's
 * hierarchy, the facet chips, `matchedVia`, step 10's graph, step 11's shelf
 * order, step 12's suggestions. A layer test could not see that, by
 * construction — see the seam rule in NOTES.
 *
 * **Written to fail against FLATTENING, not merely against absence.** The
 * discriminating fixture is a release whose `genres` and `styles` differ:
 * `genres: ["Rock"]`, `styles: ["Hardcore", "Punk"]`. An implementation reading
 * only `genres` attaches "Rock" and would pass any test asserting "a genre is
 * attached" — while filing a hardcore record under the parent, which is exactly
 * the distinction CLAUDE.md §8 exists to protect.
 */

const db = getTestDb();

const DETAILED = JSON.parse(
  readFileSync('test/fixtures/discogs/release-detailed.json', 'utf8'),
) as { id: number; genres: string[]; styles: string[] };

function mockDiscogs(response: unknown = DETAILED) {
  vi.spyOn(clientModule, 'getDiscogsClient').mockReturnValue({
    get: vi.fn(async () => response) as unknown as clientModule.DiscogsClient['get'],
    fetchImage: vi.fn() as unknown as clientModule.DiscogsClient['fetchImage'],
  });
}

const post = (body: unknown) =>
  new Request('https://x.test/api/discogs/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
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

/** Genre names attached to the most recently imported record. */
async function newestRecordId(): Promise<string> {
  const [row] = await db
    .select({ id: records.id })
    .from(records)
    .orderBy(sql`${records.createdAt} DESC`)
    .limit(1);
  return row.id;
}

/**
 * Drizzle's typed select, not `db.execute`. The latter returns a driver RESULT
 * OBJECT rather than an array, so `rows.map` throws — already recorded in NOTES
 * from step 8 unit 3, and walked into again here.
 */
async function attachedGenres(): Promise<string[]> {
  const rows = await db
    .select({ name: genres.name })
    .from(recordGenres)
    .innerJoin(genres, eq(genres.id, recordGenres.genreId))
    .where(eq(recordGenres.recordId, await newestRecordId()))
    .orderBy(genres.name);

  return rows.map((row) => row.name);
}

describe('a Discogs import reaches the collection with its genres intact', () => {
  it('attaches the STYLE as well as the genre, never flattening to the parent', async () => {
    /**
     * The assertion that decides this whole unit.
     *
     * `toEqual` on the sorted set, not `toContain`: an implementation taking
     * only `genres[]` attaches "Rock" and passes `toContain('Rock')` while
     * losing "Hardcore" and "Punk". The set is what discriminates.
     */
    mockDiscogs();

    const response = await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));
    expect(response.status).toBe(201);

    expect(await attachedGenres()).toEqual(['Hardcore', 'Punk', 'Rock']);
  });

  it('creates the genre rows that did not exist, per §6 find-or-create', async () => {
    mockDiscogs();

    const before = await db.select({ name: genres.name }).from(genres);
    expect(before, 'nothing pre-seeded — these are created by the import').toHaveLength(0);

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    const after = await db.select({ name: genres.name }).from(genres).orderBy(genres.name);
    expect(after.map((row) => row.name)).toEqual(['Hardcore', 'Punk', 'Rock']);
  });

  it('reuses an existing genre rather than duplicating it, case-insensitively', async () => {
    // §6 says find-or-create. Discogs sends "Rock"; a collection already
    // holding "rock" must not end up with both.
    await db.insert(genres).values({ name: 'rock' });
    mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    const rows = await db
      .select({ name: genres.name })
      .from(genres)
      .where(sql`lower(${genres.name}) = 'rock'`);
    expect(rows, 'one row, whichever spelling won').toHaveLength(1);
  });

  it('the imported record is FINDABLE by its style in the collection query', async () => {
    /**
     * The end of the chain, and the reason this file exists rather than another
     * assertion inside the import's own suite: what starved was every consumer
     * of `record_genres`. Attaching rows proves the write; filtering by one
     * proves the collection screen has something to work with.
     */
    mockDiscogs();
    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    const [hardcore] = await db
      .select({ id: genres.id })
      .from(genres)
      .where(eq(genres.name, 'Hardcore'));

    const filtered = await listRecords({ filters: { genreId: hardcore.id }, limit: 50, offset: 0 });

    expect(filtered.rows, 'the record answers a filter on its STYLE').toHaveLength(1);
    expect(filtered.rows[0].title).toContain('Hear Nothing');
  });

  it('a second import of the same release does not duplicate its genre links', async () => {
    // Duplicate records are legal (§4), but one record must not accumulate the
    // same genre twice — that would double-count it in every facet.
    mockDiscogs();

    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));
    await importRoute(post({ discogsReleaseId: 381756, target: 'record' }));

    expect(await attachedGenres()).toEqual(['Hardcore', 'Punk', 'Rock']);
  });
});
