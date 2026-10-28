import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectionReportFromFixtures, reportAllSkipped } from '../../../test/fixtures/discogs/collection-report';
import { lastImportLine, reportLines } from './import-report';

/**
 * §T.6 (Design, 28 Oct, the rebuild): the import's report "is four lines in
 * one form, each release on exactly one of them: what came in complete,
 * what came in with a field blank, what was skipped as already held, and
 * what failed, each with its count. A release that came in blank is not
 * also counted as came in, so the lines partition the run." Drawn in that
 * order, which is not the import's order. Derived here, pure.
 */
const report = collectionReportFromFixtures();
/** Discogs' own count of the collection, read from its answer and not from anything the import computed. */
const DISCOGS_HOLDS = (JSON.parse(readFileSync('test/fixtures/discogs/collection-page-1.json', 'utf8')) as { pagination: { items: number } }).pagination.items;

describe('reportLines', () => {
  /* Fails against the three lines of step 158, against another order, or against a blank release counted twice. */
  it('gives the four lines in the drawn order, each with its count, and the counts partition what Discogs holds', () => {
    const lines = reportLines(report);
    expect(lines.map((l) => l.key)).toEqual(['complete', 'blank', 'skipped', 'failed']);
    expect(lines.map((l) => l.sentence)).toEqual(['4 came in complete', '5 came in with a field blank', '0 skipped as already held', '0 failed']);
    expect(lines.reduce((n, l) => n + l.count, 0)).toBe(DISCOGS_HOLDS);
    const named = lines.flatMap((l) => l.items.map((i) => i.split(':')[0]));
    expect(new Set(named).size, 'each release on exactly one line').toBe(named.length);
  });

  /* Fails against a complete line that lists a blank release, or a blank line that lists the colour of a text that gave its weight. */
  it('lists what came in complete, and what came in blank with the field in words and the value Discogs had', () => {
    const [complete, blank] = reportLines(report);
    expect(complete.items).toEqual(['Astrid Sonne — Great Doubt', 'Pharoah Sanders — Jewels Of Thought', 'Mandy, Indiana — URGH', 'Parquet Courts — Sunbathing Animal']);
    expect(blank.items).toEqual([
      'OutKast — ATLiens: year 0',
      'Kim Gordon — The Collective: format Vinyl×1 LP/Album/Stereo + Vinyl×1 7"/45 RPM/Stereo + All Media×1 Deluxe Edition/Reissue; colour Silver',
      'MGMT — Loss Of Life: colour Hot Pink [Opaque]',
      '999 — The Biggest Prize In Sport: colour Green',
      'Cindy Lee — Diamond Jubilee: format Vinyl×3 LP/Album/Stereo',
    ]);
  });

  /* Fails against a skipped or failed list that names a release by its id alone. */
  it('names what was skipped and what failed by artist and title, the failed with its reason, and a part with nothing keeps its line at 0', () => {
    const skipped = reportLines(reportAllSkipped(report));
    expect(skipped.map((l) => l.count)).toEqual([0, 0, 9, 0]);
    expect(skipped[2].items[0]).toBe('Astrid Sonne — Great Doubt');
    const failed = reportLines({ ...report, imported: report.imported.slice(1), failed: [{ releaseId: 29613763, title: 'Great Doubt', artist: 'Astrid Sonne', reason: 'Discogs answered 500' }] });
    expect(failed.map((l) => l.count)).toEqual([3, 5, 0, 1]);
    expect(failed[3].items).toEqual(['Astrid Sonne — Great Doubt: Discogs answered 500']);
  });
});

describe('lastImportLine', () => {
  /* Fails against the time drawn in the server's zone, or the date in another form than the proposed one. */
  it('names when the run finished, in the proposed form, in the zone it is read in', () => {
    expect(lastImportLine('2026-10-28T21:05:00.000Z', 'America/Los_Angeles')).toBe('Last import, 28 October, 14:05');
    expect(lastImportLine('2026-10-28T21:05:00.000Z', 'Europe/London')).toBe('Last import, 28 October, 21:05');
    expect(lastImportLine('2026-03-01T08:07:00.000Z', 'UTC')).toBe('Last import, 1 March, 08:07');
  });
});
