import { describe, expect, it } from 'vitest';
import { BANDS } from './band-geometry';
import { COVER_CELL } from './cover-geometry';
import { STRIP_SPLIT, coverSquare, leftoverStrip } from './cover-33';

/**
 * §33: "The cover is the largest square its cell holds, flush to the cell's
 * top, left and right, and never cropped. At 1440 the cell is 480 × 547, so
 * the cover is 480 × 480 and a 67px strip remains beneath it. The column that
 * sat beside the cover rotates into that strip: the base bar and the black
 * block keep their order and proportions, now horizontal. The rule is
 * geometric, so where the leftover falls to the side instead, the strip is a
 * column again, as it was."
 */
describe('§33: the cover is the largest square its cell holds', () => {
  it('is 480 square in the 480 × 547 cell, with a 67px strip beneath', () => {
    const cover = coverSquare({ width: COVER_CELL, height: BANDS.identity });
    expect(COVER_CELL, 'the cell at 1440').toBe(480);
    expect(BANDS.identity, 'the band').toBe(547);
    expect(cover.size).toBe(480);
    expect(cover.x, 'flush left').toBe(0);
    expect(cover.y, 'flush top').toBe(0);

    const strip = leftoverStrip({ width: COVER_CELL, height: BANDS.identity });
    expect(strip.orientation).toBe('horizontal');
    expect(strip.height).toBe(67);
    expect(strip.width).toBe(480);
  });

  /**
   * **"never cropped"** — the square is the SMALLER of the two dimensions, so
   * a cell taller than it is wide still shows the whole sleeve.
   */
  it('takes the smaller dimension, so the sleeve is never cropped', () => {
    expect(coverSquare({ width: 480, height: 400 }).size).toBe(400);
    expect(coverSquare({ width: 300, height: 547 }).size).toBe(300);
  });

  /**
   * **"The rule is geometric."** §33 rules the strip by where the leftover
   * falls, not by a fixed orientation — so a cell wider than it is tall puts
   * the strip back at the side, "a column again, as it was".
   */
  it('puts the strip at the side when the leftover falls there', () => {
    const strip = leftoverStrip({ width: 600, height: 480 });
    expect(strip.orientation).toBe('vertical');
    expect(strip.width).toBe(120);
    expect(strip.height).toBe(480);
  });

  /**
   * §33: "the base bar and the black block keep their ORDER and PROPORTIONS,
   * now horizontal." §23 gave the bar 26 → 398 and the block 398 → 547 of a
   * 547 column, so the bar takes the larger share and leads.
   */
  it('keeps the bar’s and block’s proportions when the strip rotates', () => {
    expect(STRIP_SPLIT.bar + STRIP_SPLIT.block).toBeCloseTo(1, 6);
    expect(STRIP_SPLIT.bar, 'the bar takes the larger share, as in the column').toBeGreaterThan(
      STRIP_SPLIT.block,
    );
    /* §23's column: the bar runs 26 → 398 and the block 398 → 547. */
    const barColumn = 398 - 26;
    const blockColumn = 547 - 398;
    expect(STRIP_SPLIT.bar).toBeCloseTo(barColumn / (barColumn + blockColumn), 3);
  });

  it('leaves no strip when the cell is already square', () => {
    const strip = leftoverStrip({ width: 480, height: 480 });
    expect(strip.width === 0 || strip.height === 0).toBe(true);
  });
});
