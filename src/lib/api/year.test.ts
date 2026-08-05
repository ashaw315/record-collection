import { describe, expect, it } from 'vitest';
import { FORMED_YEAR_MIN, formedYearBounds, isValidFormedYear } from './year';

/**
 * SPEC.md §4.1: formed_year is validated to 1877 <= year <= currentYear + 1,
 * at the API boundary rather than in the database.
 *
 * The upper bound MUST be computed per call. A warm serverless instance that
 * booted in December and is still running in January would otherwise reject the
 * genuine current year — and a test suite that never spans New Year would never
 * notice. That is why these tests inject a clock rather than reading the real
 * one, and why the year is DERIVED from the injected clock rather than
 * hardcoded: a hardcoded 2026 test rots silently on 1 January.
 */

/** A fixed instant, so "current year" is whatever this test says it is. */
function clockAt(isoDate: string): () => Date {
  return () => new Date(isoDate);
}

describe('formedYearBounds', () => {
  it('derives the upper bound from the clock it is given', () => {
    const { min, max } = formedYearBounds(clockAt('2031-06-15T12:00:00Z'));

    expect(min).toBe(FORMED_YEAR_MIN);
    expect(max).toBe(2032);
  });

  it('moves the upper bound when the clock crosses into a new year', () => {
    // The exact scenario the spec calls out: bounds computed in December must
    // not still apply in January.
    const december = formedYearBounds(clockAt('2030-12-31T23:59:59Z'));
    const january = formedYearBounds(clockAt('2031-01-01T00:00:01Z'));

    expect(december.max).toBe(2031);
    expect(january.max).toBe(2032);
    expect(january.max).toBeGreaterThan(december.max);
  });

  it('reads UTC rather than the server timezone', () => {
    // Local time would move the rollover to local midnight, making the same
    // instant a different "current year" per deployment region. This instant is
    // 2030 in America/New_York and 2031 in UTC.
    expect(formedYearBounds(clockAt('2031-01-01T00:00:01Z')).max).toBe(2032);
  });

  it('uses the real clock when none is injected', () => {
    // Derived, never hardcoded: a literal would rot on 1 January.
    const currentYear = new Date().getUTCFullYear();

    expect(formedYearBounds().max).toBe(currentYear + 1);
  });
});

describe('isValidFormedYear', () => {
  const clock = clockAt('2030-06-15T12:00:00Z');

  it('accepts the year sound recording began', () => {
    expect(isValidFormedYear(1877, clock)).toBe(true);
  });

  it('rejects the year before that', () => {
    expect(isValidFormedYear(1876, clock)).toBe(false);
  });

  it('accepts the current year', () => {
    expect(isValidFormedYear(2030, clock)).toBe(true);
  });

  it('accepts currentYear + 1, for a band announced for next year', () => {
    // The off-by-one that an inverted or tightened bound breaks.
    expect(isValidFormedYear(2031, clock)).toBe(true);
  });

  it('rejects currentYear + 2', () => {
    expect(isValidFormedYear(2032, clock)).toBe(false);
  });

  it('rejects the absurd values the database accepts', () => {
    // Verified against the live database: both of these INSERT cleanly, so the
    // API boundary is the only thing standing between them and the graph.
    expect(isValidFormedYear(-5000, clock)).toBe(false);
    expect(isValidFormedYear(999999, clock)).toBe(false);
  });

  it('rejects zero and negatives', () => {
    expect(isValidFormedYear(0, clock)).toBe(false);
    expect(isValidFormedYear(-1, clock)).toBe(false);
  });

  it('rejects a non-integer year', () => {
    expect(isValidFormedYear(1977.5, clock)).toBe(false);
  });

  it('rejects a value that cannot round-trip as an integer', () => {
    expect(isValidFormedYear(Number.MAX_SAFE_INTEGER + 1, clock)).toBe(false);
    expect(isValidFormedYear(Number.NaN, clock)).toBe(false);
    expect(isValidFormedYear(Number.POSITIVE_INFINITY, clock)).toBe(false);
  });

  /**
   * The mutation this exists to catch: a bound frozen at module load. Reading
   * the clock twice across a year boundary is the only way to tell a per-call
   * computation from a cached one, and it is invisible to any test that uses a
   * single fixed clock.
   */
  it('recomputes across a year boundary rather than caching the bound', () => {
    const inDecember = isValidFormedYear(2031, clockAt('2030-12-31T23:59:59Z'));
    const inJanuary = isValidFormedYear(2032, clockAt('2031-01-01T00:00:01Z'));

    // 2031 is currentYear+1 in December 2030; 2032 is currentYear+1 in January
    // 2031. Both must be accepted, which a frozen bound cannot do.
    expect({ inDecember, inJanuary }).toEqual({ inDecember: true, inJanuary: true });
  });
});
