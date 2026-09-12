/**
 * The market figure the grid's 40px slot shows (7a §4).
 *
 * **This exists because `prices[0]` is not a median.** The grid first rendered
 * the most recent observation and labelled it "Market median" — $61.00 for a
 * record observed at 24.00 / 9.99 / 61.00, the highest value presented as the
 * middle one. §4 calls this "the one number the collection's owner does not
 * control", so it has to be the number it claims to be.
 *
 * Pure, and separated from the component so both parities can be asserted:
 * fourteen records in the collection carry two observations, one carries six,
 * and one carries none.
 */

export type MarketFigures = {
  /** The middle by value — the mean of the middle pair when the count is even. */
  median: string;
  low: string;
  high: string;
};

/** Two decimals always, so the 40px figure never shows a third. */
const money = (value: number): string => value.toFixed(2);

/**
 * The median, low and high of a record's price observations, or `null` when it
 * has none.
 *
 * `null` rather than zero: §1.3 draws an unpriced record's market module as
 * empty with a diagonal, and a $0.00 at 40px would be a claim about a record
 * nobody has priced.
 */
export function marketFigures(prices: readonly string[]): MarketFigures | null {
  if (prices.length === 0) return null;

  const values = prices.map((price) => Number(price));
  if (values.some((value) => !Number.isFinite(value))) return null;

  /*
    Sorted NUMERICALLY, and that is the whole fix. The rows arrive in recency
    order, and a string comparison would put '9.99' above '61.00' because
    '9' > '6' — invisible until a single-digit price meets a double-digit one,
    which every record in the collection has.
  */
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  const median =
    sorted.length % 2 === 1
      ? sorted[middle]
      : /* Even: the mean of the middle pair, not either endpoint. */
        (sorted[middle - 1] + sorted[middle]) / 2;

  return {
    median: money(median),
    low: money(sorted[0]),
    high: money(sorted[sorted.length - 1]),
  };
}
