import { AppHeader } from '@/components/AppHeader';
import { CollectionList, type CollectionRow } from './CollectionList';
import { listRecords } from '@/lib/db/queries/records';
import type { Offset } from '@/lib/api/query-params';

/**
 * SPEC.md §10 `/`: the collection.
 *
 * Rows are read HERE, on the server, and handed down as props — the same shape
 * as `/manage`. The page is behind auth, the query layer is `server-only`, and
 * the first paint carries data instead of a spinner.
 *
 * Filters, search, sort and the grid/table toggle are unit 7. This unit is the
 * shell and the list.
 */

export const metadata = { title: 'Collection · Record Collection' };

/**
 * One page, at §5's cap. Paging controls arrive with the filters in unit 7;
 * until then a collection larger than this would silently show only part of
 * itself, so the count below states the total and what is on screen.
 */
const PAGE = { limit: 200, offset: 0 as Offset };

export default async function CollectionPage() {
  const { rows, total } = await listRecords({ ...PAGE, filters: {} });

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <header className="mb-5">
          <h1 className="font-heading text-xl font-semibold tracking-tight">Collection</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total === 1 ? '1 record' : `${total} records`}
            {rows.length < total ? ` · showing the first ${rows.length}` : ''}
          </p>
        </header>

        <CollectionList rows={rows as CollectionRow[]} />
      </main>
    </>
  );
}
