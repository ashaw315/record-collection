import { describe, expect, it } from 'vitest';
import * as titleStepsModule from './title-steps';
import { ARTIST_OF_TITLE, FIELD_ASPECT_FLOOR, TITLE_MEASURE, TITLE_PAIRS, TITLE_STEPS, STEP_GAP, artistStep, fieldHeight, titlePair } from './title-steps';

/* The height term alone, as §33's tests were written: width fits and the artist sets on one line. */
const titleStep = ({ demandAt, supply }: { demandAt: (step: number) => number; supply: number }) =>
  titlePair({ demandAt, supply, overflowsAt: () => false, artistLinesAt: () => 1 }).title;

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

/**
 * **§45: the ladder on both axes, and title and artist as a pair.**
 *
 * Two constants stood in for the cell, 510 on height and 412 on width, and the
 * ladder chose on height alone: Gaucho set 512 wide at 144 in a 412 box and
 * one-word titles took 144 whatever the cell was (measured 29 Sep). Each test
 * names the term it fails against: the width term, the pair term, the
 * smallest pair's exemption, and the removed constant.
 */
describe('§45: the title fits the identity cell on both axes', () => {
  const fits = () => false;
  const oneLine = () => 1;
  const tall = () => 100;

  it('states the pairs as one scale: 144/80, 120/66, 96/54, 72/40', () => {
    expect(TITLE_PAIRS).toEqual([
      { title: 144, artist: 80 },
      { title: 120, artist: 66 },
      { title: 96, artist: 54 },
      { title: 72, artist: 40 },
    ]);
  });

  it('refuses a step whose longest line exceeds the measure, whatever its height (the width term)', () => {
    /* Gaucho: 512 wide at 144 and 427 at 120 in a 412 measure; 341 at 96 fits. Height would allow 144. */
    const overflowsAt = (step: number) => step >= 120;
    const chosen = titlePair({ demandAt: tall, supply: 1000, overflowsAt, artistLinesAt: oneLine });
    expect(chosen.title, 'the largest step at which no line exceeds the measure').toBe(96);
    expect(chosen.artist).toBe(54);
  });

  it('refuses a pair whose artist does not set on one line, down to the smallest pair (the pair term)', () => {
    /* The artist sets on one line only at 54 and below; height and width allow 144. */
    const artistLinesAt = (artist: number) => (artist > 54 ? 2 : 1);
    const chosen = titlePair({ demandAt: tall, supply: 1000, overflowsAt: fits, artistLinesAt });
    expect(chosen).toEqual({ title: 96, artist: 54, artistLowered: true });
  });

  it('lets the artist wrap only at the smallest pair (§45: "only below that does the artist wrap")', () => {
    const chosen = titlePair({ demandAt: tall, supply: 1000, overflowsAt: fits, artistLinesAt: () => 2 });
    expect(chosen).toEqual({ title: 72, artist: 40, artistLowered: true });
  });

  it('reports artistLowered false when the artist did not decide the pair', () => {
    const chosen = titlePair({ demandAt: tall, supply: 1000, overflowsAt: fits, artistLinesAt: oneLine });
    expect(chosen).toEqual({ title: 144, artist: 80, artistLowered: false });
  });

  it('still refuses on height: demand plus the gap over supply steps down (§33 stands)', () => {
    const demandAt = (step: number) => (step >= 120 ? 600 : 300);
    const chosen = titlePair({ demandAt, supply: 510, overflowsAt: fits, artistLinesAt: oneLine });
    expect(chosen.title).toBe(96);
  });

  it('exports no supply constant: the supply is measured from the rendered cell', () => {
    expect(Object.keys(titleStepsModule)).not.toContain('LADDER_SUPPLY');
  });
});

/**
 * **§50 (step 58): the field’s height is the smallest of three terms, and a
 * field past 4 : 1 is not drawn.** "Its area is at most the construction’s
 * ink, and its aspect at most 4 : 1; where either fails, the gap is paper."
 * The floor is tested on the RENDERED height, not on the cap: a record whose
 * cap would pass can still be suppressed because its gap is short, and one
 * whose gap binds below its cap is judged on that gap.
 */
describe('§50: fieldHeight is the smallest of gap, stack and cap, suppressed past 4 : 1', () => {
  it('names the term that set the height', () => {
    expect(fieldHeight({ gap: 300, stack: 250, cap: 200 })).toMatchObject({ height: 200, term: 'cap', drawn: true });
    expect(fieldHeight({ gap: 300, stack: 150, cap: 200 })).toMatchObject({ height: 150, term: 'stack', drawn: true });
    expect(fieldHeight({ gap: 120, stack: 250, cap: 200 })).toMatchObject({ height: 120, term: 'gap', drawn: true });
  });

  it('suppresses at the aspect floor, on the rendered width of 443: 110 is a rule, 111 is a plane', () => {
    expect(fieldHeight({ gap: 110, stack: 250, cap: 200 })).toMatchObject({ height: 110, term: 'gap', drawn: false });
    expect(fieldHeight({ gap: 111, stack: 250, cap: 200 })).toMatchObject({ height: 111, term: 'gap', drawn: true });
    expect(fieldHeight({ gap: 111, stack: 250, cap: 200 }).aspect).toBeCloseTo(TITLE_MEASURE / 111, 6);
  });

  it('judges the rendered height, not the cap: Bitches Brew at 1440 × 900 draws at its gap of 113.9 under a cap of 116.8', () => {
    expect(fieldHeight({ gap: 113.9, stack: 291.6, cap: 116.8 })).toMatchObject({ height: 113.9, term: 'gap', drawn: true });
  });

  it('judges the rendered height, not the cap: The Hurdy Gurdy Man at 1200 high is suppressed by its gap of 70.3 under a cap of 127.1 that would pass', () => {
    expect(fieldHeight({ gap: 70.3, stack: 517.2, cap: 127.1 })).toMatchObject({ height: 70.3, term: 'gap', drawn: false });
  });

  it('suppresses by the cap alone where the cap is past 4 : 1: Bridge Over Troubled Water at 109.3 against 110.75', () => {
    const bridge = fieldHeight({ gap: 243, stack: 243, cap: 109.3 });
    expect(bridge).toMatchObject({ height: 109.3, term: 'cap', drawn: false });
    expect(bridge.aspect).toBeGreaterThan(FIELD_ASPECT_FLOOR);
  });

  it('treats a gap of nothing or less as suppressed, not as a negative field', () => {
    expect(fieldHeight({ gap: 0, stack: 250, cap: 200 })).toMatchObject({ height: 0, drawn: false });
    expect(fieldHeight({ gap: -12, stack: 250, cap: 200 })).toMatchObject({ height: 0, drawn: false });
  });

  it('exports the floor as 4', () => {
    expect(FIELD_ASPECT_FLOOR).toBe(4);
  });
});
