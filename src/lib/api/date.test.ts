import { describe, expect, it } from 'vitest';
import { boundedDateSchema, dateSchema, isCalendarDate } from './date';

/**
 * The shared calendar-date rule (SPEC.md §4.2's DATE columns).
 *
 * Written because `/^\d{4}-\d{2}-\d{2}$/` validated shape rather than validity,
 * so `2026-13-45` passed the boundary and was rejected by Postgres — a 500 for
 * what is plainly a client mistake.
 */

describe('isCalendarDate', () => {
  it.each([
    ['an ordinary date', '2026-08-08'],
    ['the first of January', '2026-01-01'],
    ['the last of December', '2026-12-31'],
    ['a leap day in a leap year', '2024-02-29'],
    ['a century leap year', '2000-02-29'],
    ['a date far in the past', '1877-01-01'],
  ])('accepts %s', (_label, value) => {
    expect(isCalendarDate(value), value).toBe(true);
  });

  it.each([
    ['a 13th month', '2026-13-45'],
    ['the 30th of February', '2026-02-30'],
    ['a leap day in a non-leap year', '2025-02-29'],
    // 1900 is divisible by 4 but not a leap year. A `year % 4 === 0` rule —
    // the obvious hand-rolled version — accepts this.
    ['a leap day in a non-leap CENTURY year', '1900-02-29'],
    ['the 31st of a 30-day month', '2026-04-31'],
    ['the 31st of June', '2026-06-31'],
    ['a zero month', '2026-00-10'],
    ['a zero day', '2026-10-00'],
  ])('rejects %s', (_label, value) => {
    expect(isCalendarDate(value), value).toBe(false);
  });

  /**
   * `Date.UTC` maps years 0-99 onto 1900-1999, which looks like a hole and is
   * not: the round-trip compares against the year that was ASKED for, so 1900
   * !== 0 and the value is rejected. Kept because the reasoning is
   * counter-intuitive enough that someone will "fix" it — an explicit
   * year-zero guard was written first, failed no test, and was removed.
   */
  it('rejects year zero rather than reading it as 1900', () => {
    expect(isCalendarDate('0000-01-01')).toBe(false);
    expect(isCalendarDate('0000-00-00')).toBe(false);
  });

  it('rejects a two-digit year rather than reading it as 19xx', () => {
    // Same trap from the other side: `0026-01-01` must not be accepted as a
    // valid date meaning 1926.
    expect(isCalendarDate('0026-01-01')).toBe(false);
  });

  it.each([
    ['the wrong separators', '2026/08/08'],
    ['a single-digit month', '2026-8-08'],
    ['a two-digit year', '26-08-08'],
    ['a trailing time', '2026-08-08T00:00:00Z'],
    ['surrounding whitespace', ' 2026-08-08 '],
    ['an empty string', ''],
    ['prose', 'yesterday'],
  ])('rejects %s', (_label, value) => {
    expect(isCalendarDate(value), value).toBe(false);
  });
});

describe('dateSchema', () => {
  it('names the field in the message, in the words the form uses', () => {
    // §4.1 as amended: the message names the field in human terms, not the
    // JSON key — the same rule the year messages follow.
    const result = dateSchema('Purchase date').safeParse('2026-13-45');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Purchase date must be a real date in YYYY-MM-DD form',
      );
    }
  });

  it('carries the label it was given rather than a fixed string', () => {
    const result = dateSchema('Sold on').safeParse('2026-13-45');

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toMatch(/^Sold on /);
  });

  it('permits null and absent, which mean "not recorded"', () => {
    // §4.2: purchase_date is nullable — a record can be logged without one.
    expect(dateSchema('Purchase date').safeParse(null).success).toBe(true);
    expect(dateSchema('Purchase date').safeParse(undefined).success).toBe(true);
  });
});

