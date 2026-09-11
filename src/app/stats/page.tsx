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
      <h2 className="mb-2 font-heading text-title font-semibold tracking-tight">{title}</h2>

      {rows.length === 0 ? (
        <p className="text-prose text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <div className="flex items-baseline justify-between gap-3 text-detail">
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
                <span className="shrink-0 font-mono text-meta tabular-nums text-muted-foreground">
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

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  /**
   * **`artistId` narrows the stats, and it is TEST-FACING rather than a
   * feature.**
   *
   * Nothing links to it: the nav points at `/stats` bare, and the breakdown rows
   * link OUTWARD to `/?genreId=` rather than inward. A user reaching this would
   * have to construct the URL.
   *
   * It exists because the screen could not otherwise be rendered EMPTY. `/stats`
   * showed the whole collection, so "no records" meant an empty database — and
   * `e2e/global-setup.ts` says why that is unavailable: specs run in parallel
   * across two projects against one database, so a mid-run truncate deletes
   * another spec's fixtures. An artist with no records is an empty collection of
   * one, and the E2E test then runs in parallel like everything else.
   *
   * `/plane` carries the same parameter for the same class of reason, through
   * the same `RecordFilters` the collection views use rather than a stats-only
   * path. **Latently it is meaningful** — "stats for one artist" is a coherent
   * question — but making it a feature needs a nav path and a spec line, so it
   * is noted here as a decision rather than left as an oversight.
   */
  const params = await searchParams;
  const artistId = typeof params.artistId === 'string' ? params.artistId : undefined;

  const stats = await recordStats(artistId === undefined ? {} : { artistId });

  return (
    <>
      <AppHeader />

      <main className="mx-auto w-full max-w-3xl px-4 py-6">
        <h1 className="font-heading text-headline font-semibold tracking-tight">Stats</h1>

        {/*
          **The record count takes `display`, and it is the only figure on this
          screen that does.** §7a's register holds `display` for the count of
          the page's SUBJECT, and /stats' subject is records — so the money
          figures and the breakdowns do not take it however large they are.

          **Presence and the scale compose here rather than colliding**, which
          this is the first screen to test. They act on different properties:
          the scale sets the SIZE from what the text is, presence sets the
          WEIGHT of the mark from how much of its subject the figure covers.
          `totalRecords` covers its subject entirely, so it is ink — no muting —
          at `display`. The estimated value covers a minority of records, so it
          is muted; it is `prose` rather than `display` because it is a sentence
          about a figure rather than the subject's own count.

          A61: a zero keeps display and takes muted. An empty collection renders
          `0` here at the same size, muted rather than absent — a figure that
          covers nothing is still a figure. No test renders that state today.
        */}
        {/*
          **`display` never shares a baseline with prose (§7a, A71).** A display
          figure is a figure, not a word in a sentence: baseline-aligning 72px to
          13px at a 5.5:1 ratio puts the phrase against the digit's lower half,
          which reads as a caption that lost its figure. The prose sits BENEATH
          it instead.
        */}
        <div className="mt-3">
          <span
            data-testid="total-records"
            /*
              **A zero keeps display and takes muted** (§7a). Presence sets the
              weight of the mark from how much of its subject the figure covers,
              and a zero covers nothing — so it stays the same size, because a
              figure that covers nothing is still a figure, and it goes muted,
              because it is not a count of anything.

              This was missing until an empty collection was rendered for the
              first time: the conversion applied `display` and nothing applied
              the presence half, on a state no test and no browser had ever
              shown.
            */
            className={`block font-mono text-display leading-none tabular-nums${
              stats.totalRecords === 0 ? ' text-muted-foreground' : ''
            }`}
          >
            {stats.totalRecords}
          </span>
          <p className="text-detail">
            {stats.totalRecords === 1 ? 'record' : 'records'} in the collection.
          </p>
        </div>

        {/*
          Each figure is a SENTENCE, not a number with a caption. See the note at
          the top of this file and NOTES' §7.6 hazard.
        */}
        <p data-testid="estimated-value" className="mt-3 text-prose">
          {estimatedValueStatement(stats.estimatedValue)}
        </p>

        <p data-testid="total-spend" className="mt-2 text-prose text-muted-foreground">
          {spendStatement(stats.totalSpend)}
        </p>

        {/*
          **At zero the four breakdowns collapse to ONE sentence at page scope
          (§7a).**

          The scope predicate, not the withheld-set rule: nothing is being
          withheld here, the breakdowns are genuinely empty. What decides it is
          whose claim it is. On an empty collection the subject of "no records
          have a label yet" is not the label breakdown — it is the collection,
          and four claims sharing one subject belong at that subject's scope.

          **Only at zero.** With records present and a breakdown empty, the
          subject really is that breakdown — "records exist and none carry a
          store" is a different claim, it is actionable, and it stays where it
          is. The existing sentences were written for that case and are correct
          there.

          §10b's removed genre sections are the same picture from a different
          cause, and the distinction is worth keeping: there, five bands were
          structurally near-empty and the fix was removing the device. Here one
          device is repeated because one fact is being said four times.
          Collapsing to the cause's scope is the same move.

          **The action is §7a's** — the screen with no action gets exactly one,
          in the only state where "what should I record next" has an
          unambiguous answer.
        */}
        {stats.totalRecords === 0 ? (
          <section className="mt-6" data-testid="stats-empty">
            <p className="text-prose text-muted-foreground">
              Nothing is recorded yet, so there is nothing to break down by genre, decade,
              label or store.
            </p>
            <Link
              href="/records/new"
              data-testid="stats-empty-action"
              className="mt-3 inline-block text-label underline underline-offset-2"
            >
              Add a record
            </Link>
          </section>
        ) : (
          <>
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
          </>
        )}
      </main>
    </>
  );
}
