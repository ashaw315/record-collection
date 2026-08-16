/**
 * The app's money formatter — one function, one symbol.
 *
 * **The currency was never in SPEC.md.** `£` was assumed in step 5 and copied
 * into three formatters (`formatPrice`, `formatTotal`, `formatCeiling`), each
 * the same string manipulation with different null handling. Adam is in New
 * York, and §10a's market data arrives in USD — so a record detail page showed
 * "PAID £10.00" directly above a market panel in dollars.
 *
 * Three copies meant the symbol had to change in three places, which is why
 * they are now one.
 */

/**
 * Exported so the next change is a single edit, and so a test can assert the
 * app agrees with §10a's market data — which is USD from Discogs and cannot be
 * requested otherwise (`price_suggestions` ignores `curr_abbr`, measured).
 */
export const CURRENCY_SYMBOL = '$';

/** An em dash reads as "not recorded"; an empty string reads as a bug. */
const ABSENT = '—';

/**
 * A `NUMERIC(10,2)` amount, as a string, rendered as money.
 *
 * **String manipulation, never `Number` or `toLocaleString`.** These values are
 * carried as strings end to end precisely so they never route through a float —
 * the column holds exact decimals and a float does not. `formatTotal` learned
 * this when grouping was added; it applies to every path here.
 */
export function formatMoney(
  amount: string | null,
  options?: { absent?: string | undefined },
): string;
export function formatMoney(
  amount: string | null,
  options: { absent: undefined },
): string | undefined;
export function formatMoney(
  amount: string | null,
  options?: { absent?: string | undefined },
): string | undefined {
  if (amount === null) {
    // `formatCeiling`'s behaviour, preserved: the want list omits its max-price
    // line entirely rather than showing a dash, because a dash beside a ceiling
    // reads as "I will pay nothing" (§7.2).
    return options !== undefined && 'absent' in options ? options.absent : ABSENT;
  }

  /**
   * The sign is peeled off BEFORE grouping and put back before the symbol.
   *
   * Left attached, it produced `$-12.50` — the minus governs the amount, not the
   * digits after the symbol, so the conventional form is `-$12.50`. It also kept
   * the sign inside the string the grouping regex reads as digits.
   *
   * `moneySchema` (`^\d{1,8}…`) refuses a negative at the API boundary and
   * there is no CHECK on `records.purchase_price`, so this arrives only from a
   * value corrected by hand in the database — ordinary enough for a personal
   * tool, and this is the app's single money formatter.
   */
  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;

  const [whole, fraction = ''] = unsigned.split('.');

  /**
   * Thousands separated: $12405.00 and $1240.50 differ by a decimal point's
   * worth of attention, and a collection total reaches five figures.
   *
   * **A regex rather than `Number(amount).toLocaleString()`, deliberately.**
   * That is the obvious-looking improvement and it would convert a
   * `NUMERIC(10,2)` string into a float — reintroducing exactly the precision
   * loss the column type exists to prevent. At the column's full width
   * (`12345678.91`) the round trip is not exact, and money that changes when
   * displayed is worse than money that is awkward to format.
   */
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  // Truncated, not rounded — NUMERIC(10,2) cannot hold a third decimal, so one
  // arriving here came from a caller's arithmetic rather than the column, and
  // rounding would quietly disagree with what is stored.
  const sign = negative ? '-' : '';

  return `${sign}${CURRENCY_SYMBOL}${grouped}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}
