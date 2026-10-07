import { describe, expect, it } from 'vitest';
import { OPEN_MS, easeOutCubic, openDistance, openPose, openSwell, spreadSquare } from './sleeve-open';
import { sleeveSquare } from './sleeve-modal';

/**
 * §M.4: "the gatefold's opening moves the sleeve, and on narrow viewports
 * resizes it. In one motion, the front panel rotates about the fold while
 * the whole sleeve moves right by half a square, so the spread ends
 * centred... With the spread centred on c, that leaf spans c to c + S, and
 * the closed sleeve spans c − S/2 to c + S/2, so it moves right by S/2...
 * Where two squares at the closed size do not fit... the sleeve also scales
 * down to the largest spread that fits, in the same motion."
 */
describe('spreadSquare: one leaf of the open gatefold', () => {
  /* Fails against a spread drawn at the closed size: two 354s are 708 across a 390 window. */
  it('is half the width less the 18 insets where two closed squares do not fit: 177 at 390 × 844', () => {
    expect(sleeveSquare(390, 844)).toBe(354);
    expect(spreadSquare(390, 844)).toBe(177);
  });

  it('scales at 1440 × 900 too, where two 732s are wider than 1404: 702', () => {
    expect(spreadSquare(1440, 900)).toBe(702);
  });

  /* Fails against a spread that always takes half the width: it would grow past the closed square. */
  it('is the closed square itself where two of them fit: 2000 × 900 keeps 732', () => {
    expect(spreadSquare(2000, 900)).toBe(732);
  });
});

describe('openPose: the move, the scale and the rotation at one eased value', () => {
  const S = 354;
  const T = 177;

  /* x is measured from the centre the spread ends on, which is the closed sleeve's own centre. */
  it('starts as the closed sleeve: the front panel flat over c − S/2 to c + S/2', () => {
    expect(openPose(0, S, T)).toEqual({ size: S, fold: -S / 2, panel: 'front', angle: 0 });
  });

  /* Fails against the sign an earlier draft had: the sleeve moving left would end the fold at −S. */
  it('ends as the spread, centred: the fold on the centre, each leaf the spread’s square, the left leaf flat', () => {
    expect(openPose(1, S, T)).toEqual({ size: T, fold: 0, panel: 'left', angle: 0 });
  });

  it('moves right by half a closed square over the whole opening', () => {
    expect(openPose(1, S, T).fold - openPose(0, S, T).fold).toBe(S / 2);
  });

  /* Fails against parts on different curves: halfway, each is halfway. */
  it('takes the move, the scale and the rotation from the one value', () => {
    const half = openPose(0.5, S, T);
    expect(half.size).toBe((S + T) / 2);
    expect(half.fold).toBe(-S / 4);
    expect(Math.abs(half.angle)).toBe(90);
  });

  /* Fails against a panel carried round to 180: the left leaf would be drawn mirrored. */
  it('swings the front panel toward the reader about the fold, to edge-on, then lays the left leaf down from edge-on: no face is seen from behind', () => {
    for (let i = 0; i <= 100; i += 1) {
      const pose = openPose(i / 100, S, T);
      if (pose.panel === 'front') { expect(pose.angle).toBeLessThanOrEqual(0); expect(pose.angle).toBeGreaterThan(-90); }
      else { expect(pose.angle).toBeGreaterThanOrEqual(0); expect(pose.angle).toBeLessThanOrEqual(90); }
    }
    expect(openPose(0.49, S, T).panel).toBe('front');
    expect(openPose(0.5, S, T)).toMatchObject({ panel: 'left', angle: 90 });
  });
});

describe('the curve and the proposal', () => {
  /* §M.5: "take the travel's curve, the ease-out cubic". Fails against the wall's ease in and out, which is 0.148 a third of the way in. */
  it('is an ease-out cubic: 0 at 0, 1 at 1, and about 0.70 a third of the way in', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(1 / 3)).toBeCloseTo(1 - (2 / 3) ** 3, 10);
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it('is proposed at 600ms, the turn’s own', () => {
    expect(OPEN_MS).toBe(600);
  });
});

/**
 * Step 91's rule, for the gatefold's panel. It is hinged at its edge, not
 * its centre, so at edge-on its far edge stands a whole side toward the
 * reader and it swells by S / 2 × S / (d − S): from four widths, a sixth of
 * the side, 59 on a 354 leaf and 117 on a 702.
 */
describe('openDistance: four widths, or further where the room above is short', () => {
  it('swells by a sixth of the side from four widths', () => {
    expect(openSwell(354, 354 * 4)).toBeCloseTo(354 / 6, 6);
  });

  it('keeps four widths where that fits, and lengthens until the swell is one short of the room where it does not', () => {
    expect(openDistance(354, 179)).toBe(354 * 4);
    expect(openSwell(732, openDistance(732, 18))).toBeCloseTo(17, 6);
  });
});
