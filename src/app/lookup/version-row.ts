import type { OwnershipPayload } from '@/lib/discogs/ownership-payload';
import type { NormalizedVersion } from '@/lib/discogs/normalize-versions';

/**
 * Presentation rules for the version-comparison table (SPEC.md §5.7, §10).
 *
 * These are rules rather than styling, which is why they are here and tested:
 * which columns appear, in what order, and which rows read as already-owned.
 * Get any of them wrong and the table looks complete while withholding the
 * comparison it exists to make.
 *
 * The reading situation is a phone at 390px, held in one hand, in a shop. The
 * user is scanning DOWN a column to see how eleven versions of one album
 * differ — so every column that does not discriminate is width stolen from one
 * that does.
 */

/**
 * Whether this row is settled: the user owns THIS pressing and can stop
 * thinking about it.
 *
 * Only tier 1. `owned_different_pressing` is deliberately NOT on the shelf —
 * that tier exists precisely because the row is still a candidate, possibly a
 * better copy than the one at home. Greying it would answer the question the
 * table was opened to ask (§7.7).
 */
export function isOnTheShelf(ownership: OwnershipPayload): boolean {
  return ownership.tier === 'owned_exact';
}

export type ComparisonColumn = {
  key: 'year' | 'country' | 'label' | 'catalogNumber' | 'formats';
  heading: string;
  /** Dropped first when the viewport cannot hold every column. */
  optionalOnNarrow?: boolean;
};

/**
 * §10's five columns, in a FIXED order. Not derived from the data — deliberately.
 *
 * **Year first because pressing year is the field that varies most reliably
 * across the versions of a master**, whatever else they share. That is a claim
 * about masters in general, not about any one of them: master 50683 happens to
 * read "Clay Records / CLAY LP 3 / UK" on every row, so its catalog number
 * discriminates nothing — but a master spanning US and UK pressings on
 * different labels discriminates differently, and country or label would carry
 * more there.
 *
 * A data-dependent order would serve each master better and is NOT what this
 * is. The order is fixed because the table is read by scanning DOWN a column,
 * and a column that moves between one master and the next makes that scan a
 * fresh puzzle every time — the cost falls on the person comparing, who is
 * standing in a shop. Consistency beats per-master optimality here.
 *
 * If someone later wants to derive this from the data, that is a real design
 * decision with a real trade-off, not a tidy-up. Make it deliberately.
 *
 * At 390px the later columns are the ones that fall off the edge, so this
 * order also decides what is visible where the comparison actually happens.
 * Label goes last: a master's versions are usually one label's reissues, so it
 * is the column most often identical on every row.
 */
export const COMPARISON_COLUMNS: ComparisonColumn[] = [
  { key: 'year', heading: 'Year' },
  { key: 'country', heading: 'Country' },
  { key: 'formats', heading: 'Format' },
  { key: 'catalogNumber', heading: 'Cat. no.' },
  { key: 'label', heading: 'Label', optionalOnNarrow: true },
];

/** An em dash reads as "not recorded"; an empty cell reads as a bug. */
const ABSENT = '—';

function orAbsent(value: string | null): string {
  return value === null || value.trim() === '' ? ABSENT : value;
}

export function comparisonCells(
  version: Pick<
    NormalizedVersion,
    'year' | 'country' | 'label' | 'catalogNumber' | 'formats'
  >,
): Record<ComparisonColumn['key'], string> {
  /**
   * The medium is dropped: every version of a vinyl master says "Vinyl", so
   * the word costs width on every row and discriminates nothing. What is left
   * — "LP · Album" against "LP · Reissue" — is exactly the difference the user
   * is looking for.
   */
  const descriptors = version.formats.filter(
    (descriptor) => !/^(vinyl|cd|cassette|file)$/i.test(descriptor.trim()),
  );

  return {
    // String(), not toLocaleString(): 1,982 is not a year.
    year: version.year === null ? ABSENT : String(version.year),
    country: orAbsent(version.country),
    label: orAbsent(version.label),
    catalogNumber: orAbsent(version.catalogNumber),
    formats: descriptors.length === 0 ? ABSENT : descriptors.join(' · '),
  };
}
