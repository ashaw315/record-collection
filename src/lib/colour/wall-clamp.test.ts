import { describe, expect, it } from 'vitest';
import { LIGHTNESS_MAX, LIGHTNESS_MIN, CHROMA_CEILING, oklchToHex, recordLadder } from './record-ladder';
import { contrastRatio } from './record-colour';
import { INK_CANDIDATES, pickInk } from '@/app/wall/spine-ink';
import { COLLECTION_SPINES } from '../../../test/fixtures/collection-spines';

/**
 * **D3's measurement: can the wall and the record screen share a colour?**
 *
 * The wall fills each spine with the stored value as sampled. The record screen
 * draws the same record at the ladder's base step, clamped to lightness
 * 0.62–0.74 and chroma ≤ 0.09. The same record renders two colours on two
 * screens today, and that is a defect whichever way the ruling goes — the
 * ruling decides which one moves, not whether they should agree.
 *
 * The question that decides whether the ruling is even open: at the clamp,
 * does 9px label text reach 4.5:1 against ink or against paper? If neither,
 * the clamp and the wall cannot share a value and arithmetic settles it.
 *
 * **They can.** Ink clears 4.5:1 at every corner of the clamp band; paper
 * clears it at none. So a spine at base is legible with ink on every record,
 * never with paper — and the four-candidate pick collapses to one ink.
 *
 * Every figure below is asserted from the seventeen real records, post-A75.
 */

const INK = '#0a0a0a';
const PAPER = oklchToHex({ L: 0.925, C: 0.004, h: 80 });
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

describe('at the clamp, ink reaches 4.5:1 and paper does not', () => {
  it('holds at every corner of the clamp band, independent of the collection', () => {
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
        expect(contrastRatio(hex, '#ffffff'), `white at L=${L} C=${C}`).toBeLessThan(4.5);
      }
    }
  });

  it('holds on all sixteen real records at base', () => {
    for (const row of withCover) {
      const base = baseHex(row.resampled);
      expect(contrastRatio(base, INK), `${row.title} base vs ink`).toBeGreaterThanOrEqual(5.1);
      expect(contrastRatio(base, PAPER), `${row.title} base vs paper`).toBeLessThan(3.1);
    }
  });

  it('collapses the four-candidate pick to one ink at base', () => {
    /**
     * 5b picks label ink per fill from four candidates because the raw fills
     * span light and dark. At the clamp they do not: every record's best ink is
     * the page's, and the pick has nothing left to choose. A ruling that
     * shares the value retires the pick as a consequence.
     */
    const picks = new Set(withCover.map((row) => pickInk(baseHex(row.resampled)).ink));

    expect([...picks]).toEqual([INK]);
    expect(INK_CANDIDATES, 'four candidates in, one out').toHaveLength(4);
  });
});

describe('the wall as it is: raw fills, four-candidate pick', () => {
  it('clears 4.5:1 on every record post-A75, worst 4.74 on Donna Summer', () => {
    /*
      5b reported its worst pick at 4.52 on Donna Summer against the pre-A75
      fill. A75 moved that fill from #94698a to #bc4889 and it is still the
      worst — at 4.74. The pick was re-run rather than copied.
    */
    const picks = withCover.map((row) => ({ title: row.title, ...pickInk(row.resampled) }));
    const worst = picks.reduce((a, b) => (a.ratio < b.ratio ? a : b));

    expect(worst.title).toBe('On The Radio: Greatest Hits Vol. 1 & 2');
    expect(worst.ratio).toBeCloseTo(4.74, 1);
    for (const pick of picks) {
      expect(pick.ratio, `${pick.title}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("A73's collisions, re-measured on post-A75 samples", () => {
  /**
   * A73 retired the lit medium on three records whose derived colours
   * collided with the fallback and the shelf plane: MGMT at 1.088, Discharge
   * at 1.134, Jeff Beck at 1.374 — pre-A75 values. The argument survives any
   * value ("under line, an edge is an edge at any value"); the numbers were
   * worth re-taking.
   */
  const by = (title: string) => withCover.find((row) => row.title === title)!.resampled;

  it('still collides on the two records A75 left alone', () => {
    /* Neither cover cleared the chroma floor, so both kept their mean. */
    expect(contrastRatio(by('Loss Of Life'), FALLBACK)).toBeCloseTo(1.09, 1);
    expect(contrastRatio(by('Loss Of Life'), SHELF_PLANE)).toBeCloseTo(1.02, 1);
    expect(contrastRatio(by('Grave New World'), FALLBACK)).toBeCloseTo(1.13, 1);
  });

  it('no longer collides on Wired, which A75 itself moved', () => {
    expect(contrastRatio(by('Wired'), FALLBACK)).toBeGreaterThan(2);
  });
});

describe('the spread between the two screens today', () => {
  it('is nothing on four records and up to +0.30 lightness on the darkest', () => {
    /**
     * The defect, measured: how far the same record's colour differs between
     * the wall (raw) and the record screen (base). Four records already sit
     * inside the clamp and do not move at all — I had eyeballed six; the
     * measurement says four, because Believer lifts +0.02 and Gaucho loses
     * 0.026 of chroma. The two A73 collisions move
     * furthest — the clamp lifts them a quarter of the lightness range to get
     * them off the fallback, which is also what takes them furthest from
     * their covers.
     */
    const spread = withCover.map((row) => {
      const ladder = recordLadder(row.resampled)!;
      return {
        title: row.title,
        dL: ladder.baseL - ladder.sampledL,
        dC: ladder.baseC - ladder.sampledC,
      };
    });

    const unchanged = spread.filter((s) => Math.abs(s.dL) < 0.005 && Math.abs(s.dC) < 0.005);
    expect(unchanged.length, 'records the clamp does not touch').toBe(4);

    const furthest = spread.reduce((a, b) => (Math.abs(a.dL) > Math.abs(b.dL) ? a : b));
    expect(furthest.title).toBe('Grave New World');
    expect(furthest.dL).toBeCloseTo(0.3, 1);
  });
});
