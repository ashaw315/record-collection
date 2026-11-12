import { describe, expect, it } from 'vitest';
import { barcodeDigits, formatReleaseDate, releaseFields } from './release-fields';

/**
 * **§66, three fields from the release (Design, 11 Nov; Adam's ruling; step 179).** The format text, the barcode and
 * the full release date live only in the cached Discogs payload, so this reads them: the format text as Discogs gives
 * it, the barcode as given with its digits beside it for search, and the date as day month year, month year, or year,
 * never inventing a day. Each case fails against a reader that invents a day for a month, draws "0" for an absent
 * date, keeps spaces in the digits, or takes a non-barcode identifier.
 */
const payload = {
  formats: [{ name: 'Vinyl', qty: '1', descriptions: ['LP', 'Album'], text: 'Gatefold' }],
  identifiers: [
    { type: 'Matrix / Runout', value: 'SBR373 A', description: 'Runout side A' },
    { type: 'Barcode', value: '8 43563 19772 1', description: 'Printed' },
    { type: 'Barcode', value: '843563197721', description: 'Scanned' },
  ],
  released: '1982-03-15',
};

describe('releaseFields', () => {
  it('reads the format text as Discogs gives it, the first barcode as given, every barcode’s digits once, and the date', () => {
    expect(releaseFields(payload)).toEqual({ formatText: 'Gatefold', barcode: '8 43563 19772 1', barcodeDigits: ['843563197721'], released: '1982-03-15' });
  });

  it('joins several formats’ texts and leaves out an empty one', () => {
    const two = { ...payload, formats: [{ text: 'Gatefold' }, { text: '' }, { text: '180g' }] };
    expect(releaseFields(two).formatText).toBe('Gatefold, 180g');
  });

  it('is null in every field where the payload carries none, and takes no non-barcode identifier', () => {
    expect(releaseFields({ identifiers: [{ type: 'Matrix / Runout', value: '123' }] })).toEqual({ formatText: null, barcode: null, barcodeDigits: [], released: null });
    expect(releaseFields({ formats: [{ text: '' }], released: '' })).toEqual({ formatText: null, barcode: null, barcodeDigits: [], released: null });
    expect(releaseFields('not an object')).toEqual({ formatText: null, barcode: null, barcodeDigits: [], released: null });
  });
});

describe('barcodeDigits', () => {
  it('keeps the digits and nothing else: spaces, dashes and letters go', () => {
    expect(barcodeDigits('8 43563-19772 1')).toBe('843563197721');
    expect(barcodeDigits('UPC 843563197721')).toBe('843563197721');
    expect(barcodeDigits('none')).toBe('');
  });
});

describe('formatReleaseDate: as known, never inventing a day', () => {
  it('says day month year, month year, or year', () => {
    expect(formatReleaseDate('1982-03-15')).toBe('15 March 1982');
    expect(formatReleaseDate('1982-03')).toBe('March 1982');
    expect(formatReleaseDate('1982-03-00')).toBe('March 1982');
    expect(formatReleaseDate('1982')).toBe('1982');
    expect(formatReleaseDate('1982-00-00')).toBe('1982');
  });

  it('is null for nothing, zero, or a shape it does not know', () => {
    expect(formatReleaseDate(null)).toBeNull();
    expect(formatReleaseDate('')).toBeNull();
    expect(formatReleaseDate('0')).toBeNull();
    expect(formatReleaseDate('March 1982')).toBeNull();
    expect(formatReleaseDate('1982-13-01')).toBeNull();
  });
});
