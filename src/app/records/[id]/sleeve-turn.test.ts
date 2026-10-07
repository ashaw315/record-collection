import { describe, expect, it } from 'vitest';
import { TURN_MS, TURN_PERSPECTIVE, turnDistance, turnPose, turnSwell } from './sleeve-turn';

/**
 * §M.5: "The turn is 180 degrees about the sleeve's vertical centre line."
 * "Both are rigid rotations, re-projected every frame... corners are never
 * interpolated, so the face turns rather than morphs."
 *
 * The pose is the whole of the turn that is a decision: which face is
 * toward the reader at a given moment, and at what angle it stands. The
 * component hands the angle to the browser's own projection.
 */
describe('turnPose: one rigid half-turn, the face changing where it is edge-on', () => {
  it('starts on the face it leaves, flat, and ends on the face it arrives at, flat', () => {
    expect(turnPose(0)).toEqual({ face: 'from', angle: 0 });
    expect(turnPose(1)).toEqual({ face: 'to', angle: 0 });
  });

  /* Fails against a second half that carries on to 180: the arriving face would be drawn mirrored. */
  it('never shows a face from behind: the leaving face stands within 0 to 90, the arriving one within −90 to 0', () => {
    for (let i = 0; i <= 100; i += 1) {
      const pose = turnPose(i / 100);
      if (pose.face === 'from') { expect(pose.angle).toBeGreaterThanOrEqual(0); expect(pose.angle).toBeLessThan(90); }
      else { expect(pose.angle).toBeGreaterThanOrEqual(-90); expect(pose.angle).toBeLessThanOrEqual(0); }
    }
  });

  /* §M.5: the turn "takes the travel's curve, the ease-out cubic". Fails against a linear turn, against one that runs back, and against the wall's ease in and out the turn was first built on, which is 13 degrees a fifth of the way in. */
  it('turns one way only, on the ease-out cubic: fastest at the start, 88 degrees a fifth of the way in, and settling', () => {
    const total = (p: number) => { const pose = turnPose(p); return pose.face === 'from' ? pose.angle : 180 + pose.angle; };
    let last = -1;
    for (let i = 0; i <= 100; i += 1) { const now = total(i / 100); expect(now).toBeGreaterThanOrEqual(last); last = now; }
    expect(total(0.2)).toBeCloseTo(180 * (1 - 0.8 ** 3), 6);
    expect(total(0.1) - total(0), 'the first tenth is the fastest').toBeGreaterThan(total(1) - total(0.9));
  });

  /* The face changes where the curve reaches 90, which on an ease-out is early: about 0.206 of the time. */
  it('changes face edge-on, wherever the curve puts that', () => {
    const at = 1 - Math.cbrt(0.5);
    expect(turnPose(at - 0.001).face).toBe('from');
    expect(turnPose(at + 0.001).face).toBe('to');
    expect(Math.abs(turnPose(at + 0.001).angle)).toBeGreaterThan(89);
  });

  it('holds its ends outside the interval', () => {
    expect(turnPose(-1)).toEqual({ face: 'from', angle: 0 });
    expect(turnPose(2)).toEqual({ face: 'to', angle: 0 });
  });

  /* The proposal, as numbers a ruling can replace: stated so a change to either is a change to a test. */
  it('is proposed at 600ms, seen from four sleeve-widths away', () => {
    expect(TURN_MS).toBe(600);
    expect(TURN_PERSPECTIVE).toBe(4);
  });
});

/**
 * Step 91, §M.5: the near edge "does not reach the top row... If [the
 * perspective] would cross it, the viewing distance lengthens until it does
 * not."
 *
 * A square of side S turning about its centre line, seen from d, is drawn
 * taller at its near edge by S / 2 × (S / 2) / (d − S / 2) above and below
 * at edge-on. From four widths that is S / 14: 25 on a 354 square and 52 on
 * a 732. Measured from frames on 6 Oct: 25.2 and 52.1. The 732 square sits
 * 18 under the top row, so from four widths its edge stood at 18.9, inside
 * the row.
 */
describe('turnDistance: four widths away, or further where the room above is short', () => {
  it('swells by a fourteenth of the side from four widths', () => {
    expect(turnSwell(354, 354 * TURN_PERSPECTIVE)).toBeCloseTo(354 / 14, 6);
    expect(turnSwell(732, 732 * TURN_PERSPECTIVE)).toBeCloseTo(732 / 14, 6);
  });

  /* Fails against a fixed four widths: the 732 square has 18 above it and swells 52. */
  it('keeps four widths where the swell fits the room above: a 354 square with 179 above it', () => {
    expect(turnDistance(354, 179)).toBe(354 * TURN_PERSPECTIVE);
  });

  it('lengthens until the swell is one short of the room above: a 732 square with 18 above it swells 17', () => {
    const d = turnDistance(732, 18);
    expect(d).toBeGreaterThan(732 * TURN_PERSPECTIVE);
    expect(turnSwell(732, d)).toBeCloseTo(17, 6);
  });

  it('never comes nearer than four widths, whatever the room', () => {
    expect(turnDistance(200, 5000)).toBe(200 * TURN_PERSPECTIVE);
  });
});
