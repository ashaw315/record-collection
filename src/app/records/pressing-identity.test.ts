import { describe, expect, it } from 'vitest';
import { BLANK_PRESSING, type PressingFormValues } from './pressing-form';
import { discogsIdToSubmit } from './pressing-identity';

/**
 * SPEC.md §10: "**A corrected pressing is a different pressing.** The form
 * carries `discogsReleaseId` from the prefill so the ownership check in §7.7
 * can reach tier 1 — but it is sent **only if the identifying fields still
 * match what Discogs supplied**."
 *
 * The reason is §4's uniqueness: `discogs_release_id` is unique when present
 * and pressings are SHARED, so the row carrying a release id is *the* row for
 * that release. Letting a user's edit ride along with the id would write their
 * correction onto every record matching the same release — §7.8 broken in the
 * direction hardest to notice, because the damage lands on data they never
 * touched.
 */

const FROM_DISCOGS: PressingFormValues = {
  ...BLANK_PRESSING,
  catalogNumber: 'SP-3502',
  countryPressed: 'US',
  yearPressed: '1971',
  matrixRunout: 'SP 3503-P7',
  pressingPlant: 'Monarch',
};

const RELEASE_ID = 12856557;

describe('the id survives when identity is unchanged', () => {
  it('sends the id when nothing was edited', () => {
    // The common case, and the one the §7.7 defect was about: importing and
    // saving without corrections must reach tier 1.
    expect(discogsIdToSubmit(RELEASE_ID, FROM_DISCOGS, FROM_DISCOGS)).toBe(RELEASE_ID);
  });

  it('sends the id when the MATRIX was edited', () => {
    /**
     * §10 singles this out. Discogs' runout list is incomplete by construction
     * — it records only the variants contributors have submitted — so a runout
     * it does not list is information Discogs LACKS, not evidence of a
     * different release.
     *
     * There is a perverse-incentive argument too: the matrix is the field the
     * app most encourages users to fill in, and treating an edit as
     * identity-contradicting would cost tier 1 to exactly the people who do it.
     */
    const edited = { ...FROM_DISCOGS, matrixRunout: 'SP 3503-S7 / SP 3504-P11' };

    expect(discogsIdToSubmit(RELEASE_ID, FROM_DISCOGS, edited)).toBe(RELEASE_ID);
  });

  it.each([
    ['vinylWeightGrams', '180'],
    ['colorVariant', 'Black'],
    ['pressingPlant', 'Santa Maria'],
    ['isReissue', true],
  ] as const)('sends the id when %s was edited', (field, value) => {
    // Non-identifying: these describe the object without claiming which
    // release it is.
    const edited = { ...FROM_DISCOGS, [field]: value };

    expect(discogsIdToSubmit(RELEASE_ID, FROM_DISCOGS, edited)).toBe(RELEASE_ID);
  });

  it('sends the id when the user FILLS IN a field Discogs left blank', () => {
    // Adding information is not contradicting it. Discogs having no country
    // and the user knowing it is US does not make this a different release.
    const sparse = { ...FROM_DISCOGS, countryPressed: '' };
    const filled = { ...sparse, countryPressed: 'US' };

    expect(discogsIdToSubmit(RELEASE_ID, sparse, filled)).toBe(RELEASE_ID);
  });
});

describe('the id is dropped when identity is contradicted', () => {
  it.each([
    ['catalogNumber', 'SP-3502-X'],
    ['countryPressed', 'UK'],
    ['yearPressed', '1973'],
  ] as const)('drops the id when %s was edited', (field, value) => {
    /**
     * These three are printed, stable facts. Differing from them contradicts
     * the identity Discogs asserts, and §7.7's asymmetry says be reluctant to
     * claim the specific thing: the app cannot distinguish "Discogs is wrong"
     * from "this is a different pressing", so it must not claim the release.
     */
    const edited = { ...FROM_DISCOGS, [field]: value };

    expect(discogsIdToSubmit(RELEASE_ID, FROM_DISCOGS, edited)).toBeNull();
  });

  it('drops the id when the user CLEARS an identifying field', () => {
    // Removing a printed fact is as much a contradiction as changing it.
    const edited = { ...FROM_DISCOGS, catalogNumber: '' };

    expect(discogsIdToSubmit(RELEASE_ID, FROM_DISCOGS, edited)).toBeNull();
  });

  it('ignores whitespace and case, which are not corrections', () => {
    /**
     * A user who retypes "sp-3502 " has not contradicted anything, and
     * dropping the id there would cost tier 1 for a difference nobody
     * intended. Catalog numbers are printed in varying case on the sleeve
     * itself.
     */
    const edited = { ...FROM_DISCOGS, catalogNumber: '  sp-3502  ' };

    expect(discogsIdToSubmit(RELEASE_ID, FROM_DISCOGS, edited)).toBe(RELEASE_ID);
  });
});

describe('when there is no prefill', () => {
  it('sends nothing for a manually entered pressing', () => {
    // §10: the form works blank. A pressing typed from the record in hand
    // claims no Discogs release, and inventing one would be the §8 collapse.
    expect(discogsIdToSubmit(null, BLANK_PRESSING, FROM_DISCOGS)).toBeNull();
  });
});
