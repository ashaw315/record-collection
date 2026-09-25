import { describe, expect, it } from 'vitest';
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
   * §33's own worked example: "Loss Of Life, estimated from the capture: 144
   * fails by about 15px, so it takes 120 over two lines, with about 68px of
   * gap."
   */
  it('takes 120 for Loss Of Life, because 144 does not fit', () => {
    const chosen = titleStep({
      /* Two lines at 144 would exceed the supply by ~15px; at 120 it fits. */
      linesAt: (step) => (step >= 144 ? 2 : step >= 96 ? 2 : 1),
      demandAt: (step) => (step >= 144 ? 480 : step >= 120 ? 380 : 300),
      supply: 465,
    });
    expect(chosen).toBe(120);
  });

  /** §33: "The five-line worst title stays at 72." */
  it('falls to 72 when no larger step sets in two lines', () => {
    const chosen = titleStep({
      linesAt: (step) => (step >= 96 ? 5 : 5),
      demandAt: () => 300,
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
      linesAt: () => 2,
      demandAt: (step) => (step >= 120 ? 460 : 300),
      supply: 465,
    });
    /* 460 + 24 > 465, so 120 is refused though it sets in two lines. */
    expect(chosen).toBeLessThan(120);
    expect(STEP_GAP).toBe(24);
  });

  it('never returns a step outside the ruled set', () => {
    for (const supply of [100, 300, 465, 900]) {
      const chosen = titleStep({ linesAt: () => 2, demandAt: () => 200, supply });
      expect(TITLE_STEPS).toContain(chosen);
    }
  });
});
