import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { CollectionFilters } from './CollectionFilters';
import { CollectionList, type CollectionRow } from './CollectionList';
import { Shelf } from './shelf/Shelf';
import { CollectionPagination } from './CollectionPagination';
import { parseCollectionParams } from './collection-params';
import { listRecords, recordFacets } from '@/lib/db/queries/records';
import { shelfRecords } from '@/lib/db/queries/shelf';
import { DEFAULT_PAGE_SIZE, type Offset } from '@/lib/api/query-params';

/**
 * SPEC.md §10 `/`: the collection.
 *
 * Filters come from the URL (see collection-params.ts), so this component
 * re-runs with new `searchParams` on every control interaction and the query
 * runs on the server. There is no client-side copy of the rows to fall out of
 * step with the controls.
 */

export const metadata = { title: 'Collection · Record Collection' };

/**
 * Rendered per request. This page happens to be dynamic already because it
 * awaits `searchParams`, but relying on that is fragile: removing the filters
 * would silently make the collection stale, with nothing to notice it. See
 * /manage, where exactly that shipped.
 */
export const dynamic = 'force-dynamic';

/**
 * §5 caps pageSize at 200; 50 is the spec's default and the right size for a
 * screen — 200 rows is a scroll nobody reads, and unit 6 rendered exactly that
 * with a "showing the first N" apology instead of controls.
 */
const PAGE_SIZE = DEFAULT_PAGE_SIZE;

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
  /**
   * §10b's shelf reads a DIFFERENT query — grouped into genre sections and
   * unpaginated, because a wall is scanned whole rather than a page at a time.
   * Fetched only when it is the view in use, so the table and grid do not pay
   * for it.
   */
  const shelf = params.view === 'shelf' ? await shelfRecords() : null;

  const [records, facets] = await Promise.all([
    listRecords({
      limit: PAGE_SIZE,
      // The branded Offset is minted here from a bounded page number: parse
      // clamps `page` to a positive integer, so this cannot go negative.
      offset: ((params.page - 1) * PAGE_SIZE) as Offset,
      sort: params.sort,
      filters: params.filters,
    }),
    recordFacets(),
  ]);

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-6xl px-4 py-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">Collection</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {records.total === 1 ? '1 record' : `${records.total} records`}
            </p>
          </div>
          {/* The primary action, in the accent — the only place oxblood appears
              on this screen besides an active filter. */}
          <Link
            href="/records/new"
            className="shrink-0 rounded-xs bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-opacity hover:opacity-90"
          >
            Add record
          </Link>
        </header>

        <CollectionFilters
          params={params}
          undatedCount={records.undatedCount}
          options={facets}
        />

        {/*
          `view` is still honoured from the URL at any width — a grid link
          shared from a desktop opens as a grid. Only the CONTROL is hidden on
          small screens, so nothing becomes unreachable, and the CSS grid falls
          back to one column there anyway.
        */}
        {shelf === null ? (
          <>
            {/*
              Narrowed, not cast. `CollectionList` handles table and grid and
              the shelf is its SIBLING rather than a third case inside it — so
              the branch above is what proves `view` is not 'shelf' here, and
              widening that component's prop would let a shelf request reach a
              component with no way to render it.
            */}
            <CollectionList
              rows={records.rows as CollectionRow[]}
              view={params.view === 'grid' ? 'grid' : 'table'}
            />

            <CollectionPagination
              params={params}
              total={records.total}
              rows={records.rows.length}
              pageSize={PAGE_SIZE}
            />
          </>
        ) : (
          /*
            No pagination on the shelf, deliberately. §10b's wall is browsed by
            eye and a shelf that stopped at fifty records would be a claim about
            the collection's size rather than a view of it — the sections are
            the structure, and scrolling is how you reach the end.
          */
          <Shelf sections={shelf} />
        )}
      </main>
    </>
  );
}