describe('boundedDateSchema keeps a typo out of a date field', () => {
  /**
   * `isCalendarDate` rejects `2026-13-45` — a shape that is not a day. It
   * cannot reject `1823-04-11`, which is a perfectly real day and, in a journal
   * entry or a purchase date, a typo.
   *
   * The bound mirrors §4.1's year rule and its reasoning: **1877 is the year
   * sound recording began**, so nothing about a record collection legitimately
   * predates it, and the upper bound is today — unlike `formed_year`, which
   * allows next year for a band already announced. **You cannot have bought a
   * record tomorrow, or written a note about playing one.**
   *
   * The clock is a PARAMETER for the reason §4.1 records: a serverless instance
   * that boots in December and stays warm into January would, with a bound
   * computed at module load, reject the genuine current date — and no ordinary
   * test catches it, because a test run never spans New Year.
   */
  const clock = () => new Date('2026-08-12T00:00:00Z');
  const schema = boundedDateSchema('Entry date', clock);

  it('accepts today', () => {
    expect(schema.safeParse('2026-08-12').success).toBe(true);
  });

  it('accepts a date within living memory', () => {
    expect(schema.safeParse('1979-11-02').success).toBe(true);
  });

  it('accepts 1877, the year sound recording began', () => {
    expect(schema.safeParse('1877-01-01').success).toBe(true);
  });

  it('rejects 1876, which predates recorded sound', () => {
    expect(schema.safeParse('1876-12-31').success).toBe(false);
  });

  it('rejects the day after tomorrow — no timezone is that far ahead', () => {
    /**
     * The discriminating case against §4.1's rule, which allows `currentYear +
     * 1`. A band can be announced for next year; a record cannot have been
     * bought, or listened to, in the future.
     *
     * **The line sits a day later than it reads, and deliberately.** The server
     * bounds in UTC while the value arrives from the client's LOCAL calendar,
     * which east of Greenwich is routinely a day ahead — so `2026-08-13` at this
     * clock is somebody's genuine today and is accepted (see the timezone block
     * below). Two days ahead is nobody's today, and that is where the bound
     * bites.
     *
     * This test previously asserted `2026-08-13` was rejected, which made the
     * form reject the user's own today for most of the world east of UTC.
     */
    expect(schema.safeParse('2026-08-14').success).toBe(false);
  });

  it('rejects a date in the wrong century, which is what a typo looks like', () => {
    expect(schema.safeParse('1823-04-11').success).toBe(false);
    expect(schema.safeParse('2087-04-11').success).toBe(false);
  });

  it('still rejects a date that is not a day at all', () => {
    // The existing rule survives the bound rather than being replaced by it.
    expect(schema.safeParse('2026-13-45').success).toBe(false);
    expect(schema.safeParse('2026-02-30').success).toBe(false);
  });

  it('names the field in the message, per §4.1’s amended rule', () => {
    const result = schema.safeParse('1823-04-11');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Entry date');
    }
  });

  it('computes the bound per call, never at module load', () => {
    /**
     * The New Year case, made testable by injecting the clock. The same schema
     * factory asked on two different days must give two different answers about
     * the same date.
     */
    const newYearEve = boundedDateSchema('Entry date', () => new Date('2026-12-31T23:00:00Z'));
    const newYearDay = boundedDateSchema('Entry date', () => new Date('2027-01-01T01:00:00Z'));

    /**
     * Compared TWO days out rather than one, because the bound now carries a
     * day of timezone slack: `2027-01-01` is already acceptable on New Year's
     * Eve in UTC, since it is midnight somewhere. `2027-01-02` is the date the
     * two clocks still disagree about, so it is the one that proves the bound
     * moved rather than being frozen at module load — which is the property
     * this test exists for.
     */
    expect(newYearEve.safeParse('2027-01-02').success, 'not yet').toBe(false);
    expect(newYearDay.safeParse('2027-01-02').success, 'now within reach').toBe(true);
  });

  it('still allows null and undefined, which mean "not recorded"', () => {
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse(undefined).success).toBe(true);
  });
});

describe('the future bound tolerates a timezone ahead of UTC', () => {
  /**
   * **The bound is computed in UTC and the value arrives from a LOCAL calendar,
   * so the two disagree by a day for most of the world, twice over.**
   *
   * A journal entry's date is a human fact — "the day I played this" — so the
   * client sends the user's local calendar date. East of Greenwich that date is
   * routinely a day AHEAD of UTC: 09:00 on 16 August in Sydney is 23:00 on the
   * 15th in UTC. A strict `value <= todayIso()` rejects the user's actual today
   * as being in the future, on a form whose own date input offered it.
   *
   * One day of slack, not a timezone conversion. The server cannot know the
   * client's zone and must not guess one; what it CAN say is that no zone is
   * more than a day from UTC, so a date one day ahead is somebody's today and a
   * date two days ahead is a typo. The bound still does its job — §4.1's point
   * is keeping `2126-04-11` out, not adjudicating midnight.
   */
  const clock = () => new Date('2026-08-15T23:00:00Z');
  const schema = boundedDateSchema('Entry date', clock);

  it('accepts tomorrow-in-UTC, which is today somewhere east', () => {
    expect(schema.safeParse('2026-08-16').success, 'Sydney is already on the 16th').toBe(true);
  });

  it('still accepts the UTC today', () => {
    expect(schema.safeParse('2026-08-15').success).toBe(true);
  });

  it('still rejects a date two days out, which no zone reaches', () => {
    const result = schema.safeParse('2026-08-17');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/future/i);
    }
  });

  it('still rejects a wildly future typo', () => {
    // The case the bound exists for: a mistyped year, not a midnight edge.
    expect(schema.safeParse('2126-08-15').success).toBe(false);
  });
});
