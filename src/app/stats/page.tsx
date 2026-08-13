import Link from 'next/link';
import { AppHeader } from '@/components/AppHeader';
import { formatTotal } from '@/app/collection-format';
import { recordStats } from '@/lib/db/queries/records';
import { estimatedValueStatement, spendStatement } from './value-statement';

/**
 * SPEC.md §10 `/stats`: "Total records, total spend, estimated value, breakdown
 * charts by genre/decade/store/label."
 *
 * **The §7.6 hazard shaped this screen rather than being captioned onto it.**
 * One record legitimately shows two different prices: the detail screen shows
 * the latest of any type, while estimated value uses the most recent `used`
 * price falling back to `new`, then to purchase price. Both are right and answer
 * different questions.
 *
 * A bare $X with an explanation underneath is a number people quote back at you
 * having not read the explanation — so the figure and its meaning are ONE
 * sentence, produced by `estimatedValueStatement`, and there is no arrangement
 * of this page that shows one without the other.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Stats' };

/**
 * A proportional bar, as a share of the largest row.
 *
 * Deliberately not a charting library: §13's non-goals and CLAUDE.md §5 both
 * argue against a dependency for something a div can do, and a bar whose width
 * is a percentage of the maximum is the whole of what §10 asks for.
 */
function Bar({ count, max }: { count: number; max: number }) {
  const share = max === 0 ? 0 : Math.round((count / max) * 100);

  return (
    <div className="h-1.5 w-full bg-muted" aria-hidden="true">
      <div className="h-full bg-primary" style={{ width: `${share}%` }} />
    </div>
  );
}

function Breakdown({
  title,
  testId,
  rows,
  emptyMessage,
  href,
}: {
  title: string;
  testId: string;
  rows: Array<{ id: string; name: string; count: number; extra?: string }>;
  emptyMessage: string;
  href?: (id: string) => string;
}) {
  const max = rows.reduce((highest, row) => Math.max(highest, row.count), 0);

  return (
    <section className="mt-6" data-testid={testId}>
      <h2 className="mb-2 font-heading text-sm font-semibold tracking-tight">{title}</h2>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                {/* Linked where the collection can be filtered by it: a
                    breakdown is only useful if you can open what it counts. */}
                <span className="min-w-0 truncate">
                  {href === undefined ? (
                    row.name
                  ) : (
                    <Link href={href(row.id)} className="underline-offset-2 hover:underline">
                      {row.name}
                    </Link>
                  )}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {row.extra === undefined ? row.count : `${row.count} · ${row.extra}`}
                </span>
              </div>
              <Bar count={row.count} max={max} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function StatsPage() {
  const stats = await recordStats();

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Stats</h1>

        <p className="mt-3 text-sm">
          <span className="font-mono tabular-nums">{stats.totalRecords}</span>{' '}
          {stats.totalRecords === 1 ? 'record' : 'records'} in the collection.
        </p>

        {/*
          Each figure is a SENTENCE, not a number with a caption. See the note at
          the top of this file and NOTES' §7.6 hazard.
        */}
        <p data-testid="estimated-value" className="mt-3 text-sm">
          {estimatedValueStatement(stats.estimatedValue)}
        </p>

        <p data-testid="total-spend" className="mt-2 text-sm text-muted-foreground">
          {spendStatement(stats.totalSpend)}
        </p>

        <Breakdown
          title="By genre"
          testId="by-genre"
          rows={stats.byGenre.map((row) => ({ id: row.id, name: row.name, count: row.count }))}
          emptyMessage="No records are filed under a genre yet."
          href={(id) => `/?genreId=${id}`}
        />

        <Breakdown
          title="By decade"
          testId="by-decade"
          rows={stats.byDecade.map((row) => ({
            id: String(row.decade),
            name: `${row.decade}s`,
            count: row.count,
          }))}
          emptyMessage="No records have a release year yet."
        />

        <Breakdown
          title="By label"
          testId="by-label"
          rows={stats.byLabel.map((row) => ({ id: row.id, name: row.name, count: row.count }))}
          emptyMessage="No records have a label yet."
          href={(id) => `/?labelId=${id}`}
        />

        <Breakdown
          title="By store"
          testId="by-store"
          rows={stats.byStore.map((row) => ({
            id: row.id,
            name: row.name,
            count: row.count,
            // Spend per store is a fact worth carrying — §10's stores screen
            // shows it too, and here it answers "where does the money go".
            extra: formatTotal(row.spend),
          }))}
          emptyMessage="No records record where they were bought."
          href={(id) => `/?storeId=${id}`}
        />
      </main>
    </>
  );
}
