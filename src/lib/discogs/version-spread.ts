import { formatMarketPrice } from './normalize-market';

/**
 * SPEC.md §10a layer 3 — "does pressing matter here?"
 *
 * Computed from the spread of `lowest_price` across a master's versions, which
 * no single release can supply: "versions spanning £8 to £400 mean the pressing
 * matters more than the price; everything between £10 and £25 means it barely
 * does."
 *
 * **Pure, because the partial case is a judgement rather than a fetch.** One
 * call per version against a 60/minute budget means a spread can run out
 * half-finished, and what may honestly be said from an incomplete sample is the
 * decision this module encodes.
 */

export type VersionPrice = { discogsId: number; lowestPrice: number | null };

export type SpreadVerdict = 'pressing-matters' | 'pressing-barely-matters';

export type SpreadSummary = {
  range: { low: number; high: number } | null;
  /** `null` whenever the sample cannot support a conclusion — see below. */
  verdict: SpreadVerdict | null;
  partial: boolean;
  text: string;
};

/**
 * Wide enough that the pressing is the thing to get right.
 *
 * A RATIO, not a difference. $10–$25 and $400–$415 are both a $15 spread and
 * completely different facts: the first is 2.5× and worth knowing, the second is
 * 4% on an expensive record and is noise. An absolute threshold would label
 * every expensive master "pressing matters" — the reverse of useful, since those
 * are exactly the ones a collector already knows about.
 */
const WIDE_RATIO = 3;

export function spreadVerdict(range: { low: number; high: number } | null): SpreadVerdict | null {
  // One price is not a spread, and calling it "barely matters" would claim a
  // comparison nobody made.
  if (range === null || range.low <= 0 || range.high === range.low) return null;

  return range.high / range.low >= WIDE_RATIO ? 'pressing-matters' : 'pressing-barely-matters';
}

export function summariseSpread(input: {
  checked: VersionPrice[];
  /** How many versions the master has, so a partial sample can say so. */
  total: number;
  currency: string;
}): SpreadSummary {
  // A version nobody is selling has NO price — not a price of zero, which would
  // drag every low end to nothing and make each master look like it spans
  // everything.
  const prices = input.checked
    .map((version) => version.lowestPrice)
    .filter((price): price is number => price !== null);

  // `>=` rather than `===`: a master gaining a version between the count and the
  // fetch must not render "12 of 11".
  const partial = input.checked.length < input.total;

  if (input.checked.length === 0) {
    return {
      range: null,
      verdict: null,
      partial,
      text: 'Could not check the other pressings just now.',
    };
  }

  if (prices.length === 0) {
    return {
      range: null,
      verdict: null,
      partial,
      text: 'None of the pressings checked are for sale right now.',
    };
  }

  const range = { low: Math.min(...prices), high: Math.max(...prices) };

  /**
   * **The verdict is withheld on a partial sample, and the range is not.**
   *
   * A range can be honestly partial — "of the ones checked" is true and useful.
   * A verdict cannot: "the pressing barely matters" from three of eleven
   * versions is a conclusion the evidence does not support, and the eight
   * unchecked could contain the one that reverses it.
   */
  const verdict = partial ? null : spreadVerdict(range);

  const money = (value: number) => formatMarketPrice(value, input.currency);
  const spread = range.low === range.high ? money(range.low) : `${money(range.low)}–${money(range.high)}`;

  if (partial) {
    return {
      range,
      verdict,
      partial,
      text: `${input.checked.length} of ${input.total} pressings checked so far — ${spread}.`,
    };
  }

  const conclusion =
    verdict === 'pressing-matters'
      ? ' Which pressing you get matters more than the price.'
      : verdict === 'pressing-barely-matters'
        ? ' The pressing barely changes the price.'
        : '';

  return {
    range,
    verdict,
    partial,
    text: `${input.total} pressing${input.total === 1 ? '' : 's'}, ${spread}.${conclusion}`,
  };
}
