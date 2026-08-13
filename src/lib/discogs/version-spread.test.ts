import { describe, expect, it } from 'vitest';
import { sameFormatFamily, spreadVerdict, summariseSpread } from './version-spread';

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

describe('summariseSpread — the DIRECTIONAL rule (§10a as amended)', () => {
  /**
   * **A range only grows.** Checking more versions can widen a spread but never
   * narrow it, so the two directions carry different evidential weight:
   *
   *   - already wide on a partial sample → the verdict is SAFE. The unchecked
   *     versions cannot bring the ratio back down.
   *   - currently narrow on a partial sample → the verdict is a GUESS. Any
   *     unchecked version could be the £400 one.
   *
   * The naive "withhold on anything partial" rule looked cautious and was
   * worse: combined with MAX_VERSIONS_PRICED = 15 it silenced layer 3 on every
   * master with more than fifteen versions — the popular records, where
   * pressing choice matters most. A verdict that only fires on small masters
   * never fires when it counts. QA found it at 15 of 100 versions, $5.69–$20.69
   * — a 3.64x spread, decisive, and reported as nothing at all.
   */

  it('gives the verdict on a partial sample that is ALREADY wide', () => {
    // QA's actual case: 15 of 100, $5.69-$20.69, ratio 3.64.
    const said = summariseSpread({
      checked: [priced(5.69), priced(20.69)],
      total: 100,
      currency: 'USD',
    });

    expect(said.partial, 'still honestly partial').toBe(true);
    expect(said.verdict, 'and still decisive').toBe('pressing-matters');
    expect(said.text).toMatch(/which pressing|pressing matters/i);
    expect(said.text, 'the sample size is not hidden').toContain('2 of 100');
  });

  it('WITHHOLDS the verdict on a partial sample that is currently narrow', () => {
    /**
     * The direction that cannot be trusted. Three versions between $20 and $25
     * says nothing about the other ninety-seven — one of them could be the
     * expensive one, which reverses the answer entirely.
     */
    const said = summariseSpread({
      checked: [priced(20), priced(22), priced(25)],
      total: 100,
      currency: 'USD',
    });

    expect(said.verdict).toBeNull();
    expect(said.text.toLowerCase()).not.toMatch(/barely/);
    expect(said.text, 'and says why it is not answering').toMatch(/so far|checked/i);
  });

  it('says "barely matters" when the sample is COMPLETE and narrow', () => {
    /**
     * Silence read as a missing feature in QA. "Pressing barely matters here"
     * is a real answer — it tells the collector to buy the cheap copy — and
     * withholding it wastes a fetch that already succeeded.
     */
    const said = summariseSpread({
      checked: [priced(20), priced(22), priced(25)],
      total: 3,
      currency: 'USD',
    });

    expect(said.verdict).toBe('pressing-barely-matters');
    expect(said.text).toMatch(/barely/i);
  });

  it('is the RATIO that decides a partial verdict, not the sample size', () => {
    /**
     * The discriminating pair: both are 2 of 100 checked, and they must differ.
     * A rule keyed on "enough versions seen" would treat them identically and
     * get both wrong.
     */
    const wide = summariseSpread({
      checked: [priced(5), priced(30)],
      total: 100,
      currency: 'USD',
    });
    const narrow = summariseSpread({
      checked: [priced(20), priced(25)],
      total: 100,
      currency: 'USD',
    });

    expect(wide.verdict, '6x on two versions is already decisive').toBe('pressing-matters');
    expect(narrow.verdict, '1.25x on two versions decides nothing').toBeNull();
  });

  it('never reports "barely matters" from a partial sample, at any width', () => {
    /**
     * The direction that must NEVER fire on partial evidence, asserted across
     * the range rather than at one point — this is the claim that would send a
     * collector home with the wrong pressing.
     */
    for (const [low, high] of [
      [20, 21],
      [20, 25],
      [20, 40],
      [20, 59],
    ] as const) {
      const said = summariseSpread({
        checked: [priced(low), priced(high)],
        total: 100,
        currency: 'USD',
      });

      expect(said.verdict, `${low}-${high} partial`).not.toBe('pressing-barely-matters');
    }
  });
});

