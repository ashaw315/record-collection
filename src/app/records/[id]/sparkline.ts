/**
 * The geometry behind §10's "price history sparkline".
 *
 * Pure and separate from the component, because the shape is a set of decisions
 * — time-proportional spacing, oldest-first, degenerate ranges — and a
 * component test would confirm whatever path string was produced without
 * stating what it should mean.
 */

export type PriceObservation = {
  id: string;
  price: string;
  priceType: string;
  recordedAt: string | Date;
};

export type SparkPoint = { x: number; y: number };

/** An arbitrary viewBox; the component scales it with CSS. */
export const SPARK_WIDTH = 100;
export const SPARK_HEIGHT = 24;

function time(value: string | Date): number {
  return (value instanceof Date ? value : new Date(value)).getTime();
}

/** Numeric, never string comparison: '9.00' sorts after '35.50' as text. */
function amount(observation: PriceObservation): number {
  return Number(observation.price);
}

export function sparklinePoints(observations: PriceObservation[]): SparkPoint[] {
  if (observations.length === 0) return [];

  /**
   * Oldest first. The query returns newest-first (§5.2's read order) and a
   * chart reads left-to-right in time — plotting in query order would draw a
   * rising price as a falling one, the most misleading thing this chart could
   * do.
   */
  const ordered = [...observations].sort((a, b) => time(a.recordedAt) - time(b.recordedAt));

  const times = ordered.map((row) => time(row.recordedAt));
  const prices = ordered.map(amount);

  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  /**
   * Zero spans are the degenerate cases and both are ordinary: one observation,
   * or several at the same price. Dividing by them yields NaN coordinates,
   * which render as no chart at all — a silent blank where history should be.
   */
  const timeSpan = maxTime - minTime;
  const priceSpan = maxPrice - minPrice;

  return ordered.map((row, index) => ({
    // Spaced by TIME, not by index: two days and six years are different
    // histories, and even spacing would draw them the same.
    x:
      timeSpan === 0
        ? (index / Math.max(1, ordered.length - 1)) * SPARK_WIDTH
        : ((time(row.recordedAt) - minTime) / timeSpan) * SPARK_WIDTH,
    // SVG y grows downward, so the highest price sits at the smallest y.
    y:
      priceSpan === 0
        ? SPARK_HEIGHT / 2
        : SPARK_HEIGHT - ((amount(row) - minPrice) / priceSpan) * SPARK_HEIGHT,
  }));
}

/**
 * The low and high actually observed, as the stored strings.
 *
 * A sparkline without its bounds is unreadable — the shape shows the trend and
 * says nothing about the scale. Returned so the component can state them in
 * words, the same obligation §7.6 has to say what its total sums.
 */
export function priceRange(
  observations: PriceObservation[],
): { low: string; high: string } | null {
  if (observations.length === 0) return null;

  const sorted = [...observations].sort((a, b) => amount(a) - amount(b));

  return { low: sorted[0].price, high: sorted[sorted.length - 1].price };
}
