import { formatMoney } from '@/lib/money';
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
 * §10a's two market figures, labelled beside §7.2's ceiling.
 *
 * Three quantities on one row all render as money — the user's DECISION, a
 * seller's LISTING, and Discogs' MODEL — which is exactly the confusion §7.2
 * exists to prevent between the first two. Each says what it is in words rather
 * than relying on sitting in a different block.
 *
 * Never "worth" or "value" (§10a: the app does not know what a specific copy is
 * worth), never "sold" or "paid" (the endpoint is `price_suggestions` — nobody
 * paid these), and never "best dig", which names a PRESSING and is already the
 * label of the notes field on this same screen.
 */
/**
 * The QUESTION this panel answers on the want list, per §10a's table — "is my
 * ceiling realistic?". Not a restatement of the figure: `marketSummary` already
 * says "cheapest asking $47.28", and a heading repeating it read as duplication
 * on screen. Caught in a screenshot, not by an assertion.
 */
export const MARKET_FLOOR_LABEL = 'On the market now';
export const MARKET_RANGE_LABEL = 'Discogs estimates by condition';

/**
 * The ceiling, or `undefined` when none was set.
 *
 * Omitted rather than rendered as zero — "$0.00" reads as "I will pay nothing",
 * which is a different statement from "I have not decided".
 *
 * The amount stays a STRING throughout, as `purchase_price` does (§4.2): the
 * NUMERIC(10,2) column exists to keep money off a float, and parsing here would
 * undo that. Truncates rather than rounds, so a displayed ceiling is never
 * higher than the one recorded.
 */
export function formatCeiling(maxPrice: string | null): string | undefined {
  // `absent: undefined` keeps this row OMITTED rather than dashed — see the
  // note above: a dash beside a ceiling reads as "I will pay nothing".
  return formatMoney(maxPrice, { absent: undefined });
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
