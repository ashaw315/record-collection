import { readFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, artistMatchCandidates, genres, pressings, records } from '@/db/schema';
import type { DiscogsClient } from '@/lib/discogs/client';
import { importCollection } from '@/lib/db/queries/collection-import';

/**
 * Step 18 unit D (SPEC §5 `POST /api/discogs/import-collection`, §12 step 18):
 * the token owner's collection into the app, against the real test database,
 * with Discogs mocked: the nine fixtures a person captured on 27 Oct, served
 * by a fake client keyed on the path the app asks for. Nothing here reaches
 * the network, and the cover fetch refuses, which the importer reports and
 * never treats as fatal.
 */
const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const fixture = (name: string): unknown => JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8'));
const PAGE = fixture('collection-page-1') as { releases: Array<{ id: number }> };
const IDS = PAGE.releases.map((r) => r.id);

type Answers = Record<string, unknown | (() => never)>;

/** A client answering from the fixtures; `over` replaces or breaks an answer. */
function fakeClient(over: Answers = {}): DiscogsClient & { calls: string[] } {
  const answers: Answers = {
    '/oauth/identity': fixture('collection-identity'),
    '/users/AdamPseudo/collection/folders/0/releases': PAGE,
    ...Object.fromEntries(IDS.map((id) => [`/releases/${id}`, fixture(`collection-release-${id}`)])),
    ...over,
  };
  const calls: string[] = [];
  return {
    calls,
    async get<T>(path: string): Promise<T> {
      calls.push(path);
      const a = answers[path];
      if (a === undefined) throw new Error(`the fake client has no answer for ${path}`);
      if (typeof a === 'function') (a as () => never)();
      return a as T;
    },
    async fetchImage(): Promise<never> {
      throw new Error('no images in this test');
    },
  };
}

