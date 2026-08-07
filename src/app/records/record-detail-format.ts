import type { ConditionGrade } from '@/lib/records/fields';

/**
 * Display decisions for the record detail screen (SPEC.md §10).
 *
 * Every pressing column is nullable, so this is almost entirely about ABSENCE:
 * which fields to omit, which to name, and where a missing value is
 * information rather than a gap.
 */

export type PressingFact = {
  label: string;
  value: string;
  /** Set in mono: a string where one character changes which record it is. */
  mono?: boolean;
};

type PressingFields = {
  catalogNumber: string | null;
  matrixRunout: string | null;
  pressingPlant: string | null;
  yearPressed: number | null;
  countryPressed: string | null;
  vinylWeightGrams: number | null;
  colorVariant: string | null;
  isReissue: boolean;
};

/** `180` → `180 g`. The bare number could be anything. */
export function vinylWeight(grams: number | null): string | undefined {
  return grams === null ? undefined : `${grams} g`;
}

/**
 * The pressing's facts, in reading order, omitting whatever is absent.
 *
 * A screen listing "Pressing plant: —" on every record teaches the reader to
 * skip the block. Returning only what is known means the section's length is
 * itself information: a fully-documented pressing looks different from a stub.
 *
 * Returns `[]` when nothing is known, so the caller renders no section at all
 * rather than an empty one — a found-or-created pressing row can legitimately
 * carry almost nothing (§4).
 */
export function pressingFacts(pressing: PressingFields): PressingFact[] {
  const facts: PressingFact[] = [];

  const push = (label: string, value: string | null | undefined, mono = false) => {
    if (value === null || value === undefined || value === '') return;
    facts.push(mono ? { label, value, mono } : { label, value });
  };

  /**
   * Catalog number and matrix/runout are mono. They are the strings where
   * `ABC-1-A1` and `ABC-l-A1` are different pressings, and the matrix is
   * user-authoritative (CLAUDE.md §8) — read off the dead wax by hand, so it is
   * the field most likely to be compared character by character.
   */
  push('Catalog number', pressing.catalogNumber, true);
  push('Matrix / runout', pressing.matrixRunout, true);
  push('Pressing plant', pressing.pressingPlant);
  // String(), not toLocaleString(): a year is not a quantity and 1982 must not
  // render as "1,982".
  push('Pressed', pressing.yearPressed === null ? null : String(pressing.yearPressed));
  push('Country', pressing.countryPressed);
  push('Weight', vinylWeight(pressing.vinylWeightGrams));
  push('Colour', pressing.colorVariant);

  /**
   * `is_reissue` is a boolean, so false is a real answer rather than an absent
   * one — but only true earns a row. "Reissue: no" on every original is noise;
   * "Reissue" on a reissue is what a collector is looking for.
   */
  if (pressing.isReissue) facts.push({ label: 'Reissue', value: 'Yes' });

  return facts;
}

/**
 * The full name behind a grade, for a title attribute.
 *
 * The abbreviation stays on screen — it is the established vocabulary and a
 * collector reads "VG+" faster than "Very Good Plus" — but the expansion is
 * there for anyone who does not know it.
 */
const GRADE_NAMES: Record<ConditionGrade, string> = {
  M: 'Mint',
  NM: 'Near Mint',
  'VG+': 'Very Good Plus',
  VG: 'Very Good',
  'G+': 'Good Plus',
  G: 'Good',
  F: 'Fair',
  P: 'Poor',
};

export function conditionLabel(grade: string | null): string | undefined {
  // Null is "not yet graded" (§4.2), which is not a grade and must not be
  // given one.
  if (grade === null) return undefined;
  return GRADE_NAMES[grade as ConditionGrade];
}
