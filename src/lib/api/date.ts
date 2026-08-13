import { z } from 'zod';

/**
 * A calendar date as `YYYY-MM-DD` (SPEC.md §4.2's `DATE` columns).
 *
 * `/^\d{4}-\d{2}-\d{2}$/` alone validates SHAPE, not validity: `2026-13-45`,
 * `2026-02-30` and `0000-00-00` all match it. Those reached a `DATE` column and
 * Postgres rejected them, so a plain client mistake surfaced as a 500 with a
 * driver error in the log instead of the 400 §5 requires.
 *
 * Defined once and shared, the same reasoning as `yearSchema` — the year bound
 * had been copied five times before it was consolidated, and this rule was
 * already in two places (create and PATCH) when the defect was found.
 */

const SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whether the date exists in the calendar.
 *
 * Round-trips through `Date` rather than checking ranges per field, because a
 * per-field check (month 1-12, day 1-31) still accepts 31 April and 29 February
 * in a non-leap year. Constructing the UTC date and reading the components back
 * asks the calendar itself: a normalised value that no longer matches what was
 * asked for was never a real date.
 *
 * UTC deliberately — `new Date('2026-08-08')` is parsed as UTC midnight, and a
 * local-time construction shifts the day backwards west of Greenwich, which
 * would reject valid dates for some users and not others.
 */
function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function isCalendarDate(value: string): boolean {
  const match = SHAPE.exec(value);
  if (match === null) return false;

  const [, year, month, day] = match;

  /**
   * Years 0-99 need no special case, though it looks as if they should.
   * `Date.UTC` maps them onto 1900-1999 — but that is exactly why the
   * round-trip rejects them: `Date.UTC(0, 0, 1)` reads back as 1900, which does
   * not equal the 0 that was asked for. Probed rather than assumed; an explicit
   * `year === '0000'` guard was written first and removed when it turned out to
   * fail no test because this comparison already covers it.
   */
  return isRealDate(Number(year), Number(month), Number(day));
}

/**
 * @param label Human-readable field name for the message, e.g. "Purchase date".
 *   §4.1's amended rule: an error names the field in terms the user recognises
 *   from the form, not the JSON key.
 */
export function dateSchema(label: string) {
  return z
    .string()
    .refine(isCalendarDate, `${label} must be a real date in YYYY-MM-DD form`)
    .nullish();
}

/** 1877: the year sound recording began. Shared with §4.1's year rule. */
export const COLLECTION_DATE_MIN = '1877-01-01';

/** The clock as a parameter — see the note on the schema below. */
export type DateClock = () => Date;

const systemClock: DateClock = () => new Date();

function todayIso(clock: DateClock): string {
  // UTC, matching the database's `CURRENT_DATE` on a UTC server. A local-time
  // read would differ by a day either side of midnight.
  return clock().toISOString().slice(0, 10);
}

/**
 * A calendar date bounded to when a record collection can plausibly exist.
 *
 * `dateSchema` rejects `2026-13-45`, which is not a day. It cannot reject
 * `1823-04-11`, which is a real day and — in a purchase date or a journal entry
 * — a typo. §4.1 bounds the year fields for exactly this reason; these are the
 * same argument applied to dates.
 *
 * **The upper bound is TODAY, not next year.** §4.1 allows `currentYear + 1`
 * because a band can be announced for next year. You cannot have bought a
 * record tomorrow, or written a note about playing one.
 *
 * **The clock is a parameter**, per §4.1: a serverless instance that boots in
 * December and stays warm into January would, with a bound computed at module
 * load, reject the genuine current date — and no ordinary test catches it,
 * because a test run never spans New Year.
 */
export function boundedDateSchema(label: string, clock: DateClock = systemClock) {
  return z
    .string()
    .refine(isCalendarDate, `${label} must be a real date in YYYY-MM-DD form`)
    .refine(
      (value) => value >= COLLECTION_DATE_MIN,
      `${label} must not be earlier than ${COLLECTION_DATE_MIN.slice(0, 4)} — sound recording did not exist yet`,
    )
    // String comparison is safe and exact for zero-padded ISO dates, and avoids
    // constructing a Date purely to compare two days.
    .refine((value) => value <= todayIso(clock), `${label} cannot be in the future`)
    .nullish();
}