const count = async (table: 'records' | 'pressings' | 'artists' | 'labels' | 'genres') => Number((await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table}`))).rows[0]?.n ?? 0);

describe('importCollection', () => {
  it('imports the nine as records on pressings keyed by release id, with stub artists and labels, genres and not styles, the seven formats and no more, the conditions, and each matrix seeded and marked discogs', async () => {
    const report = await importCollection(fakeClient());
    expect(report.username).toBe('AdamPseudo');
    expect(report.imported.map((i) => i.releaseId).sort()).toEqual([...IDS].sort());
    expect(report.skipped).toEqual([]);
    expect(report.failed).toEqual([]);
    expect(await count('records')).toBe(9);
    const rows = await db.select().from(pressings);
    expect(rows.map((p) => p.discogsReleaseId).sort()).toEqual([...IDS].sort());
    /* Seven carry a Discogs matrix, marked as such; the two without keep the column's default. */
    const seeded = rows.filter((p) => p.matrixRunout !== null);
    expect(seeded.length).toBe(7);
    expect(seeded.every((p) => p.matrixRunoutSource === 'discogs')).toBe(true);
    expect(rows.find((p) => p.discogsReleaseId === 29613763)?.matrixRunout).toBeNull();
    /* Genres from Discogs' genres only: Jazz, not Free Jazz. */
    const names = (await db.select({ name: genres.name }).from(genres)).map((g) => g.name);
    expect(names).toContain('Jazz');
    expect(names).not.toContain('Free Jazz');
    expect(names).not.toContain('Hypnagogic pop');
    /* Formats: six LPs, ATLiens a 2xLP, two with none. */
    const withFormat = await db.execute(sql`SELECT f.name FROM records r LEFT JOIN formats f ON f.id = r.format_id`);
    const fmt = (withFormat.rows as Array<{ name: string | null }>).map((r) => r.name);
    expect(fmt.filter((n) => n === 'LP').length).toBe(6);
    expect(fmt.filter((n) => n === '2xLP').length).toBe(1);
    expect(fmt.filter((n) => n === null).length).toBe(2);
    /* Conditions from the collection item: Mint on both sides for eight, MGMT's sleeve blank. */
    const mgmt = (await db.select().from(records).where(eq(records.title, 'Loss Of Life')))[0];
    expect(mgmt?.conditionMedia).toBe('M');
    expect(mgmt?.conditionSleeve).toBeNull();
    /* Stubs: every artist and label the app lacked, by name. */
    expect(await count('artists')).toBe(9);
    expect(await count('labels')).toBe(9);
    expect((await db.select({ name: artists.name }).from(artists)).map((a) => a.name)).toContain('Mandy, Indiana');
    /* The report carries what was left blank and what was dropped. */
    const jubilee = report.imported.find((i) => i.releaseId === 33132765);
    expect(jubilee?.blank.map((b) => b.field)).toContain('format');
    expect(report.imported.find((i) => i.releaseId === 15661267)?.blank.map((b) => b.field)).toContain('year_pressed');
    expect(report.imported.every((i) => i.dropped.some((d) => d.field === 'styles'))).toBe(true);
    expect(report.imported.find((i) => i.releaseId === 29900731)?.blank.find((b) => b.field === 'color_variant')?.value).toBe('Hot Pink [Opaque]');
  });

  it('is idempotent on release id: a second run imports nothing and reports the nine as already here', async () => {
    await importCollection(fakeClient());
    const again = await importCollection(fakeClient());
    expect(again.imported).toEqual([]);
    expect(again.skipped.map((s) => s.releaseId).sort()).toEqual([...IDS].sort());
    expect(again.skipped.every((s) => s.reason === 'already here')).toBe(true);
    expect(await count('records')).toBe(9);
    expect(await count('pressings')).toBe(9);
  });

  it('never writes over a matrix already there (§7.8), and seeds one into an empty pressing it finds by release id, marked discogs', async () => {
    /* Two pressings the app already holds for two of the nine, with no record on them: one with Adam's matrix, one with none. */
    await db.insert(pressings).values([
      { discogsReleaseId: 11029111, catalogNumber: 'WYR?0514', matrixRunout: 'ADAM READ THIS OFF THE WAX' },
      { discogsReleaseId: 31126154, catalogNumber: '700217' },
    ]);
    await importCollection(fakeClient());
    const kept = (await db.select().from(pressings).where(eq(pressings.discogsReleaseId, 11029111)))[0];
    expect(kept?.matrixRunout).toBe('ADAM READ THIS OFF THE WAX');
    expect(kept?.matrixRunoutSource).toBe('user');
    const filled = (await db.select().from(pressings).where(eq(pressings.discogsReleaseId, 31126154)))[0];
    expect(filled?.matrixRunout).toMatch(/MPO/);
    expect(filled?.matrixRunoutSource).toBe('discogs');
    expect(await count('pressings'), 'the two were found, not duplicated').toBe(9);
  });

  it('reports a release that fails to fetch and imports the other eight', async () => {
    const report = await importCollection(fakeClient({ '/releases/15661267': () => { throw new Error('Discogs answered 500'); } }));
    expect(report.imported.length).toBe(8);
    expect(report.failed).toEqual([{ releaseId: 15661267, reason: expect.stringMatching(/500/) }]);
    expect(await count('records')).toBe(8);
  });

  it('records a match candidate for the review when a created artist’s name is a local name with Discogs’ suffix (§4.3), and reuses an exact name', async () => {
    const [weezer] = await db.insert(artists).values({ name: 'Weezer' }).returning();
    const [mandy] = await db.insert(artists).values({ name: 'Mandy, Indiana' }).returning();
    const suffixed = fixture('collection-release-29613763') as { artists: Array<{ name: string; id: number }> };
    const report = await importCollection(fakeClient({ '/releases/29613763': { ...suffixed, artists: [{ ...suffixed.artists[0], name: 'Weezer (3)', id: 9999999 }] } }));
    expect(report.failed).toEqual([]);
    const created = (await db.select().from(artists).where(eq(artists.name, 'Weezer (3)')))[0];
    expect(created, 'the suffixed name is a new row, not a claim on Weezer').toBeDefined();
    const candidates = await db.select().from(artistMatchCandidates);
    expect(candidates).toEqual([expect.objectContaining({ artistId: created?.id, candidateArtistId: weezer.id, reason: 'name_match_no_mbid' })]);
    expect((await db.select().from(artists).where(eq(artists.name, 'Mandy, Indiana'))).length, 'an exact name is reused').toBe(1);
    expect((await db.select().from(records)).some((r) => r.artistId === mandy.id)).toBe(true);
  });

  it('refuses a token with no username before touching the database', async () => {
    await expect(importCollection(fakeClient({ '/oauth/identity': { consumer_name: 'app' } }))).rejects.toThrow(/username/);
    expect(await count('records')).toBe(0);
  });
});
