import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { collectionReportFromFixtures, reportAllSkipped } from '../../../test/fixtures/discogs/collection-report';
import { ImportFromDiscogs, ImportReport } from './ImportFromDiscogs';

/**
 * §T.6 (Design, 28 Oct), the import on Manage, as first drawn: the control
 * IMPORT FROM DISCOGS, a §9.3 label with its longer reading reserved so
 * IMPORTING… keeps its drawn width; the report three lines, each list
 * opening on §T.1's + and starting closed, a part with nothing at 0 and no +.
 * The interaction, the width and the placement are the e2e spec's
 * (`import-158.spec.ts`); this is the markup the server sends.
 */
const report = collectionReportFromFixtures();
/** One line's markup: from its own opening tag to the next line's. */
const lineOf = (html: string, key: string) => {
  const chunk = html.split('<li data-import-line="').find((c) => c.startsWith(`${key}"`));
  if (chunk === undefined) throw new Error(`no line ${key} in ${html}`);
  return chunk;
};

describe('ImportFromDiscogs, before any import', () => {
  /* Fails against a control drawn as a box, or one whose reading is not reserved: IMPORTING… would narrow it. */
  it('draws IMPORT FROM DISCOGS as a label with its own reading reserved beneath, enabled, and no report', () => {
    const html = renderToStaticMarkup(<ImportFromDiscogs />);
    expect(html).toMatch(/<section[^>]*data-testid="discogs-import"[^>]*class="[^"]*border-y[^"]*"/);
    expect(html.match(/Import from Discogs/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*data-import-control=""[^>]*>/);
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/);
    /* The control itself draws no box: its classes carry no border, where a §9.3 box's do. */
    const button = /<button[^>]*data-import-control=""[^>]*>/.exec(html)?.[0] ?? '';
    expect(button).not.toContain('border');
    expect(html).not.toContain('data-import-report');
    expect(html).not.toContain('Importing…');
  });
});

describe('ImportReport', () => {
  /* Fails against another order, a list drawn open, or a mark on the empty part. */
  it('draws the three lines in order, each list closed under a + and the empty part at 0 with no +', () => {
    const html = renderToStaticMarkup(<ImportReport report={report} />);
    expect([...html.matchAll(/data-import-line="(\w+)"/g)].map((m) => m[1])).toEqual(['imported', 'skipped', 'blank']);
    const imported = lineOf(html, 'imported');
    expect(imported).toContain('9 came in');
    expect(imported).toMatch(/<details(?![^>]*\sopen)[^>]*>/);
    expect(imported).toMatch(/<svg[^>]*>[\s\S]*data-mark-line="down"/);
    /* `<li[ >]`, not `<li`: the mark's `<line>` elements begin the same way. */
    expect(imported.match(/<li[ >]/g)).toHaveLength(9);
    const skipped = lineOf(html, 'skipped');
    expect(skipped).toContain('0 skipped as already held');
    expect(skipped).not.toContain('<details');
    expect(skipped).not.toContain('<svg');
    const blank = lineOf(html, 'blank');
    expect(blank).toContain('9 imported blank');
    expect(blank).toContain('MGMT — Loss Of Life: colour Hot Pink [Opaque]');
  });

  /* Fails against a second run drawn as a second report. */
  it('draws a run with everything already held as its one report', () => {
    const html = renderToStaticMarkup(<ImportReport report={reportAllSkipped(report)} />);
    expect(html.match(/data-import-report=""/g)).toHaveLength(1);
    expect(lineOf(html, 'imported')).toContain('0 came in');
    expect(lineOf(html, 'skipped')).toContain('9 skipped as already held');
  });

  /* Fails against a failure silently dropped from the report. */
  it('says what could not be imported, as an alert beneath the lines', () => {
    const html = renderToStaticMarkup(<ImportReport report={{ ...report, failed: [{ releaseId: 15661267, reason: 'Discogs answered 500' }] }} />);
    expect(html).toMatch(/role="alert"[^>]*>1 could not be imported: release 15661267 \(Discogs answered 500\)\./);
  });
});