describe('sameFormatFamily — comparing pressings, not media (§10a)', () => {
  /**
   * QA: the Carpenters master (SP-3502) prices 8-track cartridges and cassettes
   * alongside LPs. Comparing a quadraphonic 8-track to a US LP is not a pressing
   * comparison — the spread measures the FORMAT and calls it pressing variance.
   *
   * Measured on master 84975: 64 vinyl, 17 CD, 11 cassette, 7 8-track, 1
   * reel-to-reel. The first fifteen versions in Discogs order are 12 vinyl and 3
   * other, so the cap spends a fifth of its budget on media the user is not
   * choosing between.
   *
   * **Filtering happens BEFORE the cap**, which is why this is worth doing even
   * though it did NOT fix the Carpenters ratio (see NOTES): the same fifteen
   * calls buy fifteen comparable versions instead of twelve.
   */

  it('keeps vinyl against vinyl', () => {
    expect(sameFormatFamily(['Vinyl', 'LP', 'Album'], ['Vinyl'])).toBe(true);
  });

  it('rejects an 8-track against a vinyl LP', () => {
    // The QA case by name.
    expect(sameFormatFamily(['8-Track Cartridge', 'Album', 'Quadraphonic'], ['Vinyl'])).toBe(false);
  });

  it('rejects a cassette and a CD against vinyl', () => {
    expect(sameFormatFamily(['Cassette', 'Album'], ['Vinyl'])).toBe(false);
    expect(sameFormatFamily(['CD', 'Album', 'Reissue'], ['Vinyl'])).toBe(false);
  });

  it('compares a CD master against CDs, not vinyl', () => {
    /**
     * The family is whatever the user is LOOKING AT, not a hardcoded preference
     * for vinyl. Someone holding a CD is choosing between CD pressings.
     */
    expect(sameFormatFamily(['CD', 'Album'], ['CD'])).toBe(true);
    expect(sameFormatFamily(['Vinyl', 'LP'], ['CD'])).toBe(false);
  });

  it('ignores the descriptors that are NOT the medium', () => {
    /**
     * "Album", "Reissue", "Stereo" and "Quadraphonic" are all in the same
     * flattened list as the medium. A naive intersection would call an
     * 8-Track "Album" and a Vinyl "Album" the same family — which is exactly
     * the comparison this exists to prevent.
     */
    expect(sameFormatFamily(['8-Track Cartridge', 'Album'], ['Vinyl', 'Album'])).toBe(false);
    expect(sameFormatFamily(['Cassette', 'Stereo'], ['Vinyl', 'Stereo'])).toBe(false);
  });

  it('keeps a version whose medium is unknown rather than dropping it', () => {
    /**
     * Discogs data is user-submitted and `major_formats` is sometimes absent.
     * Dropping those would silently shrink the sample on exactly the releases
     * with the poorest data — and an unknown medium is not evidence of a
     * DIFFERENT medium. §10a's absent-versus-unknown rule.
     */
    expect(sameFormatFamily([], ['Vinyl'])).toBe(true);
    expect(sameFormatFamily(['Album', 'Reissue'], ['Vinyl'])).toBe(true);
  });

  it('keeps everything when the viewed release has no known medium', () => {
    // Nothing to compare against: filtering on an unknown would drop the whole
    // table.
    expect(sameFormatFamily(['Vinyl'], [])).toBe(true);
    expect(sameFormatFamily(['CD'], ['Album'])).toBe(true);
  });

  it('treats vinyl sizes as ONE family', () => {
    /**
     * A 7", a 10" and a 12" are all vinyl and all real pressing choices for the
     * same album. `major_formats` says "Vinyl" for each; the size lives in the
     * descriptors, which this deliberately ignores.
     */
    expect(sameFormatFamily(['Vinyl', '7"', 'Single'], ['Vinyl', 'LP'])).toBe(true);
  });
});
