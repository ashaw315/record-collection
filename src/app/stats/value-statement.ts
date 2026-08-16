import { formatTotal } from '@/app/collection-format';

/**
 * §7.6's totals, each said as ONE statement rather than a figure with a caption.
 *
 * The recorded hazard: one record legitimately shows two different prices. The
 * detail screen shows the latest price of any type; §7.6's estimated value uses
 * the most recent `used` price, falling back to `new`, then to purchase price.
 * Both are right and answer different questions — but the first person to meet
 * the discrepancy reads it as arithmetic gone wrong.
 *
 * **A bare $X with a caption underneath is a number people quote back at you
 * having not read the caption.** So the figure and its meaning are one string,
 * and there is no version of this screen that can show one without the other.
 */

/**
 * Zero is not a value, it is an absence of information.
 *
 * "$0.00, using the most recent second-hand price" claims a computation over
 * records that have no prices at all. The collection is not worth nothing;
 * nothing is known about what it is worth.
 *
 * **`Number(amount) === 0` alone conflated three different facts**, which is the
 * absent-versus-unknown shape (CLAUDE.md §8) arriving in a money field:
 *
 *   '0.00'      a real computed zero        -> nothing recorded    correct
 *   ''          the driver returned nothing -> nothing recorded    right answer,
 *                                                                  luckily
 *   'nonsense'  something upstream broke    -> `NaN === 0` is false,
 *                                              so it was PASSED THROUGH and
 *                                              rendered inside "Estimated value
 *                                              of what is on the shelf: …"
 *
 * A figure the app cannot parse is not a valuation, and the honest output is the
 * same sentence used for no data — not the unparsed string in a money position.
 *
 * Not reachable from `recordStats` today, which returns '0.00' for an empty
 * collection. It is guarded anyway because §5.7's cron is a writer, the column
 * is `NUMERIC(10,2)` which node-postgres hands back as a STRING, and `money.ts`
 * documents at length that these values must never route through a float. This
 * guard should not be the one place that assumes they parse.
 */
function isNothingRecorded(amount: string): boolean {
  const value = Number(amount);

  // NaN covers the unparseable case; `=== 0` covers the genuine and empty ones.
  return Number.isNaN(value) || value === 0;
}

export function estimatedValueStatement(estimatedValue: string): string {
  if (isNothingRecorded(estimatedValue)) {
    return 'No prices recorded yet, so the value of the shelf cannot be estimated.';
  }

  /**
   * The whole fallback chain is named, not just its first link. §7.6 is
   * `used` → `new` → `purchase_price`, and describing only the used price would
   * describe a smaller sum than the one shown — a record priced only when new
   * would look excluded when it is not.
   *
   * `asking` is deliberately absent: a price somebody WANTED is not evidence of
   * what a record is worth, and it would inflate this headline figure. (Its
   * predecessor `best_dig` was worse still — a pressing modelled as a price —
   * and migration 0005 removed it from the enum entirely.)
   */
  return `Estimated value of what is on the shelf: ${formatTotal(estimatedValue)}, using each record's most recent second-hand price — or its new price, or what you paid, when that is all there is.`;
}

export function spendStatement(totalSpend: string): string {
  if (isNothingRecorded(totalSpend)) {
    return 'No purchase prices recorded yet.';
  }

  /**
   * "Paid", and no mention of estimating. This figure sits beside the value
   * above and the pair is easily read as profit — spend is a FACT from
   * `purchase_price`, value is an estimate, and only the wording carries the
   * difference.
   */
  return `Total paid for the records where you recorded a price: ${formatTotal(totalSpend)}.`;
}
