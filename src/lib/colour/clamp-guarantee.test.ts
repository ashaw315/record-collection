import { describe, expect, it } from 'vitest';
import { PAPER as PAPER_TOKEN } from './paper';
import { LIGHTNESS_MAX, LIGHTNESS_MIN, CHROMA_CEILING, oklchToHex, recordLadder } from './record-ladder';
import { contrastRatio } from './record-colour';
import { COLLECTION_SPINES } from '../../../test/fixtures/collection-spines';

/**
 * **What the clamp guarantees, stated without reference to the wall (8a §5.2).**
 *
 * This file was D3's measurement — can the wall and the record screen share a
 * colour? — and §11 withdrew the question: the wall at rest takes no colour,
 * so nothing outside the record page constrains the clamp, and the pick, the
 * spread and the two-screen defect went with it. What survives is the clamp's
 * actual job, now stated correctly: the field behind the 72 must clear its
 * headline allowance on every record, and a band guarantees that in advance
 * rather than testing it per record. Measured at raw values the 72 failed on
 * two records and sat on the line on a third; at the band it clears everywhere.
 *
 * The collisions stay, under their own heading: they are the evidence for
 * §W.1's open work and nothing the ladder does repairs them.
 */

/** The record page's ink — `grid-type.ts` — not 5b's. */
const INK = oklchToHex({ L: 0.19, C: 0.008, h: 60 });
const PAPER = oklchToHex(PAPER_TOKEN);
const FALLBACK = '#3a3a3a';
const SHELF_PLANE = '#4d3b2b';

const withCover = COLLECTION_SPINES.filter(
  (row): row is typeof row & { resampled: string } => row.resampled !== null,
);

const baseHex = (stored: string) => {
  const ladder = recordLadder(stored);
  if (ladder === null) throw new Error(`no ladder for ${stored}`);
  return oklchToHex({ L: ladder.baseL, C: ladder.baseC, h: ladder.baseHue });
};

describe('at the clamp, ink on the field clears 4.5:1 — the 72 never reaches for its 3:1', () => {
  it('holds at every corner of the band, independent of the collection', () => {
    /*
      The band itself, not the records: lightness at both ends, chroma at zero
      and at the ceiling, one representative hue. If this held only on the
      seventeen it would be a fact about them; it holds on the band.
    */
    for (const L of [LIGHTNESS_MIN, LIGHTNESS_MAX]) {
      for (const C of [0, CHROMA_CEILING]) {
        const hex = oklchToHex({ L, C, h: 60 });
        expect(contrastRatio(hex, INK), `ink at L=${L} C=${C}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(hex, PAPER), `paper at L=${L} C=${C}`).toBeLessThan(4.5);
      }
    }
  });

  it('holds on all sixteen real records at base — including the two that fail raw', () => {
    /*
      Raw, Grave New World reads 1.43 and Loss Of Life 1.77 against ink; Super
      Rich 3.03. The band is what makes those three the same as the rest.
    */
    for (const row of withCover) {
      const base = baseHex(row.resampled);
      expect(contrastRatio(base, INK), `${row.title} base vs ink`).toBeGreaterThanOrEqual(4.5);
    }
    const raw = (title: string) => withCover.find((row) => row.title === title)?.resampled ?? '';
    expect(contrastRatio(raw('Grave New World'), INK)).toBeLessThan(3);
    expect(contrastRatio(raw('Loss Of Life'), INK)).toBeLessThan(3);
  });
});

describe('the two collisions at raw values — §W.1’s open difference problem', () => {
  /**
   * A73 retired the lit medium on three records whose derived colours collided
   * with the fallback and the shelf plane: MGMT at 1.088, Discharge at 1.134,
   * Jeff Beck at 1.374 — pre-A75 values. Re-measured post-A75: two still
   * collide, and §11 is explicit that nothing the ladder does repairs a
   * difference between records. The wall needs a difference rule over the
   * set, and that rule must not be colour at rest.
   */
  const by = (title: string) => withCover.find((row) => row.title === title)?.resampled ?? '';

  it('still collides on the two records A75 left alone', () => {
    expect(contrastRatio(by('Loss Of Life'), FALLBACK)).toBeCloseTo(1.09, 1);
    expect(contrastRatio(by('Loss Of Life'), SHELF_PLANE)).toBeCloseTo(1.02, 1);
    expect(contrastRatio(by('Grave New World'), FALLBACK)).toBeCloseTo(1.13, 1);
  });

  it('no longer collides on Wired, which A75 itself moved', () => {
    expect(contrastRatio(by('Wired'), FALLBACK)).toBeGreaterThan(2);
  });
});
