import { describe, expect, it } from 'vitest';
import { formatPrice, formatYear, matchExplanation, recordLine } from './collection-format';

/**
 * Display helpers for the collection list (SPEC.md §10).
 *
 * These are pure and live apart from the component because they carry the
 * decisions — what an absent value looks like, when a match explanation is
 * worth showing — and a decision embedded in JSX can only be tested by
 * rendering.
 */

describe('formatYear', () => {
  it('renders a year as a plain four-digit string', () => {
    expect(formatYear(1982)).toBe('1982');
  });

  it('renders an em dash for an undated record', () => {
    /**
     * NOT an empty string. §4.2 makes release_year nullable so a record can be
     * logged before its year is known, and a blank cell reads as a rendering
     * fault in a dense ledger. A dash says "known to be absent".
     */
    expect(formatYear(null)).toBe('—');
  });
});

describe('formatPrice', () => {
  it('renders a NUMERIC string with two decimals and a currency mark', () => {
    expect(formatPrice('24.50')).toBe('$24.50');
  });

  it('pads a whole-pound amount to two decimals so a column aligns', () => {
    expect(formatPrice('8.00')).toBe('$8.00');
    expect(formatPrice('8')).toBe('$8.00');
  });

  it('renders an em dash when no price was recorded', () => {
    expect(formatPrice(null)).toBe('—');
  });

  /**
   * purchase_price is NUMERIC(10,2) carried as a STRING end to end so it never
   * routes through a float (§4.2; the stats endpoint sums it in SQL for the
   * same reason).
   *
   * An earlier version of this test used '12345678.91' to assert "beyond float
   * precision". That was DECORATIVE and was removed: NUMERIC(10,2) allows at
   * most 8 digits before the decimal, which is comfortably inside double
   * precision, so no value the column can hold distinguishes the two
   * implementations. Verified by enumerating candidates rather than assuming.
   *
   * What DOES distinguish them is rounding. `Number('8.567').toFixed(2)` rounds
   * UP to 8.57; string truncation gives 8.56. Truncation is correct here — a
   * displayed price the user never paid is a misstatement, and this app shows
   * prices as information only (CLAUDE.md §8). A third decimal should not
   * reach this helper from a NUMERIC(10,2) column, but it can arrive from an
   * unsaved form value, and rounding it silently is the wrong failure.
   */
  it('truncates rather than rounding a surplus decimal place', () => {
    expect(formatPrice('8.567')).toBe('$8.56');
  });
});

describe('recordLine', () => {
  it('joins artist and title with an en dash', () => {
    expect(recordLine('Discharge', 'Hear Nothing See Nothing Say Nothing')).toBe(
      'Discharge – Hear Nothing See Nothing Say Nothing',
    );
  });
});

/**
 * SPEC.md §5.2's matchedVia, rendered.
 *
 * The whole point of the field: under a Punk filter, a record badged only
 * "Crust" must say why it is there. These cases decide WHEN that line appears,
 * which is a display rule rather than an API concern.
 */
describe('matchExplanation', () => {
  const punk = { id: 'g-punk', name: 'Punk' };
  const crust = { id: 'g-crust', name: 'Crust' };
  const oi = { id: 'g-oi', name: 'Oi!' };

  it('is undefined when no genre filter is applied', () => {
    expect(matchExplanation(null)).toBeUndefined();
  });

  it('names the filtered genre and the descendant that matched', () => {
    expect(matchExplanation({ filtered: punk, descendants: [crust] })).toBe('in Punk via Crust');
  });

  /**
   * SUPPRESSED for a direct tag. §5.2 puts the filtered genre itself in
   * `descendants` when the record carries it directly, so the naive rendering
   * is "in Punk via Punk" — noise on what is usually the majority of rows.
   */
  it('is undefined when the record is tagged with the filtered genre itself', () => {
    expect(matchExplanation({ filtered: punk, descendants: [punk] })).toBeUndefined();
  });

  /**
   * NEVER truncated. A record matching through two descendants names both:
   * picking one is the genre-flattening CLAUDE.md §8 forbids, and it is exactly
   * the kind of shortcut a display layer takes for tidiness.
   */
  it('names every descendant a record matched through', () => {
    expect(matchExplanation({ filtered: punk, descendants: [crust, oi] })).toBe(
      'in Punk via Crust and Oi!',
    );
  });

  it('separates three or more with commas and a final and', () => {
    const anarcho = { id: 'g-an', name: 'Anarcho' };
    expect(matchExplanation({ filtered: punk, descendants: [crust, oi, anarcho] })).toBe(
      'in Punk via Crust, Oi! and Anarcho',
    );
  });

  /**
   * A direct tag ALONGSIDE a descendant still explains itself: the record is
   * in Punk both directly and via Crust, and the reason worth showing is the
   * one the user cannot see on the badges. The filtered genre is dropped from
   * the list rather than suppressing the whole line.
   */
  it('drops the filtered genre from the list but keeps the others', () => {
    expect(matchExplanation({ filtered: punk, descendants: [punk, crust] })).toBe(
      'in Punk via Crust',
    );
  });

  it('is undefined when descendants is empty', () => {
    // §5.2 says this cannot happen on a matched row. Handled rather than
    // asserted: a display helper that throws on unexpected data takes the
    // whole page down, and there is nothing useful to say here anyway.
    expect(matchExplanation({ filtered: punk, descendants: [] })).toBeUndefined();
  });
});
