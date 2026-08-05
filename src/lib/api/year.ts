import { z } from 'zod';
/**
 * SPEC.md §4.1: `artists.formed_year` is validated to
 * `1877 <= year <= currentYear + 1` at the API boundary.
 *
 * 1877 is the year sound recording began, so no recording artist predates it.
 * The +1 allows a band announced for next year. This is a product judgement
 * rather than a database constraint — verified: the database accepts -5000 and
 * 999999 without complaint, so this module is the only thing standing between a
 * typo and §8's graph and shelf ordering.
 */

export const FORMED_YEAR_MIN = 1877;

/**
 * The clock is a parameter, not a module-level read.
 *
 * A serverless instance that boots in December and stays warm into January
 * would, with a bound computed at module load, reject the genuine current year
 * — and no ordinary test would catch it, because a test run never spans New
 * Year. Injecting the clock is what makes that case testable at all.
 */
export type Clock = () => Date;

const systemClock: Clock = () => new Date();

/**
 * UTC, not local time. `getFullYear()` reads the server's timezone, so the
 * bound would move at local midnight and the same instant would be a different
 * "current year" in different deployment regions — verified:
 * `2031-01-01T00:00:01Z` is still 2030 in America/New_York. UTC makes the
 * rollover one well-defined instant everywhere.
 */
export function formedYearBounds(clock: Clock = systemClock): { min: number; max: number } {
  return { min: FORMED_YEAR_MIN, max: clock().getUTCFullYear() + 1 };
}

export function isValidFormedYear(year: number, clock: Clock = systemClock): boolean {
  if (!Number.isSafeInteger(year)) return false;

  const { min, max } = formedYearBounds(clock);
  return year >= min && year <= max;
}

/** The message shown when the bound rejects a value, with the live bounds in it. */
export function formedYearMessage(clock: Clock = systemClock): string {
  const { min, max } = formedYearBounds(clock);
  return `formedYear must be between ${min} and ${max}`;
}

/**
 * The Zod schema for `formed_year`, defined here so POST and PATCH share ONE
 * bound. A second copy in the other route file is how the two drift — the bound
 * is easy to wire into create and forget on update.
 *
 * `error` is a FUNCTION, not a precomputed string: `message: formedYearMessage()`
 * would freeze the bounds at module load, the very trap §4.1 warns about, and a
 * warm instance would report last year's upper bound in the error it returns.
 */
export const formedYearSchema = z
  .number()
  .refine((value) => isValidFormedYear(value), { error: () => formedYearMessage() })
  .nullish();
