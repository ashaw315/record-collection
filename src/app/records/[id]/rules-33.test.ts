import { describe, expect, it } from 'vitest';
import { freeHeightSolid, MIN_FACE, SOLID_OF_FREE_HEIGHT } from './rules-33';

/**
 * §33: "The matrix solid is sized by the space it has, not by a section
 * height... It takes 0.855 of the cell's free height below the matrix text,
 * placed bottom-right, with §29's six-pixel face minimum; if that minimum
 * fails the solid is not drawn."
 *
 * **The base was wrong twice over.** The build hard-coded `h-[104px]`, an
 * inline value nothing re-derives — and the QA measurement then compared it
 * against §25's 0.855 of the SECTION height, which §33 says "answers a
 * different question": this is §5.4's record-independent solid in the frame's
 * lower band, not a §9 figure.
 */
describe('§33: the matrix solid takes its free height', () => {
  it('is 0.855 of the space below the text, not of the cell', () => {
    /* The measured cell: 240 × 299, with the matrix text occupying the top. */
    const solid = freeHeightSolid({ cellHeight: 299, textBottom: 150, cellWidth: 240, inset: 0 });

    expect(solid.drawn, 'a solid is drawn at this size').toBe(true);
    /* Free height is 299 - 150 = 149; 0.855 of that is 127.4. */
    expect(solid.height).toBeCloseTo(149 * SOLID_OF_FREE_HEIGHT, 1);
    expect(solid.height, 'and NOT 0.855 of the section height').not.toBeCloseTo(299 * 0.855, 0);
  });

  it('measures the free height to the bottom inset, so a shallow cell’s solid never crosses its text', () => {
    /*
      §33 gives "0.855 of the cell's free height below the matrix text",
      placed bottom-right inside the insets. The room the solid can occupy
      ends at the inset it sits on, not at the cell's edge. Measured at 1000
      once §41 packed the band: a 114-tall matrix cell with its text ending
      at 52 had 62 below the text; 0.855 of that, 53, sat on the 18px inset
      with its top 9px above the text, in front of type (§34). To the inset
      the room is 44, the solid 37.6, and its smallest face 13 clears §29's 6.
    */
    const shallow = freeHeightSolid({ cellHeight: 114, textBottom: 52, cellWidth: 214, inset: 18 });
    expect(shallow.drawn).toBe(true);
    expect(shallow.height).toBeCloseTo((114 - 18 - 52) * SOLID_OF_FREE_HEIGHT, 1);
    expect(shallow.height + 18, 'the solid sits on the inset and under the text').toBeLessThanOrEqual(114 - 52);
  });

  it('keeps the drawing’s aspect, so the width follows the height', () => {
    const solid = freeHeightSolid({ cellHeight: 299, textBottom: 150, cellWidth: 240 });
    /* The archetype is 120 × 104, so width/height is 120/104. */
    expect(solid.width / solid.height).toBeCloseTo(120 / 104, 3);
  });

  it('yields the height to the width inside both insets: 176.8 at 240 wide with 18px insets (§33)', () => {
    /*
      §33's own figure. The function already took the smaller term; the
      caller passed the width less ONE inset and drew 195.4, which
      `e2e/row-rules-33.spec.ts` measures on the page. Stated here so the
      figure has a home beside the rule.
    */
    const solid = freeHeightSolid({ cellHeight: 299, textBottom: 60, cellWidth: 240 - 2 * 18 });
    expect(solid.width).toBeCloseTo(204, 1);
    expect(solid.height, 'the height yields, not the insets').toBeCloseTo(176.8, 1);
    expect(solid.height, 'and not 0.855 of the free height, which would be wider than the room').toBeLessThan((299 - 60) * SOLID_OF_FREE_HEIGHT);
  });

  it('never exceeds the cell’s width', () => {
    /* A tall free space would otherwise compute a width past the cell. */
    const solid = freeHeightSolid({ cellHeight: 900, textBottom: 40, cellWidth: 240 });
    expect(solid.width).toBeLessThanOrEqual(240);
  });

  /**
   * **§29's six-pixel face minimum, which is a SUPPRESSION and not a clamp.**
   * §33: "if that minimum fails the solid is not drawn". Sizing it up to the
   * minimum instead would draw a solid the rule says must be absent.
   */
  it('is not drawn at all when a face would fall under six pixels', () => {
    const solid = freeHeightSolid({ cellHeight: 299, textBottom: 290, cellWidth: 240 });
    expect(solid.drawn, 'a face under 6px suppresses the solid').toBe(false);
  });

  it('draws when the smallest face is exactly at the minimum', () => {
    /* Boundary: the rule says "under 6px", so 6 itself is drawn. */
    const atLimit = MIN_FACE / freeHeightSolid.smallestFaceRatio;
    const solid = freeHeightSolid({
      cellHeight: 299,
      textBottom: 299 - atLimit / SOLID_OF_FREE_HEIGHT,
      cellWidth: 240,
    });
    expect(solid.drawn).toBe(true);
  });

  it('is not drawn when there is no free height at all', () => {
    const solid = freeHeightSolid({ cellHeight: 299, textBottom: 299, cellWidth: 240 });
    expect(solid.drawn).toBe(false);
  });
});

/**
 * §57 sizes the Price history solo "as the matrix solid is sized to its
 * cell's", so the rule takes the figure's own projected aspect and §29 face
 * ratio in place of the matrix drawing's 120 × 104 and 36 / 104. The defaults
 * are the matrix solid's, so every case above still describes it.
 */
describe('§57: the free-height rule takes a figure’s own aspect and face ratio', () => {
  it('sizes by the given aspect: 0.855 of the free height, the width from it', () => {
    const fit = freeHeightSolid({ cellHeight: 300, textBottom: 100, cellWidth: 1000, inset: 34, aspect: 0.5, smallestFaceRatio: 0.066 });
    expect(fit.drawn).toBe(true);
    expect(fit.height).toBeCloseTo((300 - 34 - 100) * SOLID_OF_FREE_HEIGHT, 1);
    expect(fit.width, 'the width follows the given aspect, not the matrix drawing’s').toBeCloseTo(fit.height * 0.5, 1);
  });

  it('applies §29’s bound through the given face ratio: a face under six pixels suppresses the figure', () => {
    /* 0.855 of 100 free is 85.5 tall; at 0.066 per pixel the narrowest face is 5.6, under the bound. */
    const thin = freeHeightSolid({ cellHeight: 234, textBottom: 100, cellWidth: 1000, inset: 34, aspect: 0.5, smallestFaceRatio: 0.066 });
    expect(thin.drawn, 'a 5.6px face is not drawn').toBe(false);
    /* The same free height with the matrix ratio (36 / 104) has a 29.6px face and is drawn: the ratio is what decides. */
    const matrix = freeHeightSolid({ cellHeight: 234, textBottom: 100, cellWidth: 1000, inset: 34, aspect: 0.5 });
    expect(matrix.drawn).toBe(true);
  });
});
