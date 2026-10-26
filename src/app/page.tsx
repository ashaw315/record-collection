import { AppHeader } from '@/components/AppHeader';
import { CollectionBand } from './CollectionBand';
import { CollectionFilters } from './CollectionFilters';
import { LABEL } from './records/[id]/grid-type';
import { WallRail } from './WallRail';
import { activeFilterCount } from './active-filters';
import { collectionCountLabel } from './collection-count';
import { CollectionList, type CollectionRow } from './CollectionList';
import { WallUrlState } from './WallUrlState';
import { wallSeats, wallSummaries } from './wall/producer';
import { CollectionPagination } from './CollectionPagination';
import { parseCollectionParams } from './collection-params';
import { ShelfAddress } from './ShelfAddress';
import { shelfOfferedQuery } from './wall/view-fork';
import { listRecords, listRecordAges, recordFacets, countAllRecords, spineColoursOf } from '@/lib/db/queries/records';
import { ConstructionStill } from './records/[id]/ConstructionStill';
import { figureSource } from './figure-source';
import { sidebarRules } from './sidebar-layout';
import { AddRecord } from './AddRecord';
import { shelfRecords } from '@/lib/db/queries/shelf';
import { newestCoverUrls } from '@/lib/db/queries/images';
import { DEFAULT_PAGE_SIZE, type Offset } from '@/lib/api/query-params';
import { CONTENT_INSET } from './screen-frame';
import { EmptyFigure } from './EmptyFigure';
import { PickControl } from './PickControl';

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
  const shelf = params.view === 'shelf' ? await shelfRecords(params.filters, params.sort) : null;

  /*
    `collectionTotal` is the UNFILTERED grand total — the "M" in "N of M
    records" the heading shows when a filter is active. In parallel with the
    rows and facets so it adds no latency; a bare count(*) is cheap.
  */
  const [records, facets, collectionTotal] = await Promise.all([
    listRecords({
      limit: PAGE_SIZE,
      // The branded Offset is minted here from a bounded page number: parse
      // clamps `page` to a positive integer, so this cannot go negative.
      offset: ((params.page - 1) * PAGE_SIZE) as Offset,
      sort: params.sort,
      filters: params.filters,
    }),
    recordFacets(),
    countAllRecords(),
  ]);

  /*
    §T.6's one source record, for the table's and the grid's heading figure
    (step 103d): chosen from the whole collection, so no filter, order or
    page moves it. The shelf is not reached by §T.6 and does not pay for it.
  */
  /*
    Step 134: where the address names no view the grid is carried beside the
    shelf, for the window that is not offered one. It is the grid as
    `?view=grid` would give it, so its own links name it, and from here on
    the heading figure and the covers are fetched for the shelf's address
    too: the page no longer knows which of the two will be seen.
  */
  const gridParams = shelf === null ? params : { ...params, view: 'grid' as const };
  const source = figureSource(await listRecordAges());
  /*
    Step 113, from Adam's wireframe: "The figure is the source record's
    construction in that record's tint... The tint is the source record's,
    so the whole figure belongs to one record and nothing changes on a
    re-sort." A source with no cover has no colour and draws in ink (§5.3).
  */
  const tint = source === null ? null : ((await spineColoursOf([source.id]))[0] ?? null);
  const figure = source === null ? null : { clearing: source.clearing, aspect: source.aspect };
  const still = source === null ? null : <ConstructionStill recordId={source.id} spineColour={tint} />;

  /*
    §T.5: the grid shows each record's cover, the newest by §61. Asked for
    the records on this page only, and only by the grid, so the table and
    the shelf do not pay for it and the records endpoint keeps its shape.
  */
  const covers = gridParams.view === 'grid' ? Object.fromEntries(await newestCoverUrls(records.rows.map((row) => row.id))) : {};

  return (
    <>
      <AppHeader />

      {/*
        Step 134, §W.24: "The shelf is offered only where the window is 1044
        or wider and the primary pointer is fine; under a coarse pointer at
        any width, the Collection opens on the grid." Neither the width nor
        the pointer is the server's to know, and both are a media query's.
        So an address that names no view carries the shelf AND the grid, and
        the window shows one: the first paint is right, scripting off is
        right, Back is right, and widening brings the shelf back, with
        nothing stored. An address that names the grid or the table carries
        that view alone. SHELF leaves the view names by the same query.
        `main >` is for weight: the sidebar's own rules give the grid's root
        a display from 1044 up, later in the document, and won at 1440.
      */}
      <style data-shelf-offer="">{`@media ${shelfOfferedQuery()} { main > [data-shelf-fallback] { display: none; } }
@media not all and ${shelfOfferedQuery()} { [data-shelf-offered], [data-view-name="shelf"] { display: none; } }`}</style>
      <ShelfAddress />

      <main>
      {shelf !== null ? (
        /*
          §W.13: the header band is withdrawn on the shelf view. The wall
          starts directly under the app nav and takes the full height; the
          page's controls go down a 148px rail on the left, and COLLECTION with
          the count stays at the facts column's head (§W.9) — the header's
          Collection and count were the duplicate, and they are the instance
          that goes.
        */
        <div data-shelf-offered="">
          <WallUrlState
            params={params}
            seats={wallSeats(shelf)}
            summaries={wallSummaries(shelf)}
            countLine={
              activeFilterCount(params) > 0
                ? collectionCountLabel({ matched: shelf.filter((record) => record.matches).length, total: collectionTotal, filtered: true })
                : null
            }
            rail={<WallRail params={params} genres={facets.genres} pick={<PickControl />} />}
          />
        </div>
      ) : null}
        <div data-collection-views="" data-shelf-fallback={shelf !== null ? '' : undefined}>
          {/*
            Step 113, §T.1: above the fork "the table and grid have a sidebar
            336 wide, closed by a full-height 1px rule, and a content column
            beside it". The sidebar's contents are, in the wireframe's order,
            what stood above the table in the same order: the band's search
            and view names, the count and heading, Sort and the filters. So
            the page is one document at every width, and the fork is in the
            stylesheet (`sidebar-layout.ts`) and nowhere else.
          */}
          <style>{sidebarRules(figure)}</style>
          <aside data-collection-sidebar="">
            {/* §T.1: the shelf's band. Below the fork it is the two-row band, with Add record at its right; above, search over the view names. */}
            <CollectionBand params={gridParams} genres={facets.genres} idPrefix={shelf !== null ? 'grid-' : undefined} />
            <div data-collection-controls="" className={CONTENT_INSET}>
              <header data-collection-heading="" className="mb-5">
                {/*
                  §T.3: the count directly above the heading, an 11 label over
                  a 40, small first and nothing between. Filter-aware: "34 of
                  312 records" when a filter is active.
                */}
                <p data-collection-count="" className={LABEL}>
                  {collectionCountLabel({
                    matched: records.total,
                    total: collectionTotal,
                    filtered: activeFilterCount(gridParams) > 0,
                  })}
                </p>
                <h1 className="font-heading text-headline font-semibold tracking-tight">Collection</h1>
              </header>

              <CollectionFilters params={gridParams} undatedCount={records.undatedCount} options={facets} />
              {/* Target §P.5: "beneath the last filter line, after a hairline: in the sidebar above the sidebar fork, and in the band below it." */}
              <PickControl ruled />
            </div>
            {/*
              §T.6: "The second figure is a fragment of the same construction
              in the same tint. It sits 24 below the last filter line, or
              below an open container, bleeding off the window's left edge
              and cut at the sidebar's rule... and the reader scrolls to it."
              In the sidebar's flow, so it is beneath whatever is last.
            */}
            {still !== null && (
              <div data-sidebar-fragment="" aria-hidden="true">
                <i data-diagonal="fragment-rule" />
                <i data-diagonal="fragment-air" />
                <div data-fragment-figure="">{still}</div>
              </div>
            )}
          </aside>

          <div data-collection-content="" className={`${CONTENT_INSET} pb-6`}>
            {/*
              The content column's head, above the fork only: ADD RECORD at
              its top right and the head figure centred in the column, "the
              head [being] that height plus 24 above and below". "The empty
              state's figure is this construction... and the head figure is
              not drawn while it shows."
            */}
            <div data-collection-head="">
              <AddRecord />
              {source !== null && still !== null && records.rows.length > 0 && (
                <>
                  <i data-diagonal="head-air" aria-hidden="true" />
                  <i data-diagonal="head-rule" aria-hidden="true" />
                  <div data-head-figure="" data-record={source.id} data-clearing={source.clearing} data-aspect={source.aspect} data-first-draws={source.firstDraws} data-tint={tint ?? ''} aria-hidden="true">
                    {still}
                  </div>
                </>
              )}
            </div>

            {/*
              Narrowed, not cast. `CollectionList` handles table and grid and the
              shelf is its SIBLING rather than a third case inside it — so the
              branch above is what proves `view` is not 'shelf' here.
            */}
            <CollectionList rows={records.rows as CollectionRow[]} params={gridParams} covers={covers} view={gridParams.view === 'grid' ? 'grid' : 'table'} collectionTotal={collectionTotal}
              emptyFigure={
                /* "At the clearing height and no larger", in the source's tint. */
                <EmptyFigure source={source} tint={tint} />
              }
            />

            <CollectionPagination params={gridParams} total={records.total} rows={records.rows.length} pageSize={PAGE_SIZE} />
          </div>
        </div>
      </main>
    </>
  );
}