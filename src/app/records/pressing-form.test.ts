import { describe, expect, it } from 'vitest';
import {
  buildPressingBody,
  hasAnyPressingDetail,
  type PressingFormValues,
} from './pressing-form';

/**
 * The pressing section of the record form (SPEC.md §10).
 *
 * The decision this file exists for: whether a pressing is created at all.
 * §10's identifying set is ALL EIGHT fields, deliberately wider than §4's match
 * key of `discogs_release_id` or `(catalog_number, country_pressed,
 * year_pressed)`. A user who enters only a matrix runout has identified their
 * pressing precisely — it is the dead-wax fingerprint — and discarding it would
 * be the worst outcome available given CLAUDE.md §8.
 */

const BLANK: PressingFormValues = {
  discogsReleaseId: null,
  catalogNumber: '',
  matrixRunout: '',
  countryPressed: '',
  yearPressed: '',
  pressingPlant: '',
  vinylWeightGrams: '',
  colorVariant: '',
  isReissue: false,
};

describe('hasAnyPressingDetail', () => {
  it('is false when every field is blank', () => {
    expect(hasAnyPressingDetail(BLANK)).toBe(false);
  });

  it('is false when fields hold only whitespace', () => {
    // An accidental space is not an identification.
    expect(
      hasAnyPressingDetail({ ...BLANK, catalogNumber: '   ', pressingPlant: '\t' }),
    ).toBe(false);
  });

  /**
   * THE CASE §10 SPELLS OUT. Matrix is not in §4's match key, so a rule keyed
   * on the match key would discard this entry entirely — losing the one field
   * that identifies which pressing the user is holding.
   */
  it('is true for a matrix runout alone', () => {
    expect(hasAnyPressingDetail({ ...BLANK, matrixRunout: 'CLAYLP3-A1' })).toBe(true);
  });

  it('is true for any single identifying field', () => {
    const fields: Array<keyof PressingFormValues> = [
      'catalogNumber',
      'matrixRunout',
      'countryPressed',
      'yearPressed',
      'pressingPlant',
      'vinylWeightGrams',
      'colorVariant',
    ];

    for (const field of fields) {
      expect(hasAnyPressingDetail({ ...BLANK, [field]: 'x' }), field).toBe(true);
    }
  });

  /**
   * `is_reissue` is a BOOLEAN and defaults false, so an untouched form has it
   * false — which must not count as an identification, or every record would
   * get a pressing. Ticked, it is a real statement about the object.
   */
  it('does not treat an unticked reissue box as a detail', () => {
    expect(hasAnyPressingDetail({ ...BLANK, isReissue: false })).toBe(false);
  });

  it('treats a ticked reissue box as a detail', () => {
    expect(hasAnyPressingDetail({ ...BLANK, isReissue: true })).toBe(true);
  });
});

describe('buildPressingBody', () => {
  it('is undefined when nothing was entered, so no pressing is created', () => {
    // §10: "Only when all eight are blank is no pressing created and
    // pressing_id left null."
    expect(buildPressingBody(BLANK)).toBeUndefined();
  });

  it('sends only the fields that were filled in', () => {
    expect(buildPressingBody({ ...BLANK, matrixRunout: 'CLAYLP3-A1' })).toEqual({
      matrixRunout: 'CLAYLP3-A1',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(buildPressingBody({ ...BLANK, catalogNumber: '  CLAY LP 3  ' })).toEqual({
      catalogNumber: 'CLAY LP 3',
    });
  });

  it('sends numeric fields as numbers, not the strings the inputs produced', () => {
    const body = buildPressingBody({
      ...BLANK,
      yearPressed: '1982',
      vinylWeightGrams: '180',
    });

    expect(body).toEqual({ yearPressed: 1982, vinylWeightGrams: 180 });
  });

  /**
   * The coercion trap from NOTES, in this form's numeric fields: `Number('')`
   * is 0, and a pressing recorded as pressed in year 0 weighing 0 g would pass
   * the columns and be wrong permanently.
   */
  it('omits an empty numeric field rather than coercing it to zero', () => {
    const body = buildPressingBody({
      ...BLANK,
      matrixRunout: 'X',
      yearPressed: '',
      vinylWeightGrams: '   ',
    });

    expect(body).not.toHaveProperty('yearPressed');
    expect(body).not.toHaveProperty('vinylWeightGrams');
  });

  it('sends isReissue only when ticked', () => {
    // false is the column default, so sending it explicitly is noise — and it
    // would make an otherwise-blank section look like a detail.
    expect(buildPressingBody({ ...BLANK, matrixRunout: 'X' })).not.toHaveProperty('isReissue');
    expect(buildPressingBody({ ...BLANK, isReissue: true })).toEqual({ isReissue: true });
  });

  it('sends every field when the form is fully filled', () => {
    expect(
      buildPressingBody({
        discogsReleaseId: null,
        catalogNumber: 'CLAY LP 3',
        matrixRunout: 'CLAYLP3-A1',
        countryPressed: 'UK',
        yearPressed: '1982',
        pressingPlant: 'Damont',
        vinylWeightGrams: '180',
        colorVariant: 'Black',
        isReissue: true,
      }),
    ).toEqual({
      catalogNumber: 'CLAY LP 3',
      matrixRunout: 'CLAYLP3-A1',
      countryPressed: 'UK',
      yearPressed: 1982,
      pressingPlant: 'Damont',
      vinylWeightGrams: 180,
      colorVariant: 'Black',
      isReissue: true,
    });
  });
});
