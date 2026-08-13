import { describe, expect, it } from 'vitest';
import { spreadVerdict, summariseSpread } from './version-spread';

/**
 * SPEC.md §10a layer 3 — "does pressing matter here?"
 *
 * Computed, not fetched: the spread of `lowest_price` across a master's
 * versions. "Versions spanning £8 to £400 mean the pressing matters more than
 * the price; everything between £10 and £25 means it barely does."
 *
 * **The partial case is the reason this is pure.** One call per version against
 * a 60/minute budget means a spread can run out of budget half-finished, and a
 * partial range presented as complete is the absent-versus-unknown failure in
 * the layer where numbers carry the most weight.
 */

const priced = (value: number) => ({ discogsId: value, lowestPrice: value });

describe('spreadVerdict', () => {
  it('says the pressing matters when the range is wide', () => {
    // §10a's own example: £8 to £400.
    expect(spreadVerdict({ low: 8, high: 400 })).toBe('pressing-matters');
  });

  it('says it barely matters when the range is tight', () => {
    // §10a's other example: £10 to £25.
    expect(spreadVerdict({ low: 10, high: 25 })).toBe('pressing-barely-matters');
  });

  it('judges by RATIO, not by absolute difference', () => {
    /**
     * The discriminating case. $10-$25 and $400-$415 are both a $15 spread, and
     * they are completely different facts: the first is 2.5x and worth
     * knowing, the second is 4% on an expensive record and is noise.
     *
     * An absolute threshold would call every expensive master "pressing
     * matters" — which is the reverse of useful, since those are exactly the
     * ones where the collector already knows.
     */
    expect(spreadVerdict({ low: 400, high: 415 })).toBe('pressing-barely-matters');
    expect(spreadVerdict({ low: 10, high: 25 })).toBe('pressing-barely-matters');
    expect(spreadVerdict({ low: 10, high: 100 })).toBe('pressing-matters');

    /**
     * The two cases where a ratio and a fixed difference DISAGREE — without
     * these the test passes against either rule, which a mutation swapping in
     * `high - low >= 50` demonstrated.
     *
     *   $5 → $30 is 6x on a cheap record: the pressing absolutely matters, and
     *   the $25 difference is below any sensible absolute threshold.
     *
     *   $500 → $560 is 1.12x: noise on an expensive record, and the $60
     *   difference is above one.
     */
    expect(spreadVerdict({ low: 5, high: 30 }), '6x, small absolute').toBe('pressing-matters');
    expect(spreadVerdict({ low: 500, high: 560 }), '1.12x, large absolute').toBe(
      'pressing-barely-matters',
    );
  });

  it('has no verdict on a single price', () => {
    // One version priced is not a spread; calling it "barely matters" would
    // claim a comparison that was never made.
    expect(spreadVerdict({ low: 20, high: 20 })).toBeNull();
  });

  it('has no verdict when nothing is priced', () => {
    expect(spreadVerdict(null)).toBeNull();
  });
});

describe('summariseSpread — the complete case', () => {
  it('reports the range across every version checked', () => {
    const said = summariseSpread({
      checked: [priced(8), priced(45), priced(400)],
      total: 3,
      currency: 'USD',
    });

    expect(said.range).toEqual({ low: 8, high: 400 });
    expect(said.partial).toBe(false);
    expect(said.text).toContain('$8.00');
    expect(said.text).toContain('$400.00');
  });

  it('says the pressing matters, in words a collector uses', () => {
    const said = summariseSpread({
      checked: [priced(8), priced(400)],
      total: 2,
      currency: 'USD',
    });

    expect(said.text).toMatch(/which pressing|pressing matters/i);
  });

  it('ignores versions with no listing rather than counting them as zero', () => {
    /**
     * A version nobody is selling has no price — not a price of nothing. Zero
     * would drag the low end to $0.00 and make every master look like it spans
     * everything.
     */
    const said = summariseSpread({
      checked: [priced(45), { discogsId: 2, lowestPrice: null }, priced(60)],
      total: 3,
      currency: 'USD',
    });

    expect(said.range).toEqual({ low: 45, high: 60 });
  });

  it('reports no range when nothing checked had a price', () => {
    const said = summariseSpread({
      checked: [{ discogsId: 1, lowestPrice: null }],
      total: 1,
      currency: 'USD',
    });

    expect(said.range).toBeNull();
    expect(said.text).toMatch(/none of|nothing.*for sale|no prices/i);
  });
});

describe('summariseSpread — the PARTIAL case', () => {
  /**
   * The budget runs out mid-fetch: eleven versions, a sixty-per-minute limit,
   * and other things on the page competing for it. §10a's rule is that a
   * partial spread is still an answer — but it must SAY it is partial.
   */
  it('says how many of how many were checked', () => {
    const said = summariseSpread({
      checked: [priced(8), priced(45), priced(400)],
      total: 11,
      currency: 'USD',
    });

    expect(said.partial).toBe(true);
    expect(said.text).toContain('3 of 11');
  });

  it('calls the range provisional, not final', () => {
    /**
     * "Range so far" rather than "range". An incomplete range presented as
     * complete is the absent-versus-unknown failure: the reader cannot tell a
     * master whose versions genuinely cluster from one where the wide end was
     * never fetched.
     */
    const said = summariseSpread({
      checked: [priced(8), priced(45)],
      total: 11,
      currency: 'USD',
    });

    expect(said.text).toMatch(/so far|of the ones checked|partial/i);
  });

  it('withholds the VERDICT on a partial spread', () => {
    /**
     * The load-bearing assertion. "The pressing barely matters" from three of
     * eleven versions is a claim the data does not support — the unchecked
     * eight could contain the £400 one, which reverses it entirely.
     *
     * A range can be honestly partial. A verdict cannot: it is a conclusion,
     * and a conclusion from a third of the evidence is a guess wearing the
     * clothes of an answer.
     */
    const said = summariseSpread({
      checked: [priced(20), priced(22), priced(25)],
      total: 11,
      currency: 'USD',
    });

    expect(said.verdict).toBeNull();
    expect(said.text.toLowerCase()).not.toMatch(/barely matters/);
  });

  it('gives a verdict once every version has been checked', () => {
    const said = summariseSpread({
      checked: [priced(20), priced(22), priced(25)],
      total: 3,
      currency: 'USD',
    });

    expect(said.verdict).toBe('pressing-barely-matters');
    expect(said.partial).toBe(false);
  });

  it('treats "checked more than total" as complete rather than negative', () => {
    // Defensive: a master gaining a version between the count and the fetch
    // must not render "12 of 11".
    const said = summariseSpread({
      checked: [priced(8), priced(400)],
      total: 1,
      currency: 'USD',
    });

    expect(said.partial).toBe(false);
  });

  it('handles nothing checked at all', () => {
    const said = summariseSpread({ checked: [], total: 11, currency: 'USD' });

    expect(said.range).toBeNull();
    expect(said.verdict).toBeNull();
    expect(said.text).toMatch(/could not|none checked|unavailable/i);
  });
});
