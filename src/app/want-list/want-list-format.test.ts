import { describe, expect, it } from 'vitest';
import {
  BEST_DIG_LABEL,
  MARKET_FLOOR_LABEL,
  MARKET_RANGE_LABEL,
  MAX_PRICE_LABEL,
  formatCeiling,
  priorityLabel,
  targetPressingSummary,
} from './want-list-format';

/**
 * Display helpers for the want-list screen (SPEC.md §10).
 *
 * CLAUDE.md §8 names one domain error this app must never make: **"best dig"
 * means the highest-fidelity pressing worth hunting for. It does not mean the
 * cheapest, the best deal, or the best price.** `max_price` is a separate,
 * unrelated field — the user's own ceiling.
 *
 * The labels are asserted here, as data, so the copy is testable rather than
 * buried in JSX where a well-meaning edit to "Best price" would pass every
 * test in the suite.
 */

describe('the §7.2 labels', () => {
  it('never describes best dig in terms of price or deals', () => {
    /**
     * The exact words CLAUDE.md §8 forbids. A label reading "Best deal" would
     * make the app confidently misleading about the domain, which is worse
     * than obviously broken.
     */
    const forbidden = [/deal/i, /price/i, /cheap/i, /bargain/i, /value/i, /worth/i];

    for (const pattern of forbidden) {
      expect(BEST_DIG_LABEL, `${pattern} in the best-dig label`).not.toMatch(pattern);
    }
  });

  it('describes best dig as being about the pressing', () => {
    expect(BEST_DIG_LABEL).toMatch(/pressing|dig/i);
  });

  /**
   * The other half: `max_price` must read as the USER'S ceiling, not as
   * anything about the pressing's worth. "Market price" or "estimated value"
   * would both be claims this app cannot support — it never appraises.
   */
  it('describes max price as the user own limit, not an appraisal', () => {
    expect(MAX_PRICE_LABEL).toMatch(/pay|limit|ceiling|budget/i);
    expect(MAX_PRICE_LABEL).not.toMatch(/worth|value|market|estimate/i);
  });

  it('keeps the two labels distinct', () => {
    // If they ever read alike, the fields have been conflated in the copy even
    // if the data stayed separate.
    expect(BEST_DIG_LABEL).not.toBe(MAX_PRICE_LABEL);
  });
});

describe('formatCeiling', () => {
  it('renders an amount with the currency mark', () => {
    expect(formatCeiling('40.00')).toBe('$40.00');
  });

  it('is undefined when no ceiling was set', () => {
    // Omitted rather than shown as zero: "$0.00" would read as "I will pay
    // nothing", which is a different statement from "I have not decided".
    expect(formatCeiling(null)).toBeUndefined();
  });

  it('does not route the amount through a float', () => {
    // NUMERIC(10,2) carried as a string end to end (§4.2), same as
    // purchase_price. Truncates rather than rounds, so a displayed ceiling is
    // never higher than the one recorded.
    expect(formatCeiling('8.567')).toBe('$8.56');
  });
});

describe('priorityLabel', () => {
  /**
   * §4.2: "1 = highest, 5 = lowest". The number alone is ambiguous — a reader
   * cannot tell whether 1 or 5 is the top without being told.
   */
  it('names the extremes rather than showing a bare number', () => {
    expect(priorityLabel(1)).toBe('Highest');
    expect(priorityLabel(5)).toBe('Lowest');
  });

  it('names the middle values distinctly', () => {
    const labels = [1, 2, 3, 4, 5].map(priorityLabel);

    expect(new Set(labels).size, 'every priority reads differently').toBe(5);
  });

  it('falls back to the number for a value outside the range', () => {
    // The API bounds this to 1-5, but the screen renders whatever the database
    // holds — and a row written before that bound existed would otherwise
    // render as undefined.
    expect(priorityLabel(9)).toBe('9');
  });
});

