import { describe, expect, it } from 'vitest';
import { collectionReportFromFixtures, reportAllSkipped } from '../../../test/fixtures/discogs/collection-report';
import { failureSentence, reportLines } from './import-report';

/**
 * §T.6 (Design, 28 Oct): the import's report "is three lines in the order
 * the import reports: what came in, what was skipped as already held, and
 * what imported blank, each with its count." The lines are derived here,
 * pure, from the route's report; the section draws what this returns.
 */
const report = collectionReportFromFixtures();

describe('reportLines', () => {
  /* Fails against lines in another order, or a count read from the wrong list. */
  it('gives the three lines in the ruled order, each with its count', () => {
    const lines = reportLines(report);
    expect(lines.map((l) => l.key)).toEqual(['imported', 'skipped', 'blank']);
    /*
      Nine blank, not four: the mapping (unit B) lists every format text under colour, "the text that
      would have been read", so a release whose text gave its weight is still listed, and ATLiens has
      its year. On Adam's nine every item has something listed, which the line says.
    */
    expect(lines.map((l) => l.count)).toEqual([9, 0, 9]);
    expect(lines.map((l) => l.sentence)).toEqual(['9 came in', '0 skipped as already held', '9 imported blank']);
  });

  /* Fails against an item named by its release id: the reader knows records by artist and title. */
  it('lists what came in as artist and title, in the collection’s order', () => {
    const [imported] = reportLines(report);
    expect(imported.items).toHaveLength(9);
    expect(imported.items[0]).toBe('Astrid Sonne — Great Doubt');
    expect(imported.items[8]).toBe('Parquet Courts — Sunbathing Animal');
  });

  /* Fails against a blank line that names the record and not what was left blank, or names the column rather than the thing. */
  it('lists what imported blank with the field in words and the value Discogs had', () => {
    const blank = reportLines(report)[2];
    expect(blank.items).toHaveLength(9);
    expect(blank.items).toContain('MGMT — Loss Of Life: colour Hot Pink [Opaque]');
    expect(blank.items).toContain('Parquet Courts — Sunbathing Animal: colour Gatefold, 180gm');
    expect(blank.items).toContain('OutKast — ATLiens: year 0');
    expect(blank.items.find((i) => i.startsWith('Cindy Lee'))).toMatch(/^Cindy Lee — Diamond Jubilee: format Vinyl×3 LP\/Album\/Stereo$/);
    expect(blank.items.find((i) => i.startsWith('Kim Gordon'))).toMatch(/: format .*; colour Silver \| Silver$/);
  });

  /* Fails against a skipped list that carries nothing a reader can recognise. */
  it('lists what was skipped as already held by artist and title, and a part with nothing keeps its line at 0', () => {
    const lines = reportLines(reportAllSkipped(report));
    expect(lines.map((l) => l.count)).toEqual([0, 9, 0]);
    expect(lines[1].items[0]).toBe('Astrid Sonne — Great Doubt');
    expect(lines[0].items).toEqual([]);
    expect(lines[2].items).toEqual([]);
  });
});

describe('failureSentence', () => {
  /* Fails against a report that drops a failed item: §9 says report what is broken plainly. */
  it('is null with nothing failed, and names each failed release with its reason', () => {
    expect(failureSentence(report)).toBeNull();
    const failed = { ...report, failed: [{ releaseId: 15661267, reason: 'Discogs answered 500' }] };
    expect(failureSentence(failed)).toBe('1 could not be imported: release 15661267 (Discogs answered 500).');
    const two = { ...report, failed: [...failed.failed, { releaseId: 1, reason: 'no answer' }] };
    expect(failureSentence(two)).toBe('2 could not be imported: release 15661267 (Discogs answered 500); release 1 (no answer).');
  });
});
