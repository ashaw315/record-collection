import { describe, expect, it } from 'vitest';
import type { OwnershipPayload } from '@/lib/discogs/ownership-payload';
import { COMPARISON_COLUMNS, comparisonCells, isOnTheShelf } from './version-row';

/**
 * The version-comparison table (SPEC.md §5.7, §10).
 *
 * This is the moment the app earns its keep: eleven versions of one album, of
 * which four are already on the shelf. A list of eleven is a question; the same
 * eleven with four struck through is an answer.
 *
 * The presentation rules are tested as data because they are RULES, not
 * styling — which columns appear, in which order, and which rows read as
 * already-owned. §10 names the columns and §7.7 names the tiers; getting either
 * wrong makes the table look complete while withholding the comparison.
 */

const unowned: OwnershipPayload = {
  tier: null,
  ownedPressing: null,
  wantedPriority: null,
  isTargetPressing: false,
};

const owned: OwnershipPayload = { ...unowned, tier: 'owned_exact' };
const otherPressing: OwnershipPayload = { ...unowned, tier: 'owned_different_pressing' };
const wanted: OwnershipPayload = { ...unowned, tier: 'wanted', wantedPriority: 1 };

const version = {
  discogsId: 381756,
  title: 'Hear Nothing See Nothing Say Nothing',
  label: 'Clay Records',
  country: 'UK',
  year: 1982,
  catalogNumber: 'CLAY LP 3',
  formats: ['Vinyl', 'LP', 'Album'],
  isReissue: false,
  thumbUrl: 'https://example.test/a.jpg',
  communityHave: 3739,
  communityWant: 2165,
};

describe('which rows read as already on the shelf', () => {
  /**
   * Only tier 1. The user owns THIS pressing, so this row is settled.
   *
   * `owned_different_pressing` must NOT be greyed: the whole reason that tier
   * exists is that the row is still a candidate — possibly a better copy than
   * the one at home. Greying it would answer the question the table was opened
   * to ask.
   */
  it('marks a row owned only when the exact pressing is owned', () => {
    expect(isOnTheShelf(owned)).toBe(true);
  });

  it('does NOT mark a different pressing as on the shelf', () => {
    expect(
      isOnTheShelf(otherPressing),
      'still a candidate — it may be the better copy',
    ).toBe(false);
  });

  it('does not mark a wanted row as on the shelf', () => {
    // Wanting a record is not owning it. Greying it would hide the row the
    // user is most likely to be looking for.
    expect(isOnTheShelf(wanted)).toBe(false);
  });

  it('does not mark an unknown row as on the shelf', () => {
    expect(isOnTheShelf(unowned)).toBe(false);
  });
});

describe('the comparison columns', () => {
  /**
   * §10: "a comparison table with country, year, label, catalog number and
   * format descriptors". All five, side by side — the point of the table is
   * scanning DOWN a column to see how the versions differ.
   */
  it('carries every column §10 names', () => {
    const keys = COMPARISON_COLUMNS.map((column) => column.key);

    expect(keys).toContain('year');
    expect(keys).toContain('country');
    expect(keys).toContain('label');
    expect(keys).toContain('catalogNumber');
    expect(keys).toContain('formats');
  });

  it('orders them by how much they discriminate', () => {
    /**
     * Year first, then country, then catalog. On this master every row is
     * "Clay Records / CLAY LP 3 / UK" — the catalog number identifies nothing
     * because they SHARE it, and the year is what separates a 1982 original
     * from a 1989 reissue.
     *
     * At 390px the later columns are the ones that fall off the edge, so the
     * order decides what is visible where the comparison actually happens.
     */
    const keys = COMPARISON_COLUMNS.map((column) => column.key);

    expect(keys.indexOf('year')).toBeLessThan(keys.indexOf('catalogNumber'));
    expect(keys.indexOf('country')).toBeLessThan(keys.indexOf('label'));
  });

  it('renders each cell as text a person can compare by eye', () => {
    const cells = comparisonCells(version);

    expect(cells.year).toBe('1982');
    expect(cells.country).toBe('UK');
    expect(cells.label).toBe('Clay Records');
    expect(cells.catalogNumber).toBe('CLAY LP 3');
  });

  it('shows the format descriptors that separate a pressing from a reissue', () => {
    // "LP · Album" versus "LP · Reissue" is the difference, and it has to be
    // visible in the cell rather than implied by a flag.
    const cells = comparisonCells({ ...version, formats: ['Vinyl', 'LP', 'Reissue'] });

    expect(cells.formats).toContain('Reissue');
  });

  it('drops the medium from the descriptor cell, since every row shares it', () => {
    /**
     * Every version of a vinyl master says "Vinyl". A column repeating one word
     * on every row costs width at 390px and discriminates nothing — and width
     * is exactly what the comparison needs.
     */
    expect(comparisonCells(version).formats).not.toContain('Vinyl');
  });

  it('says nothing rather than guessing when a field is absent', () => {
    // Discogs rows are sparse. An em dash reads as "not recorded"; an empty
    // cell reads as a rendering bug.
    const cells = comparisonCells({
      ...version,
      year: null,
      country: null,
      catalogNumber: null,
      label: null,
      formats: [],
    });

    expect(cells.year).toBe('—');
    expect(cells.country).toBe('—');
    expect(cells.catalogNumber).toBe('—');
    expect(cells.label).toBe('—');
    expect(cells.formats).toBe('—');
  });

  it('does not put a thousands separator in the year', () => {
    expect(comparisonCells({ ...version, year: 1982 }).year).toBe('1982');
  });
});