describe('targetPressingSummary', () => {
  /**
   * §10: "Each row shows target pressing and best-dig notes." The summary has
   * to identify WHICH pressing at a glance — a catalog number and country are
   * what a collector matches against in a shop.
   */
  it('summarises the identifying fields', () => {
    expect(
      targetPressingSummary({
        catalogNumber: 'CLAY LP 3',
        countryPressed: 'UK',
        yearPressed: 1982,
        matrixRunout: null,
      }),
    ).toBe('CLAY LP 3 · UK · 1982');
  });

  it('omits absent fields rather than showing gaps', () => {
    expect(
      targetPressingSummary({
        catalogNumber: 'CLAY LP 3',
        countryPressed: null,
        yearPressed: null,
        matrixRunout: null,
      }),
    ).toBe('CLAY LP 3');
  });

  it('falls back to the matrix when nothing else is known', () => {
    // The dead-wax fingerprint identifies the pressing even when the catalog
    // number is unknown (CLAUDE.md §8).
    expect(
      targetPressingSummary({
        catalogNumber: null,
        countryPressed: null,
        yearPressed: null,
        matrixRunout: 'CLAYLP3-A1',
      }),
    ).toBe('CLAYLP3-A1');
  });

  it('is undefined when the pressing identifies nothing', () => {
    // A found-or-created pressing can be nearly empty (§4). The caller renders
    // no line rather than an empty one.
    expect(
      targetPressingSummary({
        catalogNumber: null,
        countryPressed: null,
        yearPressed: null,
        matrixRunout: null,
      }),
    ).toBeUndefined();
  });

  it('is undefined when there is no target pressing at all', () => {
    expect(targetPressingSummary(null)).toBeUndefined();
  });

  it('does not put a thousands separator in the year', () => {
    const summary = targetPressingSummary({
      catalogNumber: null,
      countryPressed: null,
      yearPressed: 1982,
      matrixRunout: null,
    });

    expect(summary).toBe('1982');
  });
});

describe('three money figures, three meanings (§7.2 extended by §10a)', () => {
  /**
   * The want list is where they collide. §7.2 has kept `best_dig_notes` and
   * `max_price` apart since step 6 — which pressing to hunt versus what the user
   * will pay. §10a adds a third and a fourth quantity to the same row:
   *
   *   - **`max_price`** — the user's ceiling. A decision.
   *   - **market floor** — what someone is asking today. A listing.
   *   - **condition ladder** — what Discogs estimates. A model.
   *
   * Three quantities that all render as money is precisely the confusion §7.2
   * exists to prevent, so each says what it IS in words rather than relying on
   * sitting in a different block. A label naming the field ("Max price") tells
   * the reader where it came from; these tell them what it means.
   */
  it('labels the ceiling as the user’s own decision', () => {
    expect(MAX_PRICE_LABEL).toMatch(/I.ll pay/i);
  });

  it('heads the market block without claiming a worth', () => {
    /**
     * The heading names the QUESTION (§10a's table: "is my ceiling
     * realistic?"); `marketSummary` supplies the "cheapest asking $47.28"
     * wording. A first version asserted "asking" HERE too and produced a
     * heading that duplicated the sentence under it — caught in a screenshot.
     *
     * What must hold either way: never "worth" and never "value". §10a — the
     * app does not know what a specific copy is worth, and the floor is one
     * listing at a condition nobody stated.
     */
    expect(MARKET_FLOOR_LABEL.toLowerCase()).not.toMatch(/\bworth\b|\bvalue\b/);
    expect(MARKET_FLOOR_LABEL.toLowerCase()).not.toMatch(/\bpaid\b|\bsold\b/);
  });

  it('labels the ladder as an estimate, not as sales', () => {
    // The endpoint is `price_suggestions`: Discogs MODELS these. Nobody paid
    // $145.80 for that record.
    expect(MARKET_RANGE_LABEL).toMatch(/estimate/i);
    expect(MARKET_RANGE_LABEL.toLowerCase()).not.toMatch(/\bsold\b|\bpaid\b/);
  });

  it('gives all three DIFFERENT labels, so none can be read as another', () => {
    /**
     * The discriminating assertion. Three figures with overlapping labels would
     * reproduce exactly the flattening §7.2 forbids — and the failure mode is
     * the user reading their own ceiling as a market price, or the reverse.
     */
    const labels = [MAX_PRICE_LABEL, MARKET_FLOOR_LABEL, MARKET_RANGE_LABEL];

    expect(new Set(labels).size).toBe(3);
  });

  it('never uses "best dig" for any money figure', () => {
    // CLAUDE.md §8: best dig names a PRESSING. It is already the label for the
    // notes field on this same screen, which is why the risk is highest here.
    for (const label of [MAX_PRICE_LABEL, MARKET_FLOOR_LABEL, MARKET_RANGE_LABEL]) {
      expect(label.toLowerCase()).not.toContain('best dig');
    }
  });
});
