/**
 * Display helpers for the want-list screen (SPEC.md §10).
 *
 * CLAUDE.md §8 names one domain error this app must never make: **"best dig"
 * means the highest-fidelity pressing worth hunting for. It does not mean the
 * cheapest, the best deal, or the best price.** `max_price` is separate and
 * unrelated — the user's own ceiling.
 *
 * The labels are exported as DATA rather than written into JSX so the copy is
 * testable. A well-meaning edit to "Best price" would otherwise pass every test
 * in the suite while making the app confidently misleading about its domain,
 * which is worse than obviously broken.
 */

/** About the PRESSING. Never about price, deals, value or worth. */
export const BEST_DIG_LABEL = 'Best dig — the pressing to hunt for';

/** The user's OWN limit. Never an appraisal: this app never values a record. */
export const MAX_PRICE_LABEL = "Most I'll pay";

/**
 * The ceiling, or `undefined` when none was set.
 *
 * Omitted rather than rendered as zero — "£0.00" reads as "I will pay nothing",
 * which is a different statement from "I have not decided".
 *
 * The amount stays a STRING throughout, as `purchase_price` does (§4.2): the
 * NUMERIC(10,2) column exists to keep money off a float, and parsing here would
 * undo that. Truncates rather than rounds, so a displayed ceiling is never
 * higher than the one recorded.
 */
export function formatCeiling(maxPrice: string | null): string | undefined {
  if (maxPrice === null) return undefined;

  const [whole, fraction = ''] = maxPrice.split('.');
  return `£${whole}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

/**
 * §4.2: "1 = highest, 5 = lowest". A bare number cannot tell the reader which
 * end is the top, and getting it backwards at a glance is the whole failure
 * mode of a priority column.
 */
const PRIORITY_NAMES: Record<number, string> = {
  1: 'Highest',
  2: 'High',
  3: 'Medium',
  4: 'Low',
  5: 'Lowest',
};

export function priorityLabel(priority: number): string {
  // A row written before the 1-5 bound existed still has to render.
  return PRIORITY_NAMES[priority] ?? String(priority);
}

type TargetPressing = {
  catalogNumber: string | null;
  countryPressed: string | null;
  yearPressed: number | null;
  matrixRunout: string | null;
};

/**
 * The target pressing at a glance (§10: "Each row shows target pressing and
 * best-dig notes").
 *
 * Catalog number, country and year are what a collector matches against in a
 * shop. The matrix is the FALLBACK rather than part of the summary: it is the
 * dead-wax fingerprint and identifies the pressing precisely, but it is long
 * and only useful once you have the record in hand.
 */
export function targetPressingSummary(
  pressing: TargetPressing | null,
): string | undefined {
  if (pressing === null) return undefined;

  const parts = [
    pressing.catalogNumber,
    pressing.countryPressed,
    // String(), not toLocaleString(): a year is not a quantity, and 1982 must
    // not render as "1,982".
    pressing.yearPressed === null ? null : String(pressing.yearPressed),
  ].filter((part): part is string => part !== null && part.trim() !== '');

  if (parts.length > 0) return parts.join(' · ');

  // Nothing conventional to show, but the matrix still identifies it.
  const matrix = pressing.matrixRunout;
  return matrix === null || matrix.trim() === '' ? undefined : matrix;
}
