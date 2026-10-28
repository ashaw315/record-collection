import type { CollectionReport, FailedItem, ImportedItem, SkippedItem } from '@/lib/db/queries/collection-import';

/**
 * §T.6 (Design, 28 Oct, the rebuild): the import's report "is four lines in
 * one form, each release on exactly one of them: what came in complete,
 * what came in with a field blank, what was skipped as already held, and
 * what failed, each with its count. A release that came in blank is not
 * also counted as came in, so the lines partition the run." This is the
 * order the lines are drawn in, not the import's order. Derived here, pure;
 * the section draws these and nothing else. A failed item is a line, never
 * an alert: the run succeeded and some items did not.
 */
export type ReportLine = { key: 'complete' | 'blank' | 'skipped' | 'failed'; sentence: string; count: number; items: string[] };

/** The column's name in the reader's words: the report lists what was left blank, not which column. */
const FIELD_WORDS: Record<string, string> = { format: 'format', color_variant: 'colour', year_pressed: 'year' };

const name = (item: Pick<ImportedItem | SkippedItem | FailedItem, 'artist' | 'title'>) => `${item.artist ?? ''} — ${item.title ?? ''}`.trim();

export function reportLines(report: CollectionReport): ReportLine[] {
  const complete = report.imported.filter((item) => item.blank.length === 0);
  const blank = report.imported.filter((item) => item.blank.length > 0);
  return [
    { key: 'complete', sentence: `${complete.length} came in complete`, count: complete.length, items: complete.map(name) },
    {
      key: 'blank',
      sentence: `${blank.length} came in with a field blank`,
      count: blank.length,
      items: blank.map((item) => `${name(item)}: ${item.blank.map((b) => `${FIELD_WORDS[b.field] ?? b.field} ${b.value}`).join('; ')}`),
    },
    { key: 'skipped', sentence: `${report.skipped.length} skipped as already held`, count: report.skipped.length, items: report.skipped.map(name) },
    { key: 'failed', sentence: `${report.failed.length} failed`, count: report.failed.length, items: report.failed.map((item) => `${name(item)}: ${item.reason}`) },
  ];
}

/**
 * The line naming when the last run finished, in §T.6's proposed wording,
 * "Last import, 28 October, 14:05", in the zone it is read in: the server's
 * clock is UTC and Adam's is not, so the browser formats it.
 */
export function lastImportLine(finishedAt: string, timeZone?: string): string {
  const at = new Date(finishedAt);
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone }).format(at);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(at);
  return `Last import, ${date}, ${time}`;
}
