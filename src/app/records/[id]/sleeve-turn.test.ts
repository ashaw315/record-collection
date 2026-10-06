import { describe, expect, it } from 'vitest';
import { TURN_MS, TURN_PERSPECTIVE, turnPose } from './sleeve-turn';

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

  /* Fails against a turn that swaps the face at the start or the end: the reader would see a face jump while it stands open to them. */
  it('changes face exactly edge-on, at the middle of the curve', () => {
    const before = turnPose(0.4999);
    const after = turnPose(0.5);
    expect(before.face).toBe('from');
    expect(before.angle).toBeGreaterThan(89.9);
    expect(before.angle).toBeLessThan(90);
    expect(after).toEqual({ face: 'to', angle: -90 });
  });

  /* Fails against a second half that carries on to 180: the arriving face would be drawn mirrored. */
  it('never shows a face from behind: the leaving face stands within 0 to 90, the arriving one within −90 to 0', () => {
    for (let i = 0; i <= 100; i += 1) {
      const pose = turnPose(i / 100);
      if (pose.face === 'from') { expect(pose.angle).toBeGreaterThanOrEqual(0); expect(pose.angle).toBeLessThan(90); }
      else { expect(pose.angle).toBeGreaterThanOrEqual(-90); expect(pose.angle).toBeLessThanOrEqual(0); }
    }
  });

  /* Fails against a linear turn, and against one that overshoots or runs back. */
  it('turns one way only, on an eased curve: slow at each end, fastest edge-on', () => {
    const total = (p: number) => { const pose = turnPose(p); return pose.face === 'from' ? pose.angle : 180 + pose.angle; };
    let last = -1;
    for (let i = 0; i <= 100; i += 1) { const now = total(i / 100); expect(now).toBeGreaterThanOrEqual(last); last = now; }
    expect(total(0.1), 'a tenth of the time is well under a tenth of the turn').toBeLessThan(18 * 0.5);
    expect(total(0.5) - total(0.4), 'and the middle tenth is more than a tenth').toBeGreaterThan(18);
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
