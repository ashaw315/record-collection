import { formatPrice } from '@/app/collection-format';
import { priceLine } from './price-line';
import {
  SPARK_HEIGHT,
  SPARK_WIDTH,
  paidObservations,
  priceRange,
  sparklinePoints,
  type PriceObservation,
} from './sparkline';

/**
 * §10's "price history sparkline" — a READER of `price_history`, not a writer.
 *
 * **§10a removed manual price entry.** Neither real use case needed it: the
 * shop question is about a record the user does not own, and the appreciation
 * question is answered by refreshed market data rather than by the user
 * noticing prices and typing them in. The §5.7 cron writes the observations
 * now; this displays them.
 *
 * That makes the component a server component again — with no form there is no
 * state, no submit and nothing to hydrate.
 *
 * **Still append-only (§7.5).** The rule outlived the form: a correction is a
 * new observation rather than a rewrite, and the copy below says so, because
 * the absence of an edit control otherwise reads as an oversight.
 */

export function PriceHistory({ observations }: { observations: PriceObservation[] }) {
  /**
   * **The chart and its bounds show what was PAID; the list below shows
   * everything.** §7.6 excludes `asking` from what a record is worth, and the
   * chart used to include it — so a single optimistic shop tag drew a spike and
   * was announced as the record's high.
   *
   * The list keeps every observation, because an asking price IS worth seeing;
   * it just is not evidence of value. Each row says which it is.
   */
  const paid = paidObservations(observations);
  const points = sparklinePoints(paid);
  const range = priceRange(paid);

  return (
    <section className="mt-6" data-testid="price-history">
      <h2 className="mb-1 font-heading text-sm font-semibold tracking-tight">Price history</h2>

      {observations.length === 0 ? (
        <p className="mb-3 text-sm text-muted-foreground">
          No prices recorded yet. The weekly refresh adds what the market says.
        </p>
      ) : (
        <div className="mb-3">
          {/*
            Asking-only history is a real state and it gets its own sentence.
            Falling back to "no prices recorded yet" would contradict the list
            printed directly below it, and drawing a chart of asking prices
            would assert a value nobody paid.
          */}
          {points.length === 0 && (
            <p data-testid="no-paid-prices" className="text-xs text-muted-foreground">
              Nothing here says what a copy sold for — only what someone asked.
            </p>
          )}

          {points.length > 0 && (
          <svg
            data-testid="sparkline"
            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
            preserveAspectRatio="none"
            className="h-10 w-full max-w-xs text-primary"
            role="img"
            /**
             * The shape carries no numbers, so the label does. A chart a screen
             * reader cannot describe is decoration, and §10 asked for
             * information.
             */
            aria-label={
              range === null
                ? 'Price history'
                : `Price history: ${paid.length} sale${paid.length === 1 ? '' : 's'}, ${formatPrice(range.low)} to ${formatPrice(range.high)}`
            }
          >
            {points.length === 1 ? (
              <circle cx={points[0].x} cy={points[0].y} r={2} fill="currentColor" />
            ) : (
              <polyline
                points={points.map((point) => `${point.x},${point.y}`).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          )}

          {/*
            The bounds in words, beside the shape rather than under it. A
            sparkline shows the trend and says nothing about scale — the same
            obligation §7.6's total has to state what it sums.

            **Counts the PAID observations, not all of them.** The range is over
            what sold, so "3 observations, $8.00 to $9.50" would describe a
            bound computed from two of them and invite the reader to look for a
            third that is not on the chart.
          */}
          {range !== null && (
            <p data-testid="price-range" className="mt-1 text-xs text-muted-foreground">
              {paid.length} sale{paid.length === 1 ? '' : 's'},{' '}
              <span className="font-mono tabular-nums">{formatPrice(range.low)}</span> to{' '}
              <span className="font-mono tabular-nums">{formatPrice(range.high)}</span>
            </p>
          )}
          {/*
            The observations themselves, which the sparkline could not show.
            "3 observations, $8.00 to $120.00" cannot say whether the $120 was
            last week or three years ago, nor which was new or used.

            Newest first, matching the query — the last thing known about a
            record's worth is the thing being looked for.
          */}
          <ul className="mt-2 space-y-1">
            {observations.map(priceLine).map((line) => (
              <li
                key={line.id}
                data-testid="price-observation"
                className="flex flex-wrap items-baseline gap-x-2 text-xs"
              >
                <time dateTime={line.date} className="font-mono tabular-nums text-muted-foreground">
                  {line.date}
                </time>
                <span className="font-mono tabular-nums">{line.amount}</span>
                {/* The MEANING, not the enum label: "asking" alone does not say
                    nobody paid it, which is the whole point of the type. */}
                <span className="text-muted-foreground">{line.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        §7.5 stated where it is felt. Without this, the absence of an edit
        control reads as an oversight rather than a rule.
      */}
      <p className="mt-1 text-xs text-muted-foreground">
        Prices are a record of observations — each one is added, never edited.
      </p>

    </section>
  );
}
