import { readFileSync } from 'node:fs';
import { normalizeCollectionItem } from '@/lib/discogs/collection';
import { mapCollectionItem } from '@/lib/discogs/collection-map';
import type { CollectionReport } from '@/lib/db/queries/collection-import';

/**
 * The report `POST /api/discogs/import-collection` would answer for
 * AdamPseudo's nine, built from the committed fixtures through the real
 * mapping, so what the Manage section is tested and captured against is
 * Adam's own collection as Discogs describes it, not an invented report.
 * The record ids are the one invention: the test database is not written.
 * `total` is Discogs' own count of the collection, from its page.
 */
const fixture = (name: string): unknown => JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8'));

export function collectionReportFromFixtures(): CollectionReport {
  const page = fixture('collection-page-1') as { pagination: { items: number }; releases: unknown[] };
  const imported = page.releases.map((raw, i) => {
    const item = normalizeCollectionItem(raw);
    const mapped = mapCollectionItem(fixture(`collection-release-${item.releaseId}`), item);
    return {
      releaseId: item.releaseId,
      recordId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      title: mapped.release.title ?? '',
      artist: mapped.release.artist ?? '',
      blank: mapped.blank,
      dropped: mapped.dropped,
      cover: 'attached',
    };
  });
  return { username: 'AdamPseudo', total: page.pagination.items, imported, skipped: [], failed: [] };
}

/** The second run's report: every one of the nine already here. */
export function reportAllSkipped(first: CollectionReport): CollectionReport {
  return {
    ...first,
    imported: [],
    skipped: first.imported.map((i) => ({ releaseId: i.releaseId, reason: 'already here' as const, title: i.title, artist: i.artist })),
  };
}
