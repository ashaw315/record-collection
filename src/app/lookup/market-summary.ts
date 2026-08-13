import {
  CONDITION_ORDER,
  formatMarketPrice,
  type ConditionPrice,
  type NormalizedMarket,
} from '@/lib/discogs/normalize-market';

/**
 * How §10a's market data reads on screen.
 *
 * Pure, because the WORDING is where §10a's never-list actually lives — most of
 * that section is about what the copy may claim, and a component test would
 * confirm whatever string the component happened to hold.
 */

export type MarketView = NormalizedMarket & { rangeUnavailable?: boolean };

/**
 * The three grades a second-hand buyer realistically meets.
 *
 * Six grades is a table; three is a sentence. Mint is rare enough that leading
 * with it misleads, and Fair/Poor are not what someone is choosing between with
 * a record in their hand.
 */
const HIGHLIGHT_GRADES = [
  'Very Good (VG)',
  'Very Good Plus (VG+)',
  'Near Mint (NM or M-)',
] as const;

/**
 * Worst to best — the direction a price ladder is scanned, and the direction
 * that makes the spread legible: you read up until the price stops being worth
 * it.
 */
export function ladderHighlights(conditions: ConditionPrice[]): ConditionPrice[] {
  const preferred = conditions.filter((row) =>
    (HIGHLIGHT_GRADES as readonly string[]).includes(row.grade),
  );

  /**
   * All three preferred grades, or everything — never a partial filter.
   *
   * A first version fell back only when NO preferred grade matched, so a ladder
   * of {NM, Good} rendered as NM alone: a priced grade dropped silently. That is
   * the mirror of the interpolation §10a forbids — inventing a number and losing
   * one are both the panel misrepresenting what Discogs said.
   */
  const chosen = preferred.length === HIGHLIGHT_GRADES.length ? preferred : conditions;

  return [...chosen].sort(
    (a, b) => CONDITION_ORDER.indexOf(b.grade) - CONDITION_ORDER.indexOf(a.grade),
  );
}

export function marketSummary(market: MarketView): string {
  const currency = market.currency ?? 'USD';

  /**
   * Absence of INFORMATION, distinguished from absence of COPIES.
   *
   * Zero for sale is a fact about a scarce record and is useful in a shop; a
   * failed fetch is not knowing. Rendering both the same way would turn an
   * outage into a claim about scarcity.
   */
  if (market.numForSale === null) {
    return 'No market data — Discogs could not be reached for this release.';
  }

  if (market.numForSale === 0) {
    return 'None for sale on Discogs right now.';
  }

  /**
   * "asking", never "worth" or "value". §10a: "Never imply the app knows what a
   * specific copy is worth." The floor is one listing at a condition nobody
   * stated — the same distinction that got `best_dig` out of the price enum and
   * that the record's own observation list makes: wanted is not paid.
   */
  const floor =
    market.lowestPrice === null
      ? ''
      : `, cheapest asking ${formatMarketPrice(market.lowestPrice.value, market.lowestPrice.currency)}`;

  const copies = `${market.numForSale} for sale${floor}.`;

  if (market.conditions.length === 0) {
    // §10a: say the range is unavailable rather than leaving an absence the
    // reader has to interpret as "nobody has priced this".
    return `${copies} No condition guide available for this release.`;
  }

  /**
   * "Estimates" is load-bearing. The endpoint is `price_suggestions`: Discogs
   * MODELS these numbers and nobody has paid $145.80 for this record. Calling
   * them sales would be a suggestion wearing the clothes of a fact.
   */
  const ladder = ladderHighlights(market.conditions)
    .map((row) => `${shortGrade(row.grade)} ${formatMarketPrice(row.value, currency)}`)
    .join(' · ');

  return `${copies} Discogs estimates ${ladder}.`;
}

/**
 * "Very Good Plus (VG+)" → "VG+": the abbreviation is what a collector reads.
 *
 * Discogs' parenthetical for Near Mint carries an alternative spelling — "NM or
 * M-" — which reads as noise beside a clean VG and VG+, and turns a three-item
 * ladder into a paragraph. Truncated at the first alternative.
 */
function shortGrade(grade: string): string {
  const match = /\(([^)]+)\)/.exec(grade);
  if (match === null) return grade;

  return match[1].split(/\s+or\s+/)[0];
}
