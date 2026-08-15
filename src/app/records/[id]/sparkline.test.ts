import { describe, expect, it } from 'vitest';
import { sparklinePoints, priceRange, paidObservations } from './sparkline';

/**
 * §10's "price history sparkline" on the record detail screen.
 *
 * Pure, because the geometry is the decision. A component test would confirm
 * whatever path string the component produced without stating what the shape
 * should MEAN.
 */

function observation(price: string, recordedAt: string) {
  return { id: `p-${recordedAt}`, price, priceType: 'used' as const, recordedAt };
}

describe('sparklinePoints', () => {
  it('plots oldest to newest, left to right', () => {
    /**
     * The query returns newest-first (§5.2's read order), and a chart reads
     * left-to-right in time. Plotting in query order would draw history
     * backwards — a rising price would look like a falling one, which is the
     * single most misleading thing this chart could do.
     */
    const points = sparklinePoints([
      observation('30.00', '2026-06-01T00:00:00Z'),
      observation('10.00', '2026-01-01T00:00:00Z'),
    ]);

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeLessThan(points[1].x);
    // Oldest (10.00) is the low value, so in SVG coordinates it sits lower on
    // screen — a larger y.
    expect(points[0].y).toBeGreaterThan(points[1].y);
  });

  it('spaces points by TIME, not by index', () => {
    /**
     * Three observations two years apart and two days apart are different
     * histories. Even spacing would draw them identically and imply a steady
     * trend where there was a long gap.
     */
    const points = sparklinePoints([
      observation('10.00', '2020-01-01T00:00:00Z'),
      observation('20.00', '2026-01-01T00:00:00Z'),
      observation('30.00', '2026-01-03T00:00:00Z'),
    ]);

    const firstGap = points[1].x - points[0].x;
    const secondGap = points[2].x - points[1].x;

    expect(firstGap, 'six years is wider than two days').toBeGreaterThan(secondGap);
  });

  it('draws a flat line when every price is identical', () => {
    // The degenerate case: a zero-height range divides by zero if unguarded,
    // and NaN coordinates render as nothing at all — a silently empty chart.
    const points = sparklinePoints([
      observation('20.00', '2026-01-01T00:00:00Z'),
      observation('20.00', '2026-06-01T00:00:00Z'),
    ]);

    expect(points.every((point) => Number.isFinite(point.y))).toBe(true);
    expect(points[0].y).toBe(points[1].y);
  });

  it('handles a single observation without dividing by zero', () => {
    // One price is the common case for a record priced once. It must draw a
    // point, not a NaN path.
    const points = sparklinePoints([observation('20.00', '2026-01-01T00:00:00Z')]);

    expect(points).toHaveLength(1);
    expect(Number.isFinite(points[0].x) && Number.isFinite(points[0].y)).toBe(true);
  });

  it('returns nothing for no observations', () => {
    expect(sparklinePoints([])).toEqual([]);
  });

  it('keeps every point inside the viewbox', () => {
    // A point outside the box is clipped, so a real observation would vanish.
    const points = sparklinePoints([
      observation('1.00', '2020-01-01T00:00:00Z'),
      observation('999.99', '2026-01-01T00:00:00Z'),
      observation('50.00', '2023-01-01T00:00:00Z'),
    ]);

    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('priceRange', () => {
  it('reports the low and high actually observed', () => {
    /**
     * §10 asks for a sparkline; a sparkline with no axis is unreadable without
     * its bounds. These are stated in words beside it rather than inferred from
     * the shape — the same reason §7.6's total must say what it sums.
     */
    const range = priceRange([
      observation('10.00', '2026-01-01T00:00:00Z'),
      observation('35.50', '2026-06-01T00:00:00Z'),
      observation('22.00', '2026-03-01T00:00:00Z'),
    ]);

    expect(range).toEqual({ low: '10.00', high: '35.50' });
  });

  it('is null for no observations, rather than a zero range', () => {
    // "$0.00 to $0.00" asserts a price nobody recorded.
    expect(priceRange([])).toBeNull();
  });

  it('reports one observation as its own low and high', () => {
    const range = priceRange([observation('20.00', '2026-01-01T00:00:00Z')]);

    expect(range).toEqual({ low: '20.00', high: '20.00' });
  });

  it('compares numerically, not as strings', () => {
    /**
     * The discriminating case. Sorted as text, '9.00' > '35.50' because '9'
     * follows '3' — so a collection with a $9 and a $35 price would report its
     * high as $9.00.
     */
    const range = priceRange([
      observation('9.00', '2026-01-01T00:00:00Z'),
      observation('35.50', '2026-06-01T00:00:00Z'),
    ]);

    expect(range).toEqual({ low: '9.00', high: '35.50' });
  });
});

describe('paidObservations — the chart and its bounds exclude `asking`', () => {
  /**
   * **§7.6 already draws this line and the chart crossed it.**
   *
   * Estimated value sums the latest `used`, falling back to `new`, and never
   * `asking` — because an asking price is what someone WANTED and nobody paid.
   * `value-statement.ts` says so in as many words: it "is not evidence of what a
   * record is worth, and it would inflate this headline figure".
   *
   * The sparkline plotted all three as one series and `priceRange` reported the
   * bounds across all three, so a single optimistic shop tag drew a spike and
   * was announced — in the visible text and in the aria-label — as this record's
   * high. The per-row list below the chart carried the meaning correctly; the
   * summary and the shape, which are read first, did not.
   *
   * Concrete: used $8.00, asking $120.00, used $9.50 rendered
   * "3 observations, $8.00 to $120.00" over a chart spiking to $120.
   */
  const paid = (price: string, recordedAt: string) => ({
    id: `paid-${recordedAt}`,
    price,
    priceType: 'used',
    recordedAt,
  });
  const asking = (price: string, recordedAt: string) => ({
    id: `ask-${recordedAt}`,
    price,
    priceType: 'asking',
    recordedAt,
  });

  it('keeps `used` and `new`, drops `asking`', () => {
    const kept = paidObservations([
      paid('8.00', '2024-01-01T00:00:00Z'),
      asking('120.00', '2025-06-01T00:00:00Z'),
      { id: 'n', price: '30.00', priceType: 'new', recordedAt: '2025-07-01T00:00:00Z' },
    ]);

    expect(kept.map((row) => row.priceType).sort()).toEqual(['new', 'used']);
  });

  it('bounds a mixed history by what was actually PAID', () => {
    const observations = [
      paid('8.00', '2024-01-01T00:00:00Z'),
      asking('120.00', '2025-06-01T00:00:00Z'),
      paid('9.50', '2026-01-01T00:00:00Z'),
    ];

    expect(priceRange(paidObservations(observations))).toEqual({ low: '8.00', high: '9.50' });
  });

  it('plots only the paid observations', () => {
    const observations = [
      paid('8.00', '2024-01-01T00:00:00Z'),
      asking('120.00', '2025-06-01T00:00:00Z'),
      paid('9.50', '2026-01-01T00:00:00Z'),
    ];

    expect(sparklinePoints(paidObservations(observations))).toHaveLength(2);
  });

  it('returns nothing when every observation is an asking price', () => {
    /**
     * Not a chart of one flat line, and not a chart of the asking prices
     * either: there is no evidence of what this record is worth. The component
     * renders its empty state, which is honest.
     */
    expect(paidObservations([asking('120.00', '2025-06-01T00:00:00Z')])).toEqual([]);
    expect(priceRange(paidObservations([asking('120.00', '2025-06-01T00:00:00Z')]))).toBeNull();
  });

  it('leaves an unrecognised type OUT rather than assuming it was paid', () => {
    /**
     * The direction of the guess matters. `price_type` is a Postgres enum today,
     * but §5.7's cron is the writer and a fourth value would arrive here before
     * it arrived in this file. Treating an unknown type as paid would put it in
     * the headline figure; leaving it out understates rather than inflates, and
     * the per-row list still shows it.
     */
    expect(
      paidObservations([{ id: 'x', price: '99.00', priceType: 'auction', recordedAt: '2026-01-01T00:00:00Z' }]),
    ).toEqual([]);
  });
});
