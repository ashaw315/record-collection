import { describe, expect, it } from 'vitest';
import { dateSchema, isCalendarDate } from './date';

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
