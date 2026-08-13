import { describe, expect, it } from 'vitest';
import { estimatedValueStatement, spendStatement } from './value-statement';

/**
 * §7.6's total, said as ONE statement rather than a figure with a footnote.
 *
 * The recorded hazard (NOTES): one record legitimately shows two different
 * prices. The detail screen shows the LATEST price of any type; §7.6's estimated
 * value uses the most recent `used` price, falling back to `new`, then to
 * purchase price. Both are correct and answer different questions — but whoever
 * meets the discrepancy first will read it as an arithmetic bug.
 *
 * **A bare $X with a caption below it is a number people quote back at you
 * having not read the caption.** So the rule these functions encode is that the
 * figure and what it means arrive together, in one sentence.
 */

describe('estimatedValueStatement', () => {
  it('names what is being summed in the same breath as the number', () => {
    const said = estimatedValueStatement('1240.50');

    // Both halves, one string — no separate caption to skip.
    expect(said).toContain('$1,240.50');
    expect(said).toMatch(/most recent second-hand price/i);
  });

  it('names the whole fallback chain, because it is what makes the figure total', () => {
    /**
     * §7.6 is `used` → `new` → `purchase_price`. Naming only the first would
     * describe a different, smaller sum — and a record priced only when new
     * would look excluded when it is not.
     */
    const said = estimatedValueStatement('1240.50');

    expect(said).toMatch(/second-hand/i);
    expect(said).toMatch(/new/i);
    expect(said).toMatch(/what you paid|purchase/i);
  });

  it('says it is an estimate, not a valuation', () => {
    // §5.7: Discogs data is a starting point, never proof. Most of these prices
    // come from there, and the word "estimated" is the honest framing.
    expect(estimatedValueStatement('1240.50')).toMatch(/estimate/i);
  });

  it('reads correctly at zero rather than asserting a value of nothing', () => {
    /**
     * The discriminating case. "Estimated value: $0.00, using the most recent
     * second-hand price" claims a computation over records that have no prices —
     * it is not that the collection is worth nothing, it is that nothing is
     * known.
     */
    const said = estimatedValueStatement('0.00');

    expect(said).not.toContain('$0.00');
    expect(said).toMatch(/no prices|nothing recorded|cannot be estimated/i);
  });

  it('never uses the phrase "best dig", which is a different thing entirely', () => {
    /**
     * CLAUDE.md §8: "best dig" means the highest-fidelity pressing worth
     * hunting, never the best price.
     *
     * It was a `price_type` until migration 0005 removed it — a pressing
     * modelled as a price, which is the §8 conflation written into the schema.
     * The phrase must not reappear in this copy, where the confusion would be
     * most expensive: it is the sentence carrying the headline figure.
     */
    expect(estimatedValueStatement('1240.50').toLowerCase()).not.toContain('best dig');
    expect(estimatedValueStatement('1240.50').toLowerCase()).not.toContain('best price');
    // And the type that replaced it is named as excluded, not included.
    expect(estimatedValueStatement('1240.50').toLowerCase()).not.toContain('asking');
  });

  it('formats thousands, because an unpunctuated total is misread', () => {
    expect(estimatedValueStatement('12405.00')).toContain('$12,405.00');
  });
});

describe('spendStatement', () => {
  it('says it is what was PAID, distinct from what it is worth', () => {
    /**
     * The two totals sit next to each other on the screen and are easily
     * conflated. Spend is a fact from `purchase_price`; value is an estimate.
     * The wording has to carry that difference or the pair reads as profit.
     */
    const said = spendStatement('820.00');

    expect(said).toContain('$820.00');
    expect(said).toMatch(/paid/i);
    expect(said).not.toMatch(/estimate/i);
  });

  it('says when nothing has been recorded rather than claiming zero spend', () => {
    // A collection with no purchase prices has not cost nothing.
    const said = spendStatement('0.00');

    expect(said).not.toContain('$0.00');
    expect(said).toMatch(/no purchase prices|nothing recorded/i);
  });
});
