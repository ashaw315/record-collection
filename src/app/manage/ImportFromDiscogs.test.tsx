import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import '../../../test/component/next-navigation';
import { collectionReportFromFixtures } from '../../../test/fixtures/discogs/collection-report';
import { ImportFromDiscogs, ImportReport } from './ImportFromDiscogs';

/**
 * §T.6 (Design, 28 Oct, the rebuild), the import on Manage as first drawn:
 * before any run the control and the reserved failure slot and no report;
 * with a last run, its lines beneath the line naming when it finished,
 * four in one form, each list closed under §T.1's + and a part with
 * nothing at 0 and no +, the failed line a line and not an alert. The
 * interaction and the placement are the e2e spec's (`import-159.spec.ts`).
 */
const report = collectionReportFromFixtures();
const run = { report, finishedAt: '2026-10-28T21:05:00.000Z' };
const lineOf = (html: string, key: string) => {
  const chunk = html.split('<li data-import-line="').find((c) => c.startsWith(`${key}"`));
  if (chunk === undefined) throw new Error(`no line ${key} in ${html}`);
  return chunk;
};

describe('ImportFromDiscogs', () => {
  /* Fails against a report drawn before any run, or a failure slot that is not reserved. */
  it('before any run draws the control, the reserved failure slot empty, and no report', () => {
    const html = renderToStaticMarkup(<ImportFromDiscogs lastRun={null} />);
    expect(html.match(/Import from Discogs/g)).toHaveLength(2);
    expect(html).toMatch(/<p[^>]*role="status"[^>]*data-import-status=""[^>]*class="[^"]*min-h-\[1lh\][^"]*"[^>]*><\/p>/);
    expect(html).not.toContain('data-import-report');
    expect(html).not.toContain('Last import');
  });

  /* Fails against a last run not drawn on return, or drawn without the line that says which run it is. */
  it('with a last run draws its lines beneath the line naming when it finished', () => {
    const html = renderToStaticMarkup(<ImportFromDiscogs lastRun={run} />);
    expect(html).toContain('data-import-report');
    /* The wording is set in the browser's zone (`lastImportLine`, the e2e); the server sends the line's slot and the time it names. */
    expect(html).toMatch(/data-import-when=""[^>]*>\s*<time dateTime="2026-10-28T21:05:00\.000Z">/);
    expect([...html.matchAll(/data-import-line="(\w+)"/g)].map((m) => m[1])).toEqual(['complete', 'blank', 'skipped', 'failed']);
  });
});

describe('ImportReport', () => {
  /* Fails against another order, a list drawn open, or a mark on an empty part. */
  it('draws the four lines in order, each list closed under a + and the empty parts at 0 with no +', () => {
    const html = renderToStaticMarkup(<ImportReport run={run} />);
    const complete = lineOf(html, 'complete');
    expect(complete).toContain('4 came in complete');
    expect(complete).toMatch(/<details(?![^>]*\sopen)[^>]*>/);
    expect(complete).toMatch(/<svg[^>]*>[\s\S]*data-mark-line="down"/);
    expect(complete.match(/<li[ >]/g)).toHaveLength(4);
    expect(lineOf(html, 'blank')).toContain('5 came in with a field blank');
    for (const key of ['skipped', 'failed']) {
      const line = lineOf(html, key);
      expect(line).toContain(key === 'skipped' ? '0 skipped as already held' : '0 failed');
      expect(line).not.toContain('<details');
      expect(line).not.toContain('<svg');
    }
  });

  /* Fails against a failed item drawn as an alert, or dropped. */
  it('draws what failed as a line naming each release and its reason, never as an alert', () => {
    const html = renderToStaticMarkup(<ImportReport run={{ ...run, report: { ...report, imported: report.imported.slice(1), failed: [{ releaseId: 29613763, title: 'Great Doubt', artist: 'Astrid Sonne', reason: 'Discogs answered 500' }] } }} />);
    const failed = lineOf(html, 'failed');
    expect(failed).toContain('1 failed');
    expect(failed).toContain('Astrid Sonne — Great Doubt: Discogs answered 500');
    expect(html).not.toContain('role="alert"');
  });
});
