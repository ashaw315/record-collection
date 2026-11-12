import { describe, expect, it } from 'vitest';
import { pressingLine } from './page-record';

/**
 * **The composition the probe supplied as a literal.**
 *
 * `/wall/probe/page8a` carried `'Epic · FE 36811 · United States, 1981'` as a
 * hard-coded string, so nothing ever tested how it is BUILT — and the real
 * route has to build it from four independently nullable columns. Those are the
 * cases below: the literals are the expected output, taken field-for-field from
 * the three real records.
 */
/*
  §66 (Design, 11 Nov; step 179): "The full release date stands where the year it dates already stands, in place of
  that year alone, and says no more than is known." The year at the PRESSING line's end is the pressing's, and the
  cached release's date dates it (the report-first figures, 11 Nov), so the date replaces that year where the release
  gives more than the year, and never where it dates another year or is absent. Fails against a line that draws both,
  invents a day, or replaces a pressed year with a date from another year.
*/
describe('the pressing line’s date (§66)', () => {
  const base = { labelName: 'Clay Records', catalogNumber: 'CLAY LP 3', countryPressed: 'UK', yearPressed: 1982 };

  it('draws the date in place of the pressed year, as much of it as is known', () => {
    expect(pressingLine({ ...base, released: '1982-03-15' })).toBe('Clay Records · CLAY LP 3 · UK, 15 March 1982');
    expect(pressingLine({ ...base, released: '1982-03' })).toBe('Clay Records · CLAY LP 3 · UK, March 1982');
    expect(pressingLine({ ...base, released: '1982' })).toBe('Clay Records · CLAY LP 3 · UK, 1982');
  });

  it('keeps the pressed year where the release gives no date, or dates another year', () => {
    expect(pressingLine({ ...base, released: null })).toBe('Clay Records · CLAY LP 3 · UK, 1982');
    expect(pressingLine({ ...base, released: '1983-05-01' })).toBe('Clay Records · CLAY LP 3 · UK, 1982');
    expect(pressingLine({ ...base })).toBe('Clay Records · CLAY LP 3 · UK, 1982');
  });

  it('draws the date where there is no pressed year but the release dates one, and nothing where neither', () => {
    expect(pressingLine({ ...base, yearPressed: null, released: '1982-03-15' })).toBe('Clay Records · CLAY LP 3 · UK, 15 March 1982');
    expect(pressingLine({ ...base, yearPressed: null, released: null })).toBe('Clay Records · CLAY LP 3 · UK');
  });
});

describe('the pressing line, from nullable columns', () => {
  it('composes the three real records exactly as the probe drew them', () => {
    expect(
      pressingLine({
        labelName: 'Epic',
        catalogNumber: 'FE 36811',
        countryPressed: 'United States',
        yearPressed: 1981,
      }),
    ).toBe('Epic · FE 36811 · United States, 1981');

    expect(
      pressingLine({
        labelName: 'Epic',
        catalogNumber: 'BN 26420',
        countryPressed: 'United States',
        yearPressed: 1968,
      }),
    ).toBe('Epic · BN 26420 · United States, 1968');

    /* The emptiest: no catalog number and no pressing year at all. */
    expect(
      pressingLine({
        labelName: 'Clay Records',
        catalogNumber: null,
        countryPressed: 'United Kingdom',
        yearPressed: null,
      }),
    ).toBe('Clay Records · United Kingdom');
  });

  it('drops an absent part rather than leaving its separator', () => {
    /*
      The failure this guards is a dangling ' · ' or a stray comma — the shape
      that makes a record look damaged rather than sparse. §4.2 makes almost
      everything nullable, so every one of these is a real record.
    */
    expect(pressingLine({ labelName: null, catalogNumber: 'FE 36811', countryPressed: null, yearPressed: null })).toBe(
      'FE 36811',
    );
    expect(pressingLine({ labelName: 'Epic', catalogNumber: null, countryPressed: null, yearPressed: null })).toBe(
      'Epic',
    );
    expect(pressingLine({ labelName: null, catalogNumber: null, countryPressed: null, yearPressed: null })).toBe('');
  });

  it('gives a year with no country a place, rather than dropping it', () => {
    /**
     * **A year alone is not a country, and must not be punctuated as one.**
     *
     * `country, year` joined naively yields ', 1981' when the country is null —
     * a line that begins with a comma. The year is a fact worth keeping, so it
     * stands on its own.
     */
    expect(
      pressingLine({ labelName: 'Epic', catalogNumber: null, countryPressed: null, yearPressed: 1981 }),
    ).toBe('Epic · 1981');
  });

  it('never emits a leading or trailing separator', () => {
    /* A property over the sixteen null combinations, rather than four examples. */
    for (const labelName of ['Epic', null]) {
      for (const catalogNumber of ['FE 36811', null]) {
        for (const countryPressed of ['United States', null]) {
          for (const yearPressed of [1981, null]) {
            const line = pressingLine({ labelName, catalogNumber, countryPressed, yearPressed });
            const shape = `${labelName}/${catalogNumber}/${countryPressed}/${yearPressed}`;
            expect(line, shape).not.toMatch(/^[·,\s]/);
            expect(line, shape).not.toMatch(/[·,\s]$/);
            expect(line, shape).not.toMatch(/·\s*·/);
          }
        }
      }
    }
  });
});
