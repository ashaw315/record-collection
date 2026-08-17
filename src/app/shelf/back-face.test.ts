import { describe, expect, it } from 'vitest';
import { backFaceDetails } from './back-face';

/**
 * §10b: "**The back face is never empty.** Most records will have a front cover
 * from Discogs and nothing else for a long time. Rather than a blank or a
 * placeholder image, the back renders what is known: label, catalogue number,
 * pressing details, matrix runout, condition, what was paid and where."
 *
 * Pure, because what a back sleeve says is a set of decisions — which fields,
 * in what order, and what to do when one is missing. A component test would
 * confirm whatever markup was produced without stating what should be on it.
 */

const bare = {
  labelName: null,
  catalogNumber: null,
  yearPressed: null,
  countryPressed: null,
  pressingPlant: null,
  matrixRunout: null,
  vinylWeightGrams: null,
  colorVariant: null,
  isReissue: false,
  conditionMedia: null,
  conditionSleeve: null,
  purchasePrice: null,
  purchaseDate: null,
  storeName: null,
};

const labels = (rows: ReturnType<typeof backFaceDetails>) => rows.map((row) => row.label);

describe('backFaceDetails', () => {
  it('renders what is known, in the order a back sleeve carries it', () => {
    const rows = backFaceDetails({
      ...bare,
      labelName: 'Clay Records',
      catalogNumber: 'CLAYLP 3',
      yearPressed: 1982,
      countryPressed: 'UK',
    });

    expect(labels(rows)).toEqual(['Label', 'Catalogue', 'Pressed', 'Country']);
  });

  it('omits a field that is not recorded rather than printing a dash', () => {
    /**
     * §10b's "never empty" is about the FACE, not about every row. An empty
     * "Matrix —" line asserts the field was looked at and found blank; absence
     * says nothing, which is the truth. Same rule as the gallery's headings.
     */
    const rows = backFaceDetails({ ...bare, labelName: 'Clay Records' });

    expect(labels(rows)).toEqual(['Label']);
  });

  it('returns nothing at all for a record with no details', () => {
    /**
     * The empty case is real and must be reported honestly rather than padded.
     * §10 makes a quick in-store entry — title and artist only — the common
     * path, so this is the FIRST state of most records rather than an edge.
     *
     * The component says so in a sentence; inventing rows here would be the
     * placeholder §10b rules out.
     */
    expect(backFaceDetails(bare)).toEqual([]);
  });

  it('says what a condition grade means rather than printing the code', () => {
    /**
     * `VG+` is Goldmine shorthand (§4.2) and unreadable to anyone who has not
     * learnt it. The record detail screen already spells these out; the back
     * face must not be the one place that does not.
     */
    const rows = backFaceDetails({ ...bare, conditionMedia: 'VG+', conditionSleeve: 'NM' });

    expect(rows.find((row) => row.label === 'Media')?.value).toMatch(/very good/i);
    expect(rows.find((row) => row.label === 'Sleeve')?.value).toMatch(/near mint/i);
  });

  it('formats money as money, not as a bare numeric string', () => {
    // `purchase_price` is NUMERIC(10,2) and arrives as a string. "12.50" on a
    // sleeve is not a price; the app has one formatter and this uses it.
    const rows = backFaceDetails({ ...bare, purchasePrice: '12.50' });

    expect(rows.find((row) => row.label === 'Paid')?.value).toBe('$12.50');
  });

  it('marks a reissue, and says nothing when it is an original', () => {
    /**
     * `is_reissue` is NOT NULL DEFAULT false (§4.2), so `false` means "not
     * marked as a reissue" rather than "confirmed original". Printing
     * "Reissue: no" would assert a check nobody made — the same absent-versus-
     * unknown distinction the rest of this build turns on.
     */
    expect(labels(backFaceDetails({ ...bare, isReissue: true }))).toContain('Pressing');
    expect(labels(backFaceDetails({ ...bare, isReissue: false }))).not.toContain('Pressing');
  });

  it('carries the matrix runout, which is the pressing fingerprint', () => {
    // §4.2 calls it "the true pressing fingerprint" and CLAUDE.md §8 makes it
    // user-authoritative. It is the one field a collector checks against the
    // dead wax, so it belongs on the face they turn the record over to read.
    const rows = backFaceDetails({ ...bare, matrixRunout: 'CLAYLP3 A1 ▲' });

    expect(rows.find((row) => row.label === 'Matrix')?.value).toBe('CLAYLP3 A1 ▲');
  });

  it('combines weight and colour into one pressing line rather than two sparse ones', () => {
    // Both describe the physical disc and both are usually absent. Two rows
    // reading "180g" and "clear w/ splatter" separately is more furniture than
    // information.
    const rows = backFaceDetails({
      ...bare,
      vinylWeightGrams: 180,
      colorVariant: 'clear w/ splatter',
    });

    const disc = rows.find((row) => row.label === 'Disc')?.value;
    expect(disc).toContain('180');
    expect(disc).toContain('clear w/ splatter');
  });

  it('names where and when it was bought together', () => {
    const rows = backFaceDetails({
      ...bare,
      purchaseDate: '2026-03-15',
      storeName: 'Very Friendly Records',
    });

    const bought = rows.find((row) => row.label === 'Bought')?.value;
    expect(bought).toContain('2026-03-15');
    expect(bought).toContain('Very Friendly Records');
  });

  it('still names the store when the date is unknown', () => {
    // A record bought somewhere memorable on a forgotten day is ordinary, and
    // dropping the store because the date is missing would lose the fact that
    // was actually recorded.
    const rows = backFaceDetails({ ...bare, storeName: 'Very Friendly Records' });

    expect(rows.find((row) => row.label === 'Bought')?.value).toBe('Very Friendly Records');
  });
});
