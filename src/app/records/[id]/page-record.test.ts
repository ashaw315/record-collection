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
