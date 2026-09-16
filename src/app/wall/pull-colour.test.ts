import { describe, expect, it } from 'vitest';
import {
  PERCEIVED_END,
  RETURN_FADE_END,
  WALL_PAPER,
  WALL_PAPER_HEX,
  pullFill,
  returnFill,
} from './pull-colour';
import { PULL_DURATION_MS, pullEase, pullPose } from './pull-curve';
import { oklchToHex, recordLadder } from '@/lib/colour/record-ladder';
import { COLLECTION_SPINES } from '../../../test/fixtures/collection-spines';

/**
 * 8a §11.2: colour arrives ACROSS the gesture, on the same curve — a fade from
 * paper to the record's clamped base over the same 1000ms, starting at 0.
 *
 * Colour at the end is an event on a curve whose whole argument is that it has
 * none; colour at the start is the shelf changing before the record moves. So
 * the fill is a function of the pull's eased value and nothing else — and the
 * return is not the pull played backwards for colour: the fade to paper must
 * COMPLETE before the spine lands, or a coloured spine sits in the rest state
 * for the last frames and the exception leaks.
 */

const wired = COLLECTION_SPINES.find((row) => row.title === 'Wired');
const ladder = recordLadder(wired?.resampled ?? null);
if (ladder === null) throw new Error('fixture: Wired has a cover');

/** The fill a record has when fully pulled: its clamped base, exactly. */
const BASE_HEX = oklchToHex({ L: ladder.baseL, C: ladder.baseC, h: ladder.baseHue });

/** One frame at 60fps, as a fraction of the gesture. */
const FRAME = 1000 / 60 / PULL_DURATION_MS;

describe('colour arrives across the pull (§11.2)', () => {
  it('starts at the wall’s paper — no step from the resting outline', () => {
    /* At 0 the record is an outline on paper; a fill of paper draws the same. */
    expect(pullFill(0, ladder)).toBe(WALL_PAPER_HEX);
    expect(oklchToHex(WALL_PAPER)).toBe(WALL_PAPER_HEX);
  });

  it('arrives at the clamped base, exactly — and is still short of it where the gesture is visible', () => {
    /*
      Not "one frame before": at t = 1 − 1/60 the eased value is 0.999995 and
      the hex has already rounded to the base. That is the dead tail 5b §3
      describes, visible in 8-bit colour as it is in position. The claim that
      holds is at the perceived end: 97% of travel is still a step short.
    */
    expect(pullFill(1, ladder)).toBe(BASE_HEX);
    expect(pullFill(PERCEIVED_END, ladder)).not.toBe(BASE_HEX);
    expect(pullFill(0.5, ladder)).not.toBe(BASE_HEX);
  });

  it('is on the pull’s eased value — 87.5% of the way at halfway, like the geometry', () => {
    /*
      The load-bearing claim: ONE curve. A linear fade would read 50% here; a
      second curve would drift from the pose. Asserted in OKLCH lightness, where
      the mix is defined.
    */
    const at = (t: number) => {
      const eased = pullEase(t);
      return oklchToHex({
        L: WALL_PAPER.L + (ladder.baseL - WALL_PAPER.L) * eased,
        C: WALL_PAPER.C + (ladder.baseC - WALL_PAPER.C) * eased,
        h: ladder.baseHue,
      });
    };
    for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(pullFill(t, ladder), `t=${t}`).toBe(at(t));
      expect(pullPose(t, 1, 2).eased, 'the same eased value the geometry uses').toBe(pullEase(t));
    }
  });

  it('holds the record’s hue throughout — paper has none to lend', () => {
    /* A mix through a hueless paper must not swing through grey-blue on the way. */
    for (const t of [0.05, 0.3, 0.6]) {
      const hex = pullFill(t, ladder);
      expect(hex).not.toBe(WALL_PAPER_HEX);
      expect(hex).not.toBe(BASE_HEX);
    }
  });

  it('arrives at the achromatic fallback for a record with no cover (SPEC §4)', () => {
    /* No hue invented where none was sampled: the pull lands on #3a3a3a. */
    expect(pullFill(1, null)).toBe('#3a3a3a');
    expect(pullFill(0, null)).toBe(WALL_PAPER_HEX);
  });
});

describe('the return drains to paper before the spine lands', () => {
  it('ends the fade where the visible gesture ends, derived rather than chosen', () => {
    /*
      A cubic ease-out reaches 97% of travel at t ≈ 0.69 — the point 5b §3
      names as where the perceived gesture ends. The fade completes there, so
      the settle into the slot happens in paper: the last third of the return
      is the record being one of seventeen again, not still becoming it.
    */
    expect(PERCEIVED_END).toBeCloseTo(1 - Math.cbrt(0.03), 10);
    expect(pullEase(PERCEIVED_END)).toBeCloseTo(0.97, 10);
    expect(RETURN_FADE_END).toBe(PERCEIVED_END);
  });

  it('is paper on every 60fps frame from the fade’s end to landing — including the last', () => {
    /**
     * **The frame-step assertion.** At speed a fill one frame late looks fine;
     * stepped, it is a coloured spine sitting in the rest state. So every
     * frame from RETURN_FADE_END to 1 is checked, and the last frame before
     * landing is named separately because it is the one that leaks.
     */
    for (let r = RETURN_FADE_END; r <= 1 + 1e-9; r += FRAME) {
      expect(returnFill(Math.min(1, r), ladder), `return r=${r.toFixed(3)}`).toBe(WALL_PAPER_HEX);
    }
    expect(returnFill(1 - FRAME, ladder), 'the last frame before landing').toBe(WALL_PAPER_HEX);
    expect(returnFill(1, ladder), 'landed').toBe(WALL_PAPER_HEX);
  });

  it('starts at the base and is still coloured while the record is visibly moving', () => {
    /* The fade is not a cut at the start either: colour leaves on the fade. */
    expect(returnFill(0, ladder)).toBe(BASE_HEX);
    expect(returnFill(0.1, ladder)).not.toBe(WALL_PAPER_HEX);
    expect(returnFill(0.1, ladder)).not.toBe(BASE_HEX);
  });

  it('completes strictly before the geometry does', () => {
    /*
      Colour reaches paper at RETURN_FADE_END; the geometry is not seated until
      1. The gap is frames the viewer sees in paper — the condition §11.2
      states, measured as an ordering rather than assumed from the constant.
    */
    let firstPaper = -1;
    for (let r = 0; r <= 1 + 1e-9; r += FRAME) {
      if (firstPaper < 0 && returnFill(Math.min(1, r), ladder) === WALL_PAPER_HEX) firstPaper = r;
    }
    expect(firstPaper).toBeGreaterThan(0);
    expect(firstPaper).toBeLessThan(1 - FRAME);
  });
});
