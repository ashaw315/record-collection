import { describe, expect, it } from 'vitest';
import { detailParts } from './detail-line';

/**
 * The identifying line under a result card: year, country, label, catalog no.
 *
 * FOUND IN REAL USE, 2026-08-25. A Doors search rendered
 * "Canada · Elektra · EKS-75005 Q" where every other card began with a year,
 * and the columns shifted mid-list. Measured against the live payload: release
 * 31239436 has NO `year` key at all — Discogs genuinely does not have it — so
 * this is real absence rather than a dropped field.
 *
 * **It is common, not exceptional: 26% of rows across six measured albums have
 * no year.** A quarter of a results page shifting is what makes scanning hard,
 * and reissues (the ones most likely to be missing a year) are exactly what a
 * collector is trying to tell apart from an original.
 */
describe('detailParts', () => {
  it('renders all four fields in order when present', () => {
    expect(
      detailParts({ year: 1967, country: 'US', label: 'Elektra', catalogNumber: 'EKS-74007' }),
    ).toEqual(['1967', 'US', 'Elektra', 'EKS-74007']);
  });

  it('keeps a placeholder in the year slot rather than closing the gap', () => {
    /**
     * The defect. Filtering the null out shifted country into the year column,
     * so two adjacent cards put different fields under the same position.
     *
     * Fails against a `.filter()` that drops nulls: that returns three parts
     * beginning with "Canada".
     */
    expect(
      detailParts({ year: null, country: 'Canada', label: 'Elektra', catalogNumber: 'EKS-75005 Q' }),
    ).toEqual(['—', 'Canada', 'Elektra', 'EKS-75005 Q']);
  });

  it('reads the placeholder as absence, not as a value', () => {
    // An em dash, not "0" or "Unknown" — §5.7 and CLAUDE.md §8: absence must
    // never render as something that looks entered. `meaningful()` already
    // turns Discogs' "Unknown" prose into null upstream; re-introducing the
    // word here would undo that.
    const [yearSlot] = detailParts({
      year: null,
      country: 'US',
      label: null,
      catalogNumber: null,
    });

    expect(yearSlot).toBe('—');
    expect(yearSlot).not.toMatch(/unknown/i);
    expect(yearSlot).not.toBe('0');
  });

  it('drops trailing fields that are absent rather than padding the whole line', () => {
    /**
     * Only the YEAR is placeheld, because it is the leading column and the one
     * whose absence shifts everything after it. A missing label in the middle
     * of the line does not move the year, and padding every slot would make a
     * sparse row read as four unknown facts rather than the two known ones.
     */
    expect(detailParts({ year: 1969, country: 'US', label: null, catalogNumber: null })).toEqual([
      '1969',
      'US',
    ]);
  });

  it('placeholds the year even when everything else is missing', () => {
    expect(detailParts({ year: null, country: null, label: null, catalogNumber: null })).toEqual([
      '—',
    ]);
  });

  it('treats a whitespace-only field as absent', () => {
    expect(
      detailParts({ year: 1967, country: '   ', label: 'Elektra', catalogNumber: null }),
    ).toEqual(['1967', 'Elektra']);
  });
});
