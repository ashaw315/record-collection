import { describe, expect, it } from 'vitest';
import * as titleStepsModule from './title-steps';
import { ARTIST_OF_TITLE, TITLE_STEPS, STEP_GAP, artistStep, titleStep } from './title-steps';

/**
 * §33: "The title takes the largest display step that fits. The steps are 72,
 * 96, 120 and 144, and the artist line is five-ninths of the title, rounded to
 * the nearest 2px (40, 54, 66, 80). The title takes the largest step at which
 * it sets in at most two lines on the measure and the cell's demand, with 24px
 * of gap, is within its supply. If 72 does not fit, §4.2's give order runs as
 * now."
 */
describe('§33: the title takes the largest step that fits', () => {
  it('states the four steps and their artist lines', () => {
    expect(TITLE_STEPS).toEqual([144, 120, 96, 72]);
    /* Five-ninths, rounded to the nearest 2px — the ruling gives both. */
    expect(artistStep(144)).toBe(80);
    expect(artistStep(120)).toBe(66);
    expect(artistStep(96)).toBe(54);
    expect(artistStep(72)).toBe(40);
  });

  it('derives the artist line rather than tabulating it', () => {
    for (const step of TITLE_STEPS) {
      const exact = step * ARTIST_OF_TITLE;
      expect(Math.abs(artistStep(step) - exact), `${step} is within a 2px rounding`).toBeLessThanOrEqual(1);
      expect(artistStep(step) % 2, `${step}'s artist line is even`).toBe(0);
    }
  });

  /**
   * **§33 amended the ladder: three lines, not two.** "The title takes the
   * largest step whose demand, with 24px of gap, is within the cell's supply,
   * set in at most three lines. Height is the constraint the band exists for;
   * the line count is a legibility ceiling, not a preference."
   *
   * The two-line rule is withdrawn within §33 (33/two-line-ladder): it
   * "maximised type subject to a line count and minimised nothing", so a
   * three-line title fell to 72 and kept 167px of slack. §33 now expects Loss
   * Of Life at 144 in three lines, since Code measured 144 as fitting on
   * height and refused it on line count alone.
   */
  it('takes 120 for Loss Of Life: 144 sets in three lines but its demand with the gap exceeds supply (§33)', () => {
    /*
      §33 withdrew its own 144 expectation: "Loss Of Life is expected at 144
      in three lines... It takes 120." The ladder spec measures it on the
      page; this fixture states what it measures -- at 144 the block below
      the title pushes demand past the 546 supply once the 24px gap is
      counted, at 120 it fits. The earlier fixture fabricated 59px to spare.
    */
    const chosen = titleStep({
      demandAt: (step) => (step >= 144 ? 546 - 23 : step >= 120 ? 546 - 118.4 - 24 : 300),
      supply: 546,
    });
    expect(chosen).toBe(120);
  });

  it('takes a step that sets in four lines when the height is there: the line count is no longer capped (§33)', () => {
    /*
      "Withdrawn within §33: the title sets in at most three lines... Height
      is the only constraint, and the line count is no longer capped." This
      test defended the cap -- four lines refused "however much height there
      is" -- for a round after §33 withdrew it.
    */
    const chosen = titleStep({
      demandAt: () => 200,
      supply: 546,
    });
    expect(chosen, 'the largest step whose demand fits, whatever its line count').toBe(144);
    expect(Object.keys(titleStepsModule), 'no line cap is exported').not.toContain('MAX_LINES');
  });

  /** §33: "The five-line worst title stays at 72" -- because on height, not on a count: at every larger step its demand exceeds supply. */
  it('falls to 72 when no larger step fits on height', () => {
    const chosen = titleStep({
      demandAt: (step) => (step > 72 ? 500 : 430),
      supply: 465,
    });
    expect(chosen).toBe(72);
  });

  /**
   * **The gap is a floor, not a target.** §33: "the gap is at least 24 on
   * every record that steps up", and the demand is measured "with 24px of
   * gap" — so a step whose demand plus the gap exceeds supply is refused even
   * when its line count is fine.
   */
  it('refuses a step whose demand plus the gap exceeds supply', () => {
    const chosen = titleStep({
      demandAt: (step) => (step >= 120 ? 460 : 300),
      supply: 465,
    });
    /* 460 + 24 > 465, so 120 is refused though it sets in two lines. */
    expect(chosen).toBeLessThan(120);
    expect(STEP_GAP).toBe(24);
  });

  it('never returns a step outside the ruled set', () => {
    for (const supply of [100, 300, 465, 900]) {
      const chosen = titleStep({ demandAt: () => 200, supply });
      expect(TITLE_STEPS).toContain(chosen);
    }
  });
});
