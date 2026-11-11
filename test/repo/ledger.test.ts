import { describe, expect, it } from 'vitest';
import { compareLedgers, fixtureReleaseIds, fixtureVocabulary, judgeGenres, judgeReleases } from '../../e2e/ledger';

/**
 * The run's ledger (`e2e/ledger.ts`): what the test database holds at the
 * end of an end-to-end run against what it held at the start.
 *
 * The comparison is the part with a rule in it. A leak is a genre the end
 * has and the start did not. The one kind that is let stand is a name the
 * app itself finds or creates from a Discogs fixture when a test saves a
 * prefilled record: those are shared by name between the two workers, so
 * deleting one mid-run could take it from under the other worker's test,
 * and they are bounded by the fixtures, not by the length of the run.
 */
describe('compareLedgers', () => {
  const start = { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Pop', 'Rock'], records: [], releases: [], pressings: [] };

  it('reports nothing where the end holds what the start held', () => {
    expect(compareLedgers(start, { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Rock', 'Pop'], records: [], releases: [], pressings: [] })).toEqual({ genresLeft: [], recordsLeft: [], releasesLeft: [], pressingsLeft: [], moved: [] });
  });

  /* Fails against a comparison by count: one genre gone and another left is the same count. */
  it('names a genre left behind even where the count is unchanged', () => {
    const { genresLeft } = compareLedgers(start, { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Pop', 'UK82-abc'], records: [], releases: [], pressings: [] });
    expect(genresLeft).toEqual(['UK82-abc']);
  });

  it('lists every table whose count moved, with both figures', () => {
    const { moved } = compareLedgers(start, { tables: { genres: 2, labels: 5, tags: 0, stores: 3 }, genres: ['Pop', 'Rock'], records: [], releases: [], pressings: [] });
    expect(moved).toEqual([{ table: 'labels', start: 1, end: 5 }, { table: 'stores', start: 0, end: 3 }]);
  });
});

describe('judgeGenres', () => {
  /* Fails against a ledger that lets every plain name stand, or none. */
  it('lets a Discogs fixture’s own genre or style stand, and fails on any other name', () => {
    const vocabulary = fixtureVocabulary();
    expect(vocabulary.has('Hardcore'), 'the precondition: the fixtures name Hardcore').toBe(true);
    expect(vocabulary.has('UK82-abc')).toBe(false);
    expect(judgeGenres(['Hardcore', 'UK82-abc', 'e2e-child-1'], vocabulary)).toEqual({ fromFixtures: ['Hardcore'], leaked: ['UK82-abc', 'e2e-child-1'] });
  });

  it('reads the vocabulary from the fixture files: a non-empty set of names', () => {
    expect(fixtureVocabulary().size).toBeGreaterThan(5);
  });
});

/*
  **Leftover records fail the run by name, as leftover genres do (the coordinator, 10 Nov).** On gate 42824167411
  manage.spec's merge test left its seeded record behind; the ledger printed "records: 17 at the start, 19 at the end",
  nobody read it, and the record became §T.6's source for every parallel spec until the run ended. The first guard
  counted them (5 on each shard of gate 42864398374, all specs passing); a count names no spec, so the ledger now carries
  each record's title and id, and the line names what was left. Fails against a ledger that holds only counts.
*/
describe('compareLedgers names the records left behind', () => {
  const start = { tables: { records: 17 }, genres: [], records: ['Loss Of Life · r1', 'The Doors · r2'], releases: [], pressings: [] };

  it('names each record the end holds that the start did not, by title and id', () => {
    const end = { tables: { records: 19 }, genres: [], records: ['Loss Of Life · r1', 'The Doors · r2', 'Hear Nothing 123-merge · r9', 'Footprint 7 · r8'], releases: [], pressings: [] };
    expect(compareLedgers(start, end).recordsLeft).toEqual(['Hear Nothing 123-merge · r9', 'Footprint 7 · r8']);
  });

  it('names none where the records held or fell, and a record of the same title as one of the seventeen is told apart by its id', () => {
    expect(compareLedgers(start, { ...start, tables: { records: 17 } }).recordsLeft).toEqual([]);
    expect(compareLedgers(start, { tables: { records: 16 }, genres: [], records: ['Loss Of Life · r1'], releases: [], pressings: [] }).recordsLeft).toEqual([]);
    expect(compareLedgers(start, { tables: { records: 18 }, genres: [], records: [...start.records, 'The Doors · r7'], releases: [], pressings: [] }).recordsLeft).toEqual(['The Doors · r7']);
  });
});

/*
  **Leftover releases fail the run by id, as leftover records and genres do (Q67, the coordinator, 10 Nov).** The 173c
  spec and capture seed releases under ids of the run's own (900,000,000 upward) and nothing deleted them: the ledger
  read discogs_cache 0 to 20 at gate 42913956669 and passed, the arrangement that let a leaked record stand unread for
  four observations. The one kind let stand is a fixture's own release id (`seedDiscogsCache`), shared by id between the
  two workers as the fixtures' genres are shared by name: `lookup-flows` seeds 381756 in a beforeAll because an afterAll
  that removed it took it from under a sibling worker. Fails against a ledger that holds only the cache's count, and
  against one that lets every id stand, or none.
*/
describe('compareLedgers names the releases left behind, and judgeReleases lets a fixture’s own id stand', () => {
  const start = { tables: { discogs_cache: 1 }, genres: [], records: [], releases: [381756], pressings: [] };

  it('names each release id the end holds that the start did not', () => {
    const end = { tables: { discogs_cache: 3 }, genres: [], records: [], releases: [381756, 912345678, 6758287], pressings: [] };
    expect(compareLedgers(start, end).releasesLeft).toEqual([912345678, 6758287]);
    expect(compareLedgers(start, { ...start }).releasesLeft).toEqual([]);
  });

  it('reads the fixtures’ release ids from the files: 381756 among them, a run’s own id not', () => {
    const ids = fixtureReleaseIds();
    expect(ids.has(381756), 'the precondition: release-detailed is 381756').toBe(true);
    expect(ids.has(6758287), 'release-gatefold-c').toBe(true);
    expect(ids.has(912345678)).toBe(false);
    expect(ids.size).toBeGreaterThan(5);
  });

  it('lets a fixture’s own id stand and fails on any other', () => {
    expect(judgeReleases([381756, 912345678, 6758287, 945000001], fixtureReleaseIds())).toEqual({ fromFixtures: [381756, 6758287], leaked: [912345678, 945000001] });
  });
});

/*
  **Leftover pressings fail the run by id, as records, genres and releases do (Q67's pressing half; the coordinator,
  11 Nov).** A pressing is found-or-created with a record and is not shared by name, so there is no "which rows stand"
  question: every pressing the end holds that the start did not is a leak, named by catalogue number and id. Fails
  against a compareLedgers without the field, or one keyed on the count rather than the ids.
*/
describe('compareLedgers names the pressings left behind', () => {
  const start = { tables: { pressings: 1 }, genres: [], records: [], releases: [], pressings: ['NBLP 7119 · p1'] };

  it('names each pressing the end holds that the start did not, by catalogue number and id', () => {
    const end = { tables: { pressings: 3 }, genres: [], records: [], releases: [], pressings: ['NBLP 7119 · p1', 'CLAY 1 · p9', ' · p8'] };
    expect(compareLedgers(start, end).pressingsLeft).toEqual(['CLAY 1 · p9', ' · p8']);
    expect(compareLedgers(start, { ...start }).pressingsLeft).toEqual([]);
    expect(compareLedgers(start, { ...start, tables: { pressings: 0 }, pressings: [] }).pressingsLeft).toEqual([]);
  });
});
