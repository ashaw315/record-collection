import { describe, expect, it } from 'vitest';
import {
  FORMED_YEAR_MIN,
  formedYearBounds,
  isValidFormedYear,
  yearMessage,
  yearSchema,
  type Clock,
} from './year';

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

/**
 * SPEC.md §5.2: "A rejected year must name the field and state the range."
 *
 * `yearPressed is out of range` is the API's field name and tells the user
 * nothing actionable. A three-digit year typed for a four-digit one is the
 * realistic case, and the message has to say what would be acceptable.
 */
describe('yearMessage', () => {
  const at = (year: number): Clock => () => new Date(Date.UTC(year, 5, 1));

  it('names the field in human terms, not the API field name', () => {
    expect(yearMessage('Year pressed', at(2026))).toBe(
      'Year pressed must be between 1877 and 2027',
    );
  });

  it('states the live upper bound rather than a hardcoded one', () => {
    /**
     * The trap §4.1 names, now applying to three columns: a bound computed at
     * MODULE LOAD freezes, and a warm serverless instance that booted in
     * December rejects a valid January year. The clock is injected so this is
     * provable without waiting a year.
     */
    expect(yearMessage('Release year', at(2030))).toContain('and 2031');
    expect(yearMessage('Release year', at(2099))).toContain('and 2100');
  });

  it('uses the same floor for every field, per §4.1', () => {
    for (const label of ['Year pressed', 'Release year', 'Formed year']) {
      expect(yearMessage(label, at(2026)), label).toContain('1877');
    }
  });
});

describe('yearSchema', () => {
  it('rejects a three-digit year with the human message', () => {
    const result = yearSchema('Year pressed').safeParse(199);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/^Year pressed must be between 1877 and \d{4}$/);
    }
  });

  it('accepts a year inside the range', () => {
    expect(yearSchema('Year pressed').safeParse(1999).success).toBe(true);
  });

  it('accepts null, because every year column is nullable', () => {
    expect(yearSchema('Year pressed').safeParse(null).success).toBe(true);
  });

  /**
   * §4.1's module-load trap, asserted by CALL COUNT rather than by value.
   *
   * The property is that the bound is computed when a value is PARSED, so a
   * warm serverless instance that booted in December reports the new year in
   * January. Within one test process the frozen year and the live year are
   * identical, so comparing the message cannot see the difference — verified:
   * changing `error: () => yearMessage(label)` to `error: yearMessage(label)`
   * failed no assertion.
   *
   * What IS observable is when the message is built. Zod evaluates an error
   * FUNCTION per parse and an error STRING once at construction — measured
   * directly. Counting builds therefore distinguishes them.
   */
  it('builds the message per parse, not once when the schema is constructed', () => {
    /**
     * Built against the REAL `yearSchema`, not a local replica. An earlier
     * version constructed its own schema and so could not see a change to the
     * production one — decorative for exactly the mutation it was written to
     * catch.
     *
     * `Date` is stubbed so construction and parsing are distinguishable: the
     * bound is derived from the clock, so counting clock reads counts message
     * builds.
     */
    const RealDate = globalThis.Date;
    let reads = 0;
    class CountingDate extends RealDate {
      constructor() {
        super();
        reads += 1;
      }
    }

    globalThis.Date = CountingDate as DateConstructor;
    try {
      yearSchema('Year pressed');

      /**
       * CONSTRUCTION reads are the discriminating signal, and parse-time reads
       * are not.
       *
       * Measured both ways: with the lazy form the clock is read 0 times at
       * construction; with `error: yearMessage(label)` it is read ONCE, then
       * both forms read it per parse because `isValidFormedYear` consults the
       * clock too. An earlier version of this test compared parse-time growth
       * and so passed under the mutation — the signal it watched was present
       * in both.
       */
      expect(reads, 'the bound must not be computed when the schema is built').toBe(0);
    } finally {
      globalThis.Date = RealDate;
    }
  });

  it('reports the CURRENT upper bound in the message', () => {
    const result = yearSchema('Year pressed').safeParse(199);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        String(new Date().getUTCFullYear() + 1),
      );
    }
  });
});
