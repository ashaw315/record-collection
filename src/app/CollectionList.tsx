'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { GridCover } from './GridCover';
import { HAIRLINE, INK, LABEL, LABEL_TYPE } from './records/[id]/grid-type';
import { toQueryString, withFacet, type CollectionParams } from './collection-params';
import type { RecordSortField } from '@/lib/records/fields';
import { formatPrice, formatYear, matchExplanation, type MatchedVia } from './collection-format';

/**
 * The collection list (SPEC.md §10 `/`).
 *
 * A ledger table, matching `/manage`: hairline rules, ~40px rows, mono for
 * anything where a single character matters. Filters, sort and the grid toggle
 * are unit 7 — this renders what it is given.
 */

export type CollectionRow = {
  id: string;
  title: string;
  releaseYear: number | null;
  conditionMedia: string | null;
  purchasePrice: string | null;
  artist: { id: string; name: string };
  label: { id: string; name: string } | null;
  format: { id: string; name: string } | null;
  store: { id: string; name: string } | null;
  matchedVia: MatchedVia | null;
};

/**
 * What the empty state says is decided by the collection and not by the
 * page: with records in it and none shown, a filter, a search or a page
 * past the end emptied the list, and "No records yet." would be false. The
 * sentence then is the shelf's ruled one (§W.29), so the two screens say
 * the same thing. Design rules the final wording with step 103e.
 */
function Empty({ collectionTotal, params, figure }: { collectionTotal: number; params: CollectionParams; figure: ReactNode }) {
  /*
    §T.6: "'No records yet.' only where the collection is empty, which has
    no figure." Nothing to clear there either.
  */
  if (collectionTotal === 0) {
    return (
      <div data-collection-empty="" className="border border-border px-4 py-12 text-center">
        <p className="text-prose text-[oklch(0.44_0.008_70)]">No records yet.</p>
      </div>
    );
  }
  /* Every filter and the search go; the order and the view the reader chose stay, as on the shelf (§W.29). */
  const query = toQueryString({ ...params, filters: {}, page: 1 });
  return (
    /*
      Step 103e, §T.6: the figure "at the clearing height and no larger",
      above "one sentence saying what is empty and a §9.3 control that
      changes it". The block is the shelf's (step 104): the sentence in the
      label colour, 18, and the control. It stands in the list's place and
      is not a row or a cell of it.
    */
    <div data-collection-empty="" className="flex flex-col items-center gap-[18px] border border-border px-4 py-12 text-center">
      {figure !== null && figure !== undefined && <div data-collection-empty-figure="">{figure}</div>}
      <p className="text-detail text-[oklch(0.44_0.008_70)]">Nothing in the collection matches.</p>
      <Link
        data-collection-empty-clear=""
        href={query === '' ? '/' : `/?${query}`}
        className={`${LABEL_TYPE} ${INK} box-border flex h-[44px] cursor-pointer items-center justify-center border ${HAIRLINE} px-[18px] decoration-1 underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`}
      >
        Clear filters
      </Link>
    </div>
  );
}

/**
 * The absent marker, in the SANS face even inside a mono column.
 *
 * The numeric columns are mono for digit alignment, but a placeholder is not a
 * digit and Geist Mono draws U+2014 markedly narrower than Inter Tight — so the
 * same character rendered in two columns looked like two different characters.
 * Measured in the browser rather than guessed: both are U+2014, one in each
 * face.
 */
function Absent() {
  return <span className="font-sans text-[oklch(0.44_0.008_70)]">—</span>;
}

/**
 * The grid view (§T.5): each record is its cover in a square, with its
 * title in 13 ink and its artist as an 11 label beneath, and nothing else.
 * The whole cell is one link, by the title's link laid over it, as a table
 * row is.
 *
 * "Covers are 24 apart, inset 20 a side from the window, at least two to a
 * row, and as many as fit at 160 or wider." The column's least width is
 * 160, or half the row less the gap where the window cannot hold two of
 * 160, which is how the two-column minimum wins at 320. A cover's width is
 * then decided by the window and never by a breakpoint: another joins the
 * row at each width where one more 160 and its 24 fit.
 */
