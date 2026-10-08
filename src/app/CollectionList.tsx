'use client';

import Link from 'next/link';
import { LABEL } from './records/[id]/grid-type';
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

function Empty() {
  return (
    <div className="border border-border px-4 py-12 text-center">
      <p className="text-prose text-[oklch(0.44_0.008_70)]">No records yet.</p>
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
 * The grid view (SPEC.md §10's "Toggle grid ↔ table").
 *
 * Deliberately NOT a cover-art grid: images are step 8, and a grid of grey
 * placeholders is worse than no grid. This is a card per record — the same
 * facts as a table row, laid out so the title leads and scanning is vertical
 * rather than across columns.
 */
function Grid({ rows }: { rows: CollectionRow[] }) {
  return (
    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        const explanation = matchExplanation(row.matchedVia);

        return (
          <li key={row.id} className="border border-border p-3 transition-colors hover:bg-accent">
            <Link
              href={`/records/${row.id}`}
              className="text-detail font-medium underline-offset-2 hover:underline"
            >
              {row.title}
            </Link>
            <div className="text-detail text-[oklch(0.44_0.008_70)]">{row.artist.name}</div>

            {explanation !== undefined && (
              <div className="mt-0.5 text-detail text-[oklch(0.44_0.008_70)] italic">{explanation}</div>
            )}

            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 text-detail text-[oklch(0.44_0.008_70)]">
              <span className="font-mono tabular-nums">
                {row.releaseYear === null ? <Absent /> : formatYear(row.releaseYear)}
              </span>
              {row.format !== null && <span>{row.format.name}</span>}
              {row.label !== null && <span>{row.label.name}</span>}
              {row.conditionMedia !== null && <span className="font-mono">{row.conditionMedia}</span>}
              {/* Price last and pushed right: it is the field most often
                  absent, so a fixed position would leave a gap on most cards. */}
              {row.purchasePrice !== null && (
                <span className="ml-auto font-mono tabular-nums">
                  {formatPrice(row.purchasePrice)}
                </span>
              )}
            </div>
          </li>
        );
      })}
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
}: {
  rows: CollectionRow[];
  params: CollectionParams;
  view?: 'table' | 'grid';
}) {
  if (rows.length === 0) return <Empty />;
  if (view === 'grid') return <Grid rows={rows} />;

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

            return (
              <tr key={row.id} className="relative h-[44px]">
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
                  <div className="mt-0.5 text-detail text-[oklch(0.44_0.008_70)] md:hidden">
                    {[row.label?.name, row.conditionMedia]
                      .filter((value) => value !== null && value !== undefined)
                      .join(' · ')}
                  </div>
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
