'use client';

import Link from 'next/link';
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
      <p className="text-sm text-muted-foreground">No records yet.</p>
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
  return <span className="font-sans text-muted-foreground">—</span>;
}

export function CollectionList({ rows }: { rows: CollectionRow[] }) {
  if (rows.length === 0) return <Empty />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Records in the collection</caption>
        <thead>
          <tr className="border-b border-border">
            {/* Right-aligned headers on the numeric columns, so the label sits
                over the digits rather than away from them. */}
            <th scope="col" className={headCell}>
              Record
            </th>
            <th scope="col" className={`${headCell} hidden md:table-cell`}>
              Label
            </th>
            <th scope="col" className={`${headCell} hidden sm:table-cell`}>
              Format
            </th>
            <th scope="col" className={`${headCell} text-right`}>
              Year
            </th>
            <th scope="col" className={`${headCell} hidden sm:table-cell text-right`}>
              Cond.
            </th>
            <th scope="col" className={`${headCell} text-right`}>
              Paid
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const explanation = matchExplanation(row.matchedVia);

            return (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-accent">
                <td className="px-3 py-2 align-top">
                  {/* The whole row is not a link: a <tr> cannot contain one
                      validly, and wrapping every cell makes text unselectable.
                      The title is the affordance. */}
                  <Link
                    href={`/records/${row.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {row.title}
                  </Link>
                  <div className="text-muted-foreground">{row.artist.name}</div>

                  {/* Why this record is here under a genre filter (§5.2). It
                      sits with the record rather than in its own column
                      because it is only ever present on some rows. */}
                  {explanation !== undefined && (
                    <div className="mt-0.5 text-xs text-muted-foreground italic">
                      {explanation}
                    </div>
                  )}

                  {/* The columns hidden at narrow widths reappear here rather
                      than being dropped — §10 makes mobile an equal priority,
                      and a phone showing less DATA is a different app. */}
                  <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                    {[row.format?.name, row.label?.name, row.conditionMedia]
                      .filter((value) => value !== null && value !== undefined)
                      .join(' · ')}
                  </div>
                </td>

                <td className="hidden px-3 py-2 align-top text-muted-foreground md:table-cell">
                  {row.label === null ? <Absent /> : row.label.name}
                </td>
                <td className="hidden px-3 py-2 align-top text-muted-foreground sm:table-cell">
                  {row.format === null ? <Absent /> : row.format.name}
                </td>
                <td className="px-3 py-2 text-right align-top font-mono tabular-nums">
                  {row.releaseYear === null ? <Absent /> : formatYear(row.releaseYear)}
                </td>
                <td className="hidden px-3 py-2 text-right align-top font-mono sm:table-cell">
                  {row.conditionMedia === null ? <Absent /> : row.conditionMedia}
                </td>
                <td className="px-3 py-2 text-right align-top font-mono tabular-nums">
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

const headCell =
  'px-3 py-2 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase';
