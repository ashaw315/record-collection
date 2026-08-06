import { AppHeader } from '@/components/AppHeader';
import { CollectionFilters } from './CollectionFilters';
import { CollectionList, type CollectionRow } from './CollectionList';
import { parseCollectionParams } from './collection-params';
import { listRecords } from '@/lib/db/queries/records';
import { listGenres } from '@/lib/db/queries/genres';
import { listLabels } from '@/lib/db/queries/labels';
import { listStores } from '@/lib/db/queries/stores';
import { listTags } from '@/lib/db/queries/tags';
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
const REFERENCE_PAGE = { limit: 200, offset: 0 as Offset };

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
   * The rows and the four chip lists in parallel — they are independent, and
   * awaiting them in sequence would make the page as slow as their sum.
   *
   * Reference data is small enough that one page of 200 covers it, the same
   * assumption /manage makes.
   */
  const [records, genres, labels, stores, tags] = await Promise.all([
    listRecords({
      limit: PAGE_SIZE,
      offset: 0 as Offset,
      sort: params.sort,
      filters: params.filters,
    }),
    listGenres(REFERENCE_PAGE),
    listLabels(REFERENCE_PAGE),
    listStores(REFERENCE_PAGE),
    listTags(REFERENCE_PAGE),
  ]);

  const named = (rows: Array<{ id: string; name: string }>) =>
    rows.map((row) => ({ id: row.id, name: row.name }));

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
          options={{
            genres: named(genres.rows),
            labels: named(labels.rows),
            stores: named(stores.rows),
            tags: named(tags.rows),
          }}
        />

        <CollectionList rows={records.rows as CollectionRow[]} />
      </main>
    </>
  );
}
