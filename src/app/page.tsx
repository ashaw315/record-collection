import { AppHeader } from '@/components/AppHeader';
import { CollectionFilters } from './CollectionFilters';
import { CollectionList, type CollectionRow } from './CollectionList';
import { parseCollectionParams } from './collection-params';
import { listRecords, recordFacets } from '@/lib/db/queries/records';
import type { Offset } from '@/lib/api/query-params';

/**
 * SPEC.md §10 `/`: the collection.
 *
 * Filters come from the URL (see collection-params.ts), so this component
 * re-runs with new `searchParams` on every control interaction and the query
 * runs on the server. There is no client-side copy of the rows to fall out of
 * step with the controls.
 */

export const metadata = { title: 'Collection · Record Collection' };

const PAGE_SIZE = 200;

/**
 * Next hands `searchParams` as a record whose values may be arrays, because
 * `?genreId=a&genreId=b` is legal. Every filter here is single-valued, so the
 * FIRST occurrence wins rather than the last: a URL that repeats a key is
 * malformed for this screen, and taking the first makes it deterministic
 * instead of dependent on ordering.
 */
function toSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') search.set(key, value);
    else if (Array.isArray(value) && value.length > 0) search.set(key, value[0]);
  }

  return search;
}

export default async function CollectionPage({ searchParams }: PageProps<'/'>) {
  const params = parseCollectionParams(toSearchParams(await searchParams));

  /**
   * The rows and the facets in parallel — independent, and awaiting them in
   * sequence would make the page as slow as their sum.
   *
   * Facets rather than the reference tables (§5.2). The chips previously
   * rendered `listGenres({ limit: 200 })` and friends, which had two defects:
   * a chip for a genre no record has returns zero rows when clicked, and past
   * 200 reference rows the newest chips silently did not render at all.
   */
  const [records, facets] = await Promise.all([
    listRecords({
      limit: PAGE_SIZE,
      offset: 0 as Offset,
      sort: params.sort,
      filters: params.filters,
    }),
    recordFacets(),
  ]);

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <header className="mb-5">
          <h1 className="font-heading text-xl font-semibold tracking-tight">Collection</h1>
          <p className="mt-0.5 text-sm text-muted-foreground" aria-live="polite">
            {records.total === 1 ? '1 record' : `${records.total} records`}
            {records.rows.length < records.total
              ? ` · showing the first ${records.rows.length}`
              : ''}
          </p>
        </header>

        <CollectionFilters
          params={params}
          undatedCount={records.undatedCount}
          options={facets}
        />

        <CollectionList rows={records.rows as CollectionRow[]} />
      </main>
    </>
  );
}
