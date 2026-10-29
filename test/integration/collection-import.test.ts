import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, artistMatchCandidates, genres, pressings, records } from '@/db/schema';
import type { DiscogsClient } from '@/lib/discogs/client';
import { importCollection, runImport } from '@/lib/db/queries/collection-import';
import { latestImportRun } from '@/lib/db/queries/import-runs';
import { writeCachedRelease } from '@/lib/discogs/cache';
import * as storage from '@/lib/storage/blob';
import { logger } from '@/lib/logger';

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

afterEach(() => {
  vi.restoreAllMocks();
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

  /*
    §T.6 (Design, 28 Oct): "the four counts add up to what Discogs holds". The sum is checked against
    Discogs' own count, read from its page here and not from anything the import computed, and on the
    real database: a partition that double-counted a blank release, or a total derived from the four
    parts, would pass a check against itself and fail this one.
  */
  it('partitions the run: complete, blank, skipped and failed add up to the count Discogs’ page carries, each release on one line', async () => {
    const discogsHolds = (JSON.parse(readFileSync('test/fixtures/discogs/collection-page-1.json', 'utf8')) as { pagination: { items: number } }).pagination.items;
    await db.insert(pressings).values([{ discogsReleaseId: 11029111, catalogNumber: 'WYR?0514', matrixRunout: 'ADAM READ THIS OFF THE WAX' }]);
    await db.insert(records).values({ title: 'Sunbathing Animal', artistId: (await db.insert(artists).values({ name: 'Parquet Courts' }).returning())[0].id, pressingId: (await db.select().from(pressings))[0].id });
    const report = await importCollection(fakeClient({ '/releases/15661267': () => { throw new Error('Discogs answered 500'); } }));
    const complete = report.imported.filter((i) => i.blank.length === 0);
    const blank = report.imported.filter((i) => i.blank.length > 0);
    expect(report.total, 'Discogs’ own count, carried').toBe(discogsHolds);
    expect([complete.length, blank.length, report.skipped.length, report.failed.length]).toEqual([3, 4, 1, 1]);
    expect(complete.length + blank.length + report.skipped.length + report.failed.length).toBe(discogsHolds);
    const ids = [...report.imported, ...report.skipped, ...report.failed].map((i) => i.releaseId);
    expect(new Set(ids).size, 'each release once').toBe(discogsHolds);
    /* What failed and what was skipped are named by record, not by id alone. */
    expect(report.failed[0]).toMatchObject({ releaseId: 15661267, title: 'ATLiens', artist: 'OutKast', reason: expect.stringMatching(/500/) });
    expect(report.skipped[0]).toMatchObject({ releaseId: 11029111, title: 'Sunbathing Animal', artist: 'Parquet Courts' });
  });

  it('records each run, and the latest is read back for Manage with when it finished', async () => {
    const before = new Date();
    const run = await runImport(fakeClient());
    const first = await latestImportRun();
    expect(first).not.toBeNull();
    expect(first?.report.imported.length).toBe(9);
    expect(first?.finishedAt, 'the run answered is the run stored').toBe(run.finishedAt);
    expect(new Date(first?.finishedAt ?? 0).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    await runImport(fakeClient());
    const second = await latestImportRun();
    expect(second?.report.skipped.length, 'the next run replaces it').toBe(9);
    expect(second?.finishedAt).not.toBe(first?.finishedAt);
    expect(Number((await db.execute(sql`SELECT count(*)::int AS n FROM discogs_import_runs`)).rows[0]?.n), 'every run kept').toBe(2);
  });

  /*
    From production, 28 Oct, 21:51: a release in the cache and not held failed with a Zod error naming
    a missing `id`, because the importer handed the mapper the cache's wrapper, `{ payload, fetchedAt }`,
    and not the payload. Every run before it fetched fresh, and the idempotency test's second run holds
    every release, so the cache's read path into the mapper had never run. Fails against the wrapper.
  */
  it('imports a release the cache already holds, reading the cached payload and not the cache row', async () => {
    await writeCachedRelease(29900731, fixture('collection-release-29900731'));
    const client = fakeClient();
    const report = await importCollection(client);
    expect(report.failed).toEqual([]);
    expect(report.imported.map((i) => i.releaseId)).toContain(29900731);
    expect(client.calls, 'the cached release was not fetched again').not.toContain('/releases/29900731');
  });

  /*
    §T.6's promise is that the four counts add up to what Discogs holds, which both production runs met
    while reconciling against the source and never the effect (the coordinator, 28 Oct). This holds the
    effect: the records after a run are the records before plus the imported line, on the real database.
  */
  it('writes exactly as many records as it reports imported, counted against the database', async () => {
    await db.insert(pressings).values([{ discogsReleaseId: 11029111, catalogNumber: 'WYR?0514' }]);
    const artist = (await db.insert(artists).values({ name: 'Parquet Courts' }).returning())[0];
    await db.insert(records).values({ title: 'Sunbathing Animal', artistId: artist.id, pressingId: (await db.select().from(pressings))[0].id });
    const before = await count('records');
    const report = await importCollection(fakeClient({ '/releases/15661267': () => { throw new Error('Discogs answered 500'); } }));
    expect(report.imported.length).toBe(7);
    expect(await count('records')).toBe(before + report.imported.length);
  });

  /*
    The import creates the untagged state, so the import resolves it (the coordinator, 28 Oct): after
    the run, its own records are tagged through the one tagging module, as the cover is attached, after
    the commit and never fatal. Logged, not drawn: §T.6's four lines partition the run and a tagged count
    would be a fifth element. Fails against the import before it: no mood rows after a run.
  */
  it('tags the records it imported through the tagger it is given, after the run, and reports the run the same', async () => {
    const asked: string[] = [];
    /* One record a call, `{ moods }` back; the counts vary, since a run in which every record gets the same count is refused as flat (§7.12). */
    const sets = [['sleepy', 'sunny'], ['dancing'], ['zone out', 'smooth', 'loud and dirty']];
    const tagger = {
      model: 'fake-tagger',
      async tag(record: { id: string; artist: string; title: string }) {
        asked.push(record.id);
        return { ok: true as const, payload: { moods: sets[asked.length % 3] } };
      },
    };
    const run = await runImport(fakeClient(), { tagger });
    expect(run.report.imported.length).toBe(9);
    const rows = await db.execute(sql`SELECT record_id, tagged_by_model FROM record_moods`);
    expect(new Set((rows.rows as Array<{ record_id: string }>).map((r) => r.record_id)).size, 'every imported record has a mood row').toBe(9);
    expect((rows.rows as Array<{ tagged_by_model: string }>).every((r) => r.tagged_by_model === 'fake-tagger')).toBe(true);
    expect(new Set(asked)).toEqual(new Set(run.report.imported.map((i) => i.recordId)));
  });

  it('a tagger that fails leaves the run and its report as they were, and tags nothing', async () => {
    const tagger = { model: 'broken', async tag() { throw new Error('the model is down'); } };
    const run = await runImport(fakeClient(), { tagger });
    expect(run.report.imported.length).toBe(9);
    expect(run.report.failed).toEqual([]);
    expect(Number((await db.execute(sql`SELECT count(*)::int AS n FROM record_moods`)).rows[0]?.n)).toBe(0);
  });

  /*
    The branches the audit of 28 Oct found reachable and never executed (NOTES 22:30), closed while it
    was fresh (the coordinator). The cover's outcomes inside the import flow first: that path runs on
    every imported record in production and settled tonight's orphan question, and the import's tests
    had left the blob store unconfigured, so the attach returned before any fetch. Fails against the
    import before the cover's report was read from the attach's own outcome.
  */
  it('reports the cover failed when the store is configured and the fetch refuses, and none when the release has no image', async () => {
    vi.spyOn(storage, 'isBlobConfigured').mockReturnValue(true);
    vi.spyOn(storage, 'getBlobStorage').mockReturnValue({ put: async () => { throw new Error('never reached'); }, delete: async () => undefined });
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const bare = { ...(fixture('collection-release-29613763') as Record<string, unknown>), images: [] };
    const report = await importCollection(fakeClient({ '/releases/29613763': bare }));
    expect(report.failed).toEqual([]);
    const covers = Object.fromEntries(report.imported.map((i) => [i.releaseId, i.cover]));
    expect(covers[29613763]).toBe('not attached: none');
    expect(covers[29900731]).toBe('not attached: failed');
    expect(warn, 'the fetch failure is logged, once per record with an image').toHaveBeenCalledTimes(8);
    expect(await count('records'), 'a cover that fails costs no record').toBe(9);
  });

  it('creates a suffixed artist with no candidate when no local artist bears the bare name', async () => {
    const suffixed = fixture('collection-release-29613763') as { artists: Array<{ name: string; id: number }> };
    const report = await importCollection(fakeClient({ '/releases/29613763': { ...suffixed, artists: [{ ...suffixed.artists[0], name: 'Weezer (3)', id: 9999999 }] } }));
    expect(report.failed).toEqual([]);
    expect((await db.select().from(artists).where(eq(artists.name, 'Weezer (3)'))).length).toBe(1);
    expect(await db.select().from(artistMatchCandidates)).toEqual([]);
  });

  it('is idempotent on release id: a second run imports nothing and reports the nine as already here', async () => {
    await importCollection(fakeClient());
    const again = await importCollection(fakeClient());
    expect(again.imported).toEqual([]);
    expect(again.skipped.map((s) => s.releaseId).sort()).toEqual([...IDS].sort());
    expect(again.skipped.every((s) => s.reason === 'already here')).toBe(true);
    /* The report names what was skipped by the record that holds it, so Manage's list reads as records and not ids. */
    expect(again.skipped.find((s) => s.releaseId === 29613763)).toMatchObject({ title: 'Great Doubt', artist: 'Astrid Sonne' });
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
    expect(report.failed).toEqual([{ releaseId: 15661267, title: 'ATLiens', artist: 'OutKast', reason: expect.stringMatching(/500/) }]);
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
