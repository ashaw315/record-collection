import type { ShelfRecord } from '@/lib/db/queries/shelf';
import type { WallSeat } from './shelf-runs';
import { spineLabel } from './spine-text';
import { factPanel } from './panel';
import { recordSummary, type RecordSummary } from './summary';

/**
 * The wall on the database (§11.7, step 5). `shelfRecords` produces the
 * seats and the panel's summaries alike, in one order — the order the
 * keyboard walks, the arrows follow and the links carry. A second producer
 * for any of those is how the three would drift.
 */
export function wallSeats(records: readonly ShelfRecord[]): WallSeat[] {
  return records.map((record) => ({
    id: record.id,
    ...(record.matches ? {} : { empty: true }),
    section: String(record.sectionIndex),
    label: spineLabel(record.artistName, record.title),
    title: record.title,
    artist: record.artistName,
    spineColour: record.spineColour,
    coverUrl: record.coverUrl,
    backUrl: record.backUrl,
    labelName: record.labelName,
    catalogNumber: record.catalogNumber,
  }));
}

export function wallSummaries(records: readonly ShelfRecord[]): Record<string, RecordSummary> {
  return Object.fromEntries(records.map((record) => [record.id, recordSummary(factPanel(record), record.id)]));
}
