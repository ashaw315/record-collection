import { describe, expect, it } from 'vitest';
import { marketSummary, ladderHighlights } from './market-summary';

/**
 * How §10a's market data reads on screen.
 *
 * Pure, because the WORDING carries the constraints — §10a's never-list is
 * mostly about what the copy claims, and a component test would confirm
 * whatever string the component happened to hold.
 */

const FULL = {
  numForSale: 11,
  lowestPrice: { value: 47.28, currency: 'USD' },
  conditions: [
    { grade: 'Mint (M)' as const, value: 145.8 },
    { grade: 'Near Mint (NM or M-)' as const, value: 130.45 },
    { grade: 'Very Good Plus (VG+)' as const, value: 99.76 },
    { grade: 'Very Good (VG)' as const, value: 69.06 },
    { grade: 'Good Plus (G+)' as const, value: 38.37 },
    { grade: 'Good (G)' as const, value: 23.02 },
  ],
  range: { low: 23.02, high: 145.8 },
  currency: 'USD',
  rangeUnavailable: false,
};

describe('marketSummary — layer 1', () => {
  it('states the count and the floor together', () => {
    const said = marketSummary(FULL);

    expect(said).toContain('11 for sale');
    expect(said).toContain('$47.28');
  });

  it('calls the floor the CHEAPEST ASKING price, not a value', () => {
    /**
     * §10a: "Never imply the app knows what a specific copy is worth." The
     * floor is one listing at a condition nobody stated — calling it "worth
     * $47.28" would claim exactly what the section forbids.
     *
     * Same distinction that got `best_dig` out of the price enum and that the
     * observation list makes: wanted is not paid.
     */
    const said = marketSummary(FULL);

    expect(said).toMatch(/asking|cheapest|from/i);
    expect(said.toLowerCase()).not.toMatch(/\bworth\b/);
    expect(said.toLowerCase()).not.toMatch(/\bvalue\b/);
  });

  it('says nothing is for sale rather than reporting a floor of zero', () => {
    const said = marketSummary({ ...FULL, numForSale: 0, lowestPrice: null, conditions: [], range: null });

    expect(said).toMatch(/none for sale|nobody is selling|no copies/i);
    expect(said).not.toContain('$0.00');
  });

  it('distinguishes "no copies listed" from "we could not find out"', () => {
    /**
     * The discriminating case. Zero for sale is a FACT about a scarce record —
     * genuinely useful in a shop. A failed fetch is the absence of information.
     * Rendering both as "none for sale" would turn an outage into a claim about
     * scarcity.
     */
    const unknown = marketSummary({ ...FULL, numForSale: null, lowestPrice: null, conditions: [], range: null });
    const none = marketSummary({ ...FULL, numForSale: 0, lowestPrice: null, conditions: [], range: null });

    expect(unknown).not.toEqual(none);
    expect(unknown).toMatch(/could not|unavailable|no market data/i);
  });
});

describe('ladderHighlights — layer 2', () => {
  it('picks the grades a buyer actually meets', () => {
    /**
     * Six grades is a table; three is a sentence. VG, VG+ and NM are the range
     * a second-hand record is realistically sold in — Mint is rare enough to
     * mislead as a headline, and Fair/Poor are not what someone is deciding
     * between in a shop.
     */
    const shown = ladderHighlights(FULL.conditions);

    expect(shown.map((row) => row.grade)).toEqual([
      'Very Good (VG)',
      'Very Good Plus (VG+)',
      'Near Mint (NM or M-)',
    ]);
  });

  it('reads worst to best, which is how a price ladder is scanned', () => {
    const shown = ladderHighlights(FULL.conditions);
    const values = shown.map((row) => row.value);

    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('shows what exists when the preferred grades are missing', () => {
    // A release priced only at the extremes still has something to say.
    const shown = ladderHighlights([
      { grade: 'Mint (M)', value: 145.8 },
      { grade: 'Good (G)', value: 23.02 },
    ]);

    expect(shown.map((row) => row.grade)).toEqual(['Good (G)', 'Mint (M)']);
  });

  it('returns nothing for an empty ladder rather than inventing a row', () => {
    expect(ladderHighlights([])).toEqual([]);
  });

  it('never interpolates a grade that was not priced', () => {
    // §10a forbids interpolation explicitly. Two grades in, two grades out.
    const shown = ladderHighlights([
      { grade: 'Near Mint (NM or M-)', value: 130.45 },
      { grade: 'Good (G)', value: 23.02 },
    ]);

    expect(shown).toHaveLength(2);
    expect(shown.some((row) => row.grade === 'Very Good (VG)')).toBe(false);
  });
});

describe('grade abbreviations read as a collector writes them', () => {
  it('shortens "Near Mint (NM or M-)" to NM, not "NM or M-"', () => {
    /**
     * Discogs' parenthetical carries an alternative spelling — "NM or M-" —
     * which reads as noise beside a clean "VG" and "VG+" and makes a three-item
     * ladder look like a paragraph. A collector writes NM.
     */
    const said = marketSummary(FULL);

    expect(said).toContain('NM $130.45');
    expect(said).not.toContain('NM or M-');
  });

  it('leaves the other grades as their own abbreviations', () => {
    const said = marketSummary(FULL);

    expect(said).toContain('VG $69.06');
    expect(said).toContain('VG+ $99.76');
  });
});

describe('what the copy must never say', () => {
  it('never presents the ladder as prices that were paid', () => {
    /**
     * These are Discogs ESTIMATES — the endpoint is `price_suggestions`, and
     * nobody has paid $145.80 for this record. Labelling them as sales would be
     * the same error as `best_dig` in the price enum: a suggestion wearing the
     * clothes of a fact.
     */
    const said = marketSummary(FULL);

    expect(said.toLowerCase()).not.toMatch(/\bsold for\b/);
    expect(said.toLowerCase()).not.toMatch(/\bpaid\b/);
  });

  it('labels the ladder as an estimate', () => {
    expect(marketSummary(FULL)).toMatch(/estimate|suggested|guide/i);
  });

  it('never says "best dig" or "best price"', () => {
    // CLAUDE.md §8, in copy that sits beside three other money figures.
    const said = marketSummary(FULL).toLowerCase();

    expect(said).not.toContain('best dig');
    expect(said).not.toContain('best price');
  });
});
