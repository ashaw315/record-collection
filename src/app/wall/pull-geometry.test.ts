import { describe, expect, it } from 'vitest';
import { COS30, SIN30, SPINE_HEIGHT, spinePolygon } from './geometry';
import { PULLED_SIZE, PULL_OFFSET_X, pullFace } from './pull-geometry';
import { pullPose } from './pull-curve';

/**
 * The pulled record's face, read off 5b §3's frames — drawn at 1:1 (a 17×240
 * spine), ending as a 116 × 116 square with its top on the seated spine's top
 * and its left edge 41 units right of the slot.
 *
 * **One polygon under one curve.** Frame 0 IS the seated polygon `geometry.ts`
 * draws, so the pull never swaps a node; frame 100 is axis-aligned with the
 * shear at zero. Between, width scales, height interpolates and the top edge's
 * rise drains out — all from the pose's one eased value.
 */

const seat = { x: 100, y: 400, width: 17 };

describe('the pulled face', () => {
  it('is the seated spine at rest — the same four points geometry draws', () => {
    expect(pullFace(seat, pullPose(0, 1, PULLED_SIZE / seat.width))).toEqual(
      spinePolygon(seat.x, seat.y, seat.width),
    );
  });

  it('ends as the drawn square: 116, top on the seated top, offset right by 41', () => {
    const face = pullFace(seat, pullPose(1, 1, PULLED_SIZE / seat.width));

    expect(PULLED_SIZE).toBe(116);
    expect(PULL_OFFSET_X).toBe(41);
    expect(face).toEqual([
      [seat.x + PULL_OFFSET_X, seat.y],
      [seat.x + PULL_OFFSET_X + PULLED_SIZE, seat.y],
      [seat.x + PULL_OFFSET_X + PULLED_SIZE, seat.y + PULLED_SIZE],
      [seat.x + PULL_OFFSET_X, seat.y + PULLED_SIZE],
    ]);
  });

  it('keeps the top edge’s rise proportional to the remaining shear, on the current width', () => {
    /* The rise IS the projection; it drains with the shear, not on its own curve. */
    for (const t of [0.25, 0.5, 0.75]) {
      const pose = pullPose(t, 1, PULLED_SIZE / seat.width);
      const [tl, tr] = pullFace(seat, pose);
      const width = tr[0] - tl[0];
      expect(width).toBeCloseTo(seat.width * pose.scale, 6);
      expect(tl[1] - tr[1], `rise at t=${t}`).toBeCloseTo((width * SIN30) / COS30 * pose.shear, 6);
    }
  });

  it('interpolates height from the spine to the square on the same eased value', () => {
    const pose = pullPose(0.5, 1, PULLED_SIZE / seat.width);
    const [, tr, br] = pullFace(seat, pose);
    expect(br[1] - tr[1]).toBeCloseTo(SPINE_HEIGHT + (PULLED_SIZE - SPINE_HEIGHT) * pose.eased, 6);
  });
});