function Grid({ rows, covers }: { rows: CollectionRow[]; covers: Readonly<Record<string, string>> }) {
  return (
    <ul
      data-collection-grid=""
      className="grid gap-x-[24px] gap-y-[24px]"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, calc((100% - 24px) / 2)), 1fr))' }}
    >
      {rows.map((row) => (
        <li key={row.id} className="relative min-w-0">
          <GridCover url={covers[row.id] ?? null} />
          <Link
            data-grid-title=""
            href={`/records/${row.id}`}
            className="mt-2 block text-detail outline-none after:absolute after:inset-0 after:box-border after:content-[''] focus-visible:after:border-2 focus-visible:after:border-background focus-visible:after:shadow-[inset_0_0_0_2px_var(--foreground)]"
          >
            {row.title}
          </Link>
          <div data-grid-artist="" className={LABEL}>
            {row.artist.name}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** §W.27's surface one step below paper: what a row sinks to under a pointer (§T.4). */
const ROW_SURFACE = 'oklch(0.731 0.004 80)';
const INK_VALUE = 'oklch(0.19 0.008 60)';

/** The three sort orders that have a column to carry them (§T.4). Date bought and Artist have none, which is why the Sort control stays. */
const HEADER_SORT: Partial<Record<string, RecordSortField>> = { Record: 'title', Year: 'releaseYear', Paid: 'purchasePrice' };

const COLUMNS = [
  { name: 'Record', align: 'left', show: '' },
  { name: 'Label', align: 'left', show: 'hidden md:table-cell' },
  { name: 'Format', align: 'left', show: '' },
  { name: 'Year', align: 'right', show: '' },
  { name: 'Cond.', align: 'left', show: 'hidden sm:table-cell' },
  { name: 'Paid', align: 'right', show: '' },
] as const;

/**
 * A column header (§T.4): an 11 label, and where its column is a sort
 * order, the control for it. The sorted one is marked as §3 marks the
 * current one of a set, ink with the 2px underline, and an arrow after the
 * label gives the direction. Pressing the sorted header reverses it;
 * pressing another sorts ascending. A link, so it works with scripts off.
 */
function Header({ column, params }: { column: (typeof COLUMNS)[number]; params: CollectionParams }) {
  const field = HEADER_SORT[column.name];
  const sorted = field !== undefined && params.sort?.field === field ? params.sort.direction : undefined;
  const cell = `${headCell} ${column.show} ${column.align === 'right' ? 'pl-4 text-right' : column.name === 'Record' ? 'text-left' : 'pl-4 text-left'}`;

  if (field === undefined) {
    return (
      <th scope="col" className={cell}>
        <span className={LABEL}>{column.name}</span>
      </th>
    );
  }

  const next = withFacet(params, { sort: { field, direction: sorted === 'asc' ? 'desc' : 'asc' } });
  const query = toQueryString(next);
  return (
    <th scope="col" className={cell} aria-sort={sorted === undefined ? undefined : sorted === 'asc' ? 'ascending' : 'descending'}>
      <Link
        data-sort-header=""
        href={query === '' ? '/' : `/?${query}`}
        className={`flex h-[44px] items-center ${column.align === 'right' ? 'justify-end' : ''} ${LABEL}`}
        style={sorted === undefined ? undefined : { color: INK_VALUE }}
      >
        <span data-sort-name="" className={sorted === undefined ? '' : 'underline decoration-2 underline-offset-[7px]'}>
          {column.name}
        </span>
        {sorted !== undefined && <span className="whitespace-pre">{sorted === 'asc' ? ' ↑' : ' ↓'}</span>}
      </Link>
    </th>
  );
}

export function CollectionList({
  rows,
  params,
  view = 'table',
  covers = {},
  collectionTotal,
  emptyFigure = null,
}: {
  rows: CollectionRow[];
  params: CollectionParams;
  view?: 'table' | 'grid';
  /** The grid's covers, by record id: each record's newest (§61). Absent for a record with none. */
  covers?: Readonly<Record<string, string>>;
  /** The whole collection's size, whatever is filtered: what the empty state's sentence turns on. */
  collectionTotal: number;
  /** §T.6's figure for the empty state, drawn by the page from the one source record; none where the collection is empty. */
  emptyFigure?: ReactNode;
}) {
  if (rows.length === 0) return <Empty collectionTotal={collectionTotal} params={params} figure={emptyFigure} />;
  if (view === 'grid') return <Grid rows={rows} covers={covers} />;

  return (
    <div data-collection-table="">
      {/*
        §T.4. Nothing here scrolls sideways: a scrolling box would also stop
        the header row sticking to the viewport. The hover surface is a
        plain rule so it is the value as written and not a compiled one.
      */}
      <style>{`[data-collection-table] tbody tr:hover { background: ${ROW_SURFACE}; }`}</style>
      <table className="w-full border-collapse text-detail">
        <caption className="sr-only">Records in the collection</caption>
        <thead>
          <tr>
            {COLUMNS.map((column) => (
              <Header key={column.name} column={column} params={params} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const explanation = matchExplanation(row.matchedVia);
            /* Drawn only when it has text: empty, its 2px margin made the row 46 for nothing (step 100). */
            const narrowLine = [row.label?.name, row.conditionMedia]
              .filter((value) => value !== null && value !== undefined)
              .join(' · ');

            return (
              /*
                The identity transform is what holds the link's box to the
                row. Safari did not make a positioned `<tr>` a containing
                block (WebKit bug 240961), so there every row's box was laid
                over the first screenful and the last row's took every press
                (step 105). A transformed element is a containing block in
                every engine. `relative` stays for the engines that honour it.
              */
              <tr key={row.id} className="relative h-[44px] [transform:translate(0)]">
                <td className={`${cell} text-left`}>
                  {/*
                    §T.4: "a row is one link to its record", which is why
                    the 44 floor reaches it. The link is the title, and its
                    area is the row's: an empty box laid over the row, so a
                    press anywhere on it is a press on the title. Keyboard
                    focus is §M.6's ring on that same box, inside the row.
                  */}
                  <Link
                    href={`/records/${row.id}`}
                    className="font-medium outline-none after:absolute after:inset-0 after:box-border after:content-[''] focus-visible:after:border-2 focus-visible:after:border-background focus-visible:after:shadow-[inset_0_0_0_2px_var(--foreground)]"
                  >
                    {row.title}
                  </Link>
                  <div className="text-[oklch(0.44_0.008_70)]">{row.artist.name}</div>

                  {/* Why this record is here under a genre filter (§5.2). It
                      sits with the record rather than in its own column
                      because it is only ever present on some rows. */}
                  {explanation !== undefined && (
                    <div className="mt-0.5 text-detail text-[oklch(0.44_0.008_70)] italic">
                      {explanation}
                    </div>
                  )}

                  {/*
                    The columns hidden at narrow widths reappear here rather than
                    being dropped — §10 makes mobile an equal priority, and a
                    phone showing less DATA is a different app.

                    **`md:hidden`, matching the LAST column it stands in for.**
                    It was `sm:hidden` while the label column was
                    `hidden md:table-cell`, so between 640 and 767px the label
                    was in neither and vanished with no indication — on a table
                    whose dash means "not recorded". The rule this encodes: this
                    line must hide at the widest breakpoint of any column it
                    substitutes for, never the narrowest.

                    Format is no longer listed here: it is now a real column at
                    every width, and printing it twice below md was redundant.
                  */}
                  {narrowLine !== '' && (
                    <div className="mt-0.5 text-detail text-[oklch(0.44_0.008_70)] md:hidden">{narrowLine}</div>
                  )}
                </td>

                <td className={`${cell} hidden pl-4 text-left text-[oklch(0.44_0.008_70)] md:table-cell`}>
                  {row.label === null ? <Absent /> : row.label.name}
                </td>
                <td className={`${cell} pl-4 text-left text-[oklch(0.44_0.008_70)]`}>
                  {row.format === null ? <Absent /> : row.format.name}
                </td>
                <td className={`${cell} pl-4 text-right tabular-nums`}>
                  {row.releaseYear === null ? <Absent /> : formatYear(row.releaseYear)}
                </td>
                <td className={`${cell} hidden pl-4 text-left sm:table-cell`}>
                  {row.conditionMedia === null ? <Absent /> : row.conditionMedia}
                </td>
                <td className={`${cell} pl-4 text-right tabular-nums`}>
                  {row.purchasePrice === null ? <Absent /> : formatPrice(row.purchasePrice)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* Sticks to the top of the viewport: the app's header scrolls away (§G.6), so nothing is above it. On paper, so rows pass beneath unseen. */
const headCell = 'sticky top-0 z-10 h-[44px] border-b border-border bg-background py-0 align-middle font-normal';

/* Two lines of 13 at 1.5 are 39; 2 above, 2 below and the hairline make the 44. A third line makes the row taller, never tighter. */
const cell = 'border-b border-border py-[2px] align-middle';
