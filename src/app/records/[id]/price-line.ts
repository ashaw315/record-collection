import { formatPrice } from '@/app/collection-format';
import type { PriceObservation } from './sparkline';

/**
 * A single price observation, said in full (QA, step 9).
 *
 * The sparkline plots by time and the range gives the bounds — but "3
 * observations, $8.00 to $120.00" cannot say whether the $120 was last week or
 * three years ago, and nothing said which observation was new or used. The
 * reader could see the shape and not the facts behind it.
 */

export type PriceType = 'new' | 'used' | 'asking';

/**
 * What a type MEANS, not what it is called.
 *
 * "Asking" alone does not say that nobody paid it, and that is the entire point
 * of the type — the same reasoning as §7.6's estimated-value sentence, where
 * the figure and its meaning arrive together rather than as a figure and a
 * footnote.
 *
 * This is also the field where §4.2's old `best_dig` produced "$120.00 best
 * dig", read as "best price" (CLAUDE.md §8). A bare enum label would
 * reintroduce that risk in a new vocabulary.
 */
const MEANINGS: Record<PriceType, string> = {
  // Names the CONDITION of the copy, not the recency of the observation — a
  // reader scanning dates would otherwise assume the latter.
  new: 'a sealed copy',
  used: 'what a second-hand copy sold for',
  asking: 'what someone wanted — nobody paid this',
};

/**
 * **Total, because the result is rendered directly.**
 *
 * `MEANINGS` is keyed by the three §7.1 types and `priceLine` reaches it through
 * an unchecked cast on a value typed `string`, so an unrecognised type used to
 * return `undefined` and React rendered nothing — leaving "2026-01-14 $120.00"
 * with no qualifier beside it.
 *
 * That is the `$120.00 best dig` misreading (CLAUDE.md §8) arriving through a
 * missing branch: a bare sum with nothing saying what it is, on the screen
 * where a wrong glance costs money. The gap failed OPEN, toward the
 * confident-looking output.
 *
 * The fallback NAMES the type rather than saying only "unrecognised", so the
 * row stays diagnosable — and reads as a gap in this app's vocabulary rather
 * than as a fact about the record.
 */
export function priceTypeMeaning(type: PriceType): string {
  return MEANINGS[type] ?? `an unrecognised price type (${type})`;
}

export type PriceLine = {
  id: string;
  amount: string;
  date: string;
  meaning: string;
};

function isoDate(value: string | Date): string {
  return (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
}

export function priceLine(observation: PriceObservation): PriceLine {
  return {
    id: observation.id,
    amount: formatPrice(observation.price),
    // The RECORDED date, which is the fact the sparkline plots and the reader
    // could not previously see.
    date: isoDate(observation.recordedAt),
    /**
     * Still a cast, but now a SAFE one: `priceTypeMeaning` is total over
     * `string`, so widening no longer risks `undefined`. The cast remains only
     * because `PriceObservation.priceType` is typed `string` at the query
     * boundary, where the driver hands back whatever the enum column holds.
     */
    meaning: priceTypeMeaning(observation.priceType as PriceType),
  };
}
