import { describe, expect, it } from 'vitest';
import { compareLedgers, fixtureVocabulary, judgeGenres, recordsLeft } from '../../e2e/ledger';

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
  const start = { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Pop', 'Rock'] };

  it('reports nothing where the end holds what the start held', () => {
    expect(compareLedgers(start, { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Rock', 'Pop'] })).toEqual({ genresLeft: [], moved: [] });
  });

  /* Fails against a comparison by count: one genre gone and another left is the same count. */
  it('names a genre left behind even where the count is unchanged', () => {
    const { genresLeft } = compareLedgers(start, { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Pop', 'UK82-abc'] });
    expect(genresLeft).toEqual(['UK82-abc']);
  });

  it('lists every table whose count moved, with both figures', () => {
    const { moved } = compareLedgers(start, { tables: { genres: 2, labels: 5, tags: 0, stores: 3 }, genres: ['Pop', 'Rock'] });
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
  **Leftover records fail the run, as leftover genres do (the coordinator, 10 Nov).** On gate 42824167411 manage.spec's
  merge test left its seeded record behind; the ledger printed "records: 17 at the start, 19 at the end", nobody read
  it, and the record became §T.6's source for every parallel spec until the run ended, failing sidebar-113 twice. A
  guard that fires into a log nobody reads is indistinguishable from no guard. Fails against a teardown that only
  prints the moved tables.
*/
describe('recordsLeft', () => {
  it('counts records the end holds that the start did not', () => {
    expect(recordsLeft([{ table: 'records', start: 17, end: 19 }])).toBe(2);
  });

  it('is zero where the count held, fell, or only other tables moved', () => {
    expect(recordsLeft([{ table: 'records', start: 17, end: 17 }])).toBe(0);
    expect(recordsLeft([{ table: 'records', start: 17, end: 15 }])).toBe(0);
    expect(recordsLeft([{ table: 'tags', start: 0, end: 2 }, { table: 'artists', start: 17, end: 22 }])).toBe(0);
    expect(recordsLeft([])).toBe(0);
  });
});
