import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeMarket, formatMarketPrice, CONDITION_ORDER } from './normalize-market';

/**
 * SPEC.md §10a layers 1 and 2.
 *
 * **Built against CAPTURED payloads**, per the step 7 practice — the same
 * discipline whose absence produced a spec asking for a range Discogs would not
 * supply, and the `format.text` error before it. Both files came from the live
 * API through `scripts/capture-discogs-fixtures.mjs`, which asserts at capture
 * time that the ladder carries multiple grades.
 */

const STATS = JSON.parse(
  readFileSync('test/fixtures/discogs/marketplace-stats-381756.json', 'utf8'),
) as Record<string, unknown>;

const SUGGESTIONS = JSON.parse(
  readFileSync('test/fixtures/discogs/price-suggestions-381756.json', 'utf8'),
) as Record<string, unknown>;

describe('normalizeMarket — layer 1, scarcity and floor', () => {
  it('reads the number for sale and the floor from the real payload', () => {
    const market = normalizeMarket({ stats: STATS, suggestions: SUGGESTIONS });

    expect(market.numForSale).toBe(11);
    expect(market.lowestPrice).toEqual({ value: 47.28, currency: 'USD' });
  });

  it('survives a release nobody is selling', () => {
    /**
     * `lowest_price` is null when there are no listings — verified in the wild
     * on other releases. A floor of £0 would read as "free", and the absence is
     * the honest answer: nothing is for sale.
     */
    const market = normalizeMarket({
      stats: { num_for_sale: 0, lowest_price: null },
      suggestions: null,
    });

    expect(market.numForSale).toBe(0);
    expect(market.lowestPrice).toBeNull();
  });

  it('treats a missing stats payload as absence, not zero', () => {
    // §10a: "later layers degrade to absence, never to a guess." Zero copies for
    // sale is a fact; not knowing is not.
    const market = normalizeMarket({ stats: null, suggestions: null });

    expect(market.numForSale).toBeNull();
    expect(market.lowestPrice).toBeNull();
  });
});

describe('normalizeMarket — layer 2, the condition ladder', () => {
  it('reads every grade from the real payload, best first', () => {
    const market = normalizeMarket({ stats: STATS, suggestions: SUGGESTIONS });

    expect(market.conditions.map((row) => row.grade)).toEqual([
      'Mint (M)',
      'Near Mint (NM or M-)',
      'Very Good Plus (VG+)',
      'Very Good (VG)',
      'Good Plus (G+)',
      'Good (G)',
      'Fair (F)',
      'Poor (P)',
    ]);
  });

  it('orders by CONDITION, not by the object key order Discogs happened to send', () => {
    /**
     * The discriminating case. JS object key order is insertion order, so an
     * implementation that trusts it passes against this fixture and reorders
     * silently against another payload. The ladder must be sorted by the known
     * grade sequence.
     */
    const shuffled = {
      'Good (G)': { currency: 'USD', value: 23.02 },
      'Mint (M)': { currency: 'USD', value: 145.8 },
      'Very Good (VG)': { currency: 'USD', value: 69.06 },
    };

    const market = normalizeMarket({ stats: null, suggestions: shuffled });

    expect(market.conditions.map((row) => row.grade)).toEqual([
      'Mint (M)',
      'Very Good (VG)',
      'Good (G)',
    ]);
  });

  it('rounds the value, because Discogs sends full float precision', () => {
    // The real payload carries 145.79866227900087. Rendering that verbatim is
    // a number no shop ever quoted.
    const market = normalizeMarket({ stats: STATS, suggestions: SUGGESTIONS });
    const mint = market.conditions.find((row) => row.grade === 'Mint (M)');

    expect(mint?.value).toBe(145.8);
  });

  it('degrades to an empty ladder when seller settings are missing', () => {
    /**
     * §10a: `price_suggestions` 404s without completed seller settings, and the
     * app "shows layer 1 alone and says the range is unavailable; it never
     * interpolates one". An empty ladder is what the UI keys on.
     */
    const market = normalizeMarket({ stats: STATS, suggestions: null });

    expect(market.conditions).toEqual([]);
    expect(market.numForSale, 'layer 1 is unaffected').toBe(11);
  });

  it('never derives a condition price from the floor', () => {
    // The interpolation §10a forbids: `lowest_price` is one listing at an
    // unknown condition, and spreading it across grades invents six numbers.
    const market = normalizeMarket({ stats: STATS, suggestions: null });

    expect(market.conditions).toHaveLength(0);
  });

  it('ignores an unknown grade rather than guessing where it sits', () => {
    // A grade outside the known ladder cannot be ordered against the others,
    // and placing it arbitrarily would misrepresent the spread.
    const market = normalizeMarket({
      stats: null,
      suggestions: {
        'Mint (M)': { currency: 'USD', value: 100 },
        'Sealed Reissue': { currency: 'USD', value: 500 },
      },
    });

    expect(market.conditions.map((row) => row.grade)).toEqual(['Mint (M)']);
  });

  it('reports the currency it was given rather than assuming one', () => {
    /**
     * Measured 2026-08-12: `price_suggestions` IGNORES `curr_abbr` and returns
     * USD regardless — even against a profile set to EUR. Layer 1 therefore
     * requests `curr_abbr=USD` so the two agree. The currency is carried, not
     * assumed, so a change at Discogs surfaces as a visible mismatch rather
     * than a wrong symbol.
     */
    const market = normalizeMarket({ stats: STATS, suggestions: SUGGESTIONS });

    expect(market.currency).toBe('USD');
  });
});

describe('the ladder is a RANGE, not a single number', () => {
  it('reports the spread between the cheapest and dearest grade', () => {
    // §10a: "A range, never a single number." The spread is what answers "is
    // this fairly priced" for a copy whose condition only the user can see.
    const market = normalizeMarket({ stats: STATS, suggestions: SUGGESTIONS });

    expect(market.range).toEqual({ low: 7.67, high: 145.8 });
  });

  it('has no range when the ladder is empty', () => {
    const market = normalizeMarket({ stats: STATS, suggestions: null });

    expect(market.range).toBeNull();
  });
});

describe('formatMarketPrice', () => {
  it('renders USD with its own symbol, not the app’s £', () => {
    /**
     * The app renders `£` throughout (a step 5 assumption; SPEC.md names no
     * currency) and Adam is in New York. These figures are USD from Discogs and
     * must say so — a number beside the wrong symbol is the confidently-wrong
     * shape §8 warns about, in money.
     */
    expect(formatMarketPrice(47.28, 'USD')).toBe('$47.28');
  });

  it('pads to two decimals so a ladder aligns', () => {
    expect(formatMarketPrice(7.673613804157942, 'USD')).toBe('$7.67');
    expect(formatMarketPrice(23, 'USD')).toBe('$23.00');
  });

  it('falls back to the code for a currency with no known symbol', () => {
    // Better an explicit "SEK 120.00" than a wrong symbol.
    expect(formatMarketPrice(120, 'SEK')).toBe('SEK 120.00');
  });
});

describe('CONDITION_ORDER', () => {
  it('runs best to worst, which is how a ladder is read', () => {
    expect(CONDITION_ORDER[0]).toBe('Mint (M)');
    expect(CONDITION_ORDER[CONDITION_ORDER.length - 1]).toBe('Poor (P)');
  });

  it('covers every grade the live payload returned', () => {
    // The capture asserted 8 grades; if Discogs adds one, this fails here
    // rather than silently dropping it from the ladder.
    for (const grade of Object.keys(SUGGESTIONS)) {
      expect(CONDITION_ORDER, `unknown grade: ${grade}`).toContain(grade);
    }
  });
});
