/**
 * SPEC.md §10a layers 1 and 2 — scarcity, floor, and the condition ladder.
 *
 * Two payloads, one shape. Layer 1 (`marketplace/stats`) is free — it rides the
 * release fetch — and layer 2 (`price_suggestions`) needs completed Discogs
 * seller settings on the token's account, returning `404` without them. §10a:
 * "later layers degrade to absence, never to a guess."
 *
 * **Currency, measured 2026-08-12 rather than assumed.** `stats` honours
 * `curr_abbr` (EUR 41.14 / USD 47.28 / GBP 34.99 for one release);
 * `price_suggestions` IGNORES it and returns USD regardless — even against a
 * profile set to EUR. So layer 1 requests `curr_abbr=USD`, which is the only
 * value that makes the two agree. Converting between them would invent a number
 * nobody quoted.
 */

/**
 * Discogs' condition grades, best to worst — the order a ladder is read in.
 *
 * Fixed rather than derived from the payload: JS object key order is insertion
 * order, so trusting it works until Discogs sends the grades differently and
 * the ladder silently reorders. A grade outside this list is dropped rather
 * than placed arbitrarily, because an unknown grade cannot be ranked against
 * the others and guessing misrepresents the spread.
 */
export const CONDITION_ORDER = [
  'Mint (M)',
  'Near Mint (NM or M-)',
  'Very Good Plus (VG+)',
  'Very Good (VG)',
  'Good Plus (G+)',
  'Good (G)',
  'Fair (F)',
  'Poor (P)',
] as const;

export type ConditionGrade = (typeof CONDITION_ORDER)[number];

export type ConditionPrice = { grade: ConditionGrade; value: number };

export type NormalizedMarket = {
  /** Layer 1: how many copies are listed. `null` means unknown, not zero. */
  numForSale: number | null;
  /** Layer 1: the cheapest listing, at an unknown condition. */
  lowestPrice: { value: number; currency: string } | null;
  /** Layer 2: the ladder, best grade first. Empty when unavailable. */
  conditions: ConditionPrice[];
  /** Layer 2 as a range — §10a: "a range, never a single number". */
  range: { low: number; high: number } | null;
  currency: string | null;
};

/** Discogs sends full float precision — 145.79866227900087 — which no shop quotes. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function isPriced(value: unknown): value is { value: number; currency: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { value?: unknown }).value === 'number'
  );
}

export function normalizeMarket(input: {
  stats: Record<string, unknown> | null;
  suggestions: Record<string, unknown> | null;
}): NormalizedMarket {
  const rawLowest = input.stats?.lowest_price;
  const lowestPrice = isPriced(rawLowest)
    ? { value: round(rawLowest.value), currency: String(rawLowest.currency ?? 'USD') }
    : null;

  const conditions: ConditionPrice[] = [];
  for (const grade of CONDITION_ORDER) {
    const entry = input.suggestions?.[grade];
    if (isPriced(entry)) conditions.push({ grade, value: round(entry.value) });
  }

  const values = conditions.map((row) => row.value);
  const range =
    values.length === 0 ? null : { low: Math.min(...values), high: Math.max(...values) };

  /**
   * Carried from the payload, never assumed. If Discogs starts returning
   * something other than USD, that surfaces as a visible mismatch rather than a
   * wrong symbol beside a right number.
   */
  const firstSuggestion = CONDITION_ORDER.map((grade) => input.suggestions?.[grade]).find(isPriced);
  const currency =
    (firstSuggestion === undefined ? null : String(firstSuggestion.currency ?? 'USD')) ??
    lowestPrice?.currency ??
    null;

  return {
    numForSale: typeof input.stats?.num_for_sale === 'number' ? input.stats.num_for_sale : null,
    lowestPrice,
    conditions,
    range,
    currency: currency ?? lowestPrice?.currency ?? null,
  };
}

/** Symbols for the currencies Discogs actually returns here. */
const SYMBOLS: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', JPY: '¥' };

/**
 * A market figure with ITS OWN currency, not the app's.
 *
 * The rest of the app renders `£` (a step 5 assumption — SPEC.md names no
 * currency) while these figures are USD from Discogs. A number beside the wrong
 * symbol is the confidently-wrong shape §8 warns about, applied to money.
 *
 * An unknown currency falls back to its code: "SEK 120.00" is honest where a
 * guessed symbol is not.
 */
export function formatMarketPrice(value: number, currency: string): string {
  const amount = value.toFixed(2);
  const symbol = SYMBOLS[currency];

  return symbol === undefined ? `${currency} ${amount}` : `${symbol}${amount}`;
}
