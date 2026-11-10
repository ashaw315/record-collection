import { describe, expect, it } from 'vitest';
import { compareLedgers, fixtureVocabulary, judgeGenres } from '../../e2e/ledger';

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
  const start = { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Pop', 'Rock'], records: [] };

  it('reports nothing where the end holds what the start held', () => {
    expect(compareLedgers(start, { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Rock', 'Pop'], records: [] })).toEqual({ genresLeft: [], recordsLeft: [], moved: [] });
  });

  /* Fails against a comparison by count: one genre gone and another left is the same count. */
  it('names a genre left behind even where the count is unchanged', () => {
    const { genresLeft } = compareLedgers(start, { tables: { genres: 2, labels: 1, tags: 0 }, genres: ['Pop', 'UK82-abc'], records: [] });
    expect(genresLeft).toEqual(['UK82-abc']);
  });

  it('lists every table whose count moved, with both figures', () => {
    const { moved } = compareLedgers(start, { tables: { genres: 2, labels: 5, tags: 0, stores: 3 }, genres: ['Pop', 'Rock'], records: [] });
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
  const start = { tables: { records: 17 }, genres: [], records: ['Loss Of Life · r1', 'The Doors · r2'] };

  it('names each record the end holds that the start did not, by title and id', () => {
    const end = { tables: { records: 19 }, genres: [], records: ['Loss Of Life · r1', 'The Doors · r2', 'Hear Nothing 123-merge · r9', 'Footprint 7 · r8'] };
    expect(compareLedgers(start, end).recordsLeft).toEqual(['Hear Nothing 123-merge · r9', 'Footprint 7 · r8']);
  });

  it('names none where the records held or fell, and a record of the same title as one of the seventeen is told apart by its id', () => {
    expect(compareLedgers(start, { ...start, tables: { records: 17 } }).recordsLeft).toEqual([]);
    expect(compareLedgers(start, { tables: { records: 16 }, genres: [], records: ['Loss Of Life · r1'] }).recordsLeft).toEqual([]);
    expect(compareLedgers(start, { tables: { records: 18 }, genres: [], records: [...start.records, 'The Doors · r7'] }).recordsLeft).toEqual(['The Doors · r7']);
  });
});
