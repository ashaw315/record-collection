import type { CollectionReport, ImportedItem, SkippedItem } from '@/lib/db/queries/collection-import';

/**
 * §T.6 (Design, 28 Oct): the import's report on Manage "is three lines in
 * the order the import reports: what came in, what was skipped as already
 * held, and what imported blank, each with its count." Derived here, pure,
 * from the route's report; the section draws these and nothing else.
 *
 * A failed item is not one of the three, and §T.6 does not rule it; §9 says
 * what is broken is reported plainly, so it is a sentence beneath the lines
 * in the section's alert, never dropped (Design asked, 28 Oct, to be told).
 */
export type ReportLine = { key: 'imported' | 'skipped' | 'blank'; sentence: string; count: number; items: string[] };

/** The column's name in the reader's words: the report lists what was left blank, not which column. */
const FIELD_WORDS: Record<string, string> = { format: 'format', color_variant: 'colour', year_pressed: 'year' };

const name = (item: Pick<ImportedItem, 'artist' | 'title'> | Pick<SkippedItem, 'artist' | 'title'>) => `${item.artist ?? ''} — ${item.title ?? ''}`.trim();

export function reportLines(report: CollectionReport): ReportLine[] {
  const blank = report.imported.filter((item) => item.blank.length > 0);
  return [
    { key: 'imported', sentence: `${report.imported.length} came in`, count: report.imported.length, items: report.imported.map(name) },
    { key: 'skipped', sentence: `${report.skipped.length} skipped as already held`, count: report.skipped.length, items: report.skipped.map(name) },
    {
      key: 'blank',
      sentence: `${blank.length} imported blank`,
      count: blank.length,
      items: blank.map((item) => `${name(item)}: ${item.blank.map((b) => `${FIELD_WORDS[b.field] ?? b.field} ${b.value}`).join('; ')}`),
    },
  ];
}

export function failureSentence(report: CollectionReport): string | null {
  if (report.failed.length === 0) return null;
  return `${report.failed.length} could not be imported: ${report.failed.map((f) => `release ${f.releaseId} (${f.reason})`).join('; ')}.`;
}
