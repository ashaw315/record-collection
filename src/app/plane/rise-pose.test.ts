import { describe, expect, it } from 'vitest';
import { risePose } from './rise-pose';

/**
 * What the record DOES as it leaves the shelf, as a pose per frame.
 *
 * **The rise was a rect interpolation the box was drawn inside.** Unit 19's
 * FLIP moved position and scaled a plane from the spine's rect to the settled
 * rect — no depth, no rotation — which on a real box in a real scene reads as a
 * square shrinking and expanding. Correct at both endpoints and wrong for the
 * whole middle.
 *
 * A spine IS the edge of a record. So the physical motion is:
 *
 *   progress 0   edge-on, in the slot, at spine width, in the wall plane
 *   progress 1   face-on, forward of the wall, at full size
 *
 * That is a rotation about Y from 90° to 0° and a translation in Z, not a
 * change of scale. The scale that remains is only the perspective of coming
 * toward the camera, which the camera does for free.
 *
 * **Judged on the middle, not the ends.** The endpoints were already right
 * before this change; every defect lives between them. These tests assert at
 * 15%, 35%, 50% and 75% for that reason.
 */

describe('risePose', () => {
  it('starts edge-on, in the slot, in the wall plane', () => {
    /**
     * Progress 0 must be indistinguishable from the spine still being on the
     * shelf — that is what makes the record look like it came OUT of the wall
     * rather than appearing in front of it.
     */
    const pose = risePose({ progress: 0, slotDepth: 1.6 });

    expect(pose.rotationY, 'edge-on: the face is perpendicular to the viewer').toBeCloseTo(
      Math.PI / 2,
      5,
    );
    expect(pose.z, 'in the wall plane, not forward of it').toBeCloseTo(0, 5);
  });

  it('ends face-on and forward of the wall', () => {
    const pose = risePose({ progress: 1, slotDepth: 1.6 });

    expect(pose.rotationY, 'face-on: the cover squarely to the viewer').toBeCloseTo(0, 5);
    expect(pose.z, 'forward of the wall by the full depth').toBeCloseTo(1.6, 5);
  });

  it('is TURNING through the middle, not snapping at an end', () => {
    /**
     * **The assertion that separates a real rotation from a rect
     * interpolation.** A rise that reached face-on in the first frames and then
     * merely translated would pass both endpoint tests above and look exactly
     * like the defect being fixed.
     *
     * At the quarter points the record must be meaningfully turned and
     * meaningfully not-yet-turned.
     */
    const quarter = risePose({ progress: 0.25, slotDepth: 1.6 });
    const half = risePose({ progress: 0.5, slotDepth: 1.6 });
    const threeQuarters = risePose({ progress: 0.75, slotDepth: 1.6 });

    for (const [name, pose] of [
      ['quarter', quarter],
      ['half', half],
      ['three-quarters', threeQuarters],
    ] as const) {
      expect(pose.rotationY, `${name} is still turning`).toBeGreaterThan(0);
      expect(pose.rotationY, `${name} has begun to turn`).toBeLessThan(Math.PI / 2);
    }

    // And it turns monotonically toward the viewer.
    expect(half.rotationY).toBeLessThan(quarter.rotationY);
    expect(threeQuarters.rotationY).toBeLessThan(half.rotationY);
  });

  it('comes forward as it turns, rather than turning in place then moving', () => {
    /**
     * Both channels advance together. A pose that finished the rotation before
     * starting the translation would read as two separate movements — a turn,
     * then a slide — rather than one object leaving a shelf.
     */
    const steps = [0.15, 0.35, 0.5, 0.75].map((progress) =>
      risePose({ progress, slotDepth: 1.6 }),
    );

    for (const [index, pose] of steps.entries()) {
      expect(pose.z, `step ${index} has come forward`).toBeGreaterThan(0);
      expect(pose.z, `step ${index} has not arrived yet`).toBeLessThan(1.6);
    }
  });

  it('sweeps monotonically on both channels, with no reversal', () => {
    /**
     * Swept rather than sampled. Unit 17's finding: two endpoint assertions can
     * both pass while a band between them collapses — and a pose that overshot
     * and came back would look like a wobble, which is exactly the sort of
     * thing the eye notices and a four-point check does not.
     */
    const poses = Array.from({ length: 40 }, (_, i) =>
      risePose({ progress: i / 39, slotDepth: 1.6 }),
    );

    for (let i = 1; i < poses.length; i += 1) {
      expect(poses[i].rotationY, `rotation reversed at step ${i}`).toBeLessThanOrEqual(
        poses[i - 1].rotationY + 1e-9,
      );
      expect(poses[i].z, `depth reversed at step ${i}`).toBeGreaterThanOrEqual(
        poses[i - 1].z - 1e-9,
      );
    }
  });

  it('scales the SPINE EDGE to full width rather than scaling the whole box', () => {
    /**
     * The remaining scale channel, and why it is only one axis.
     *
     * A spine on the wall is ~17px wide against a 240px-tall record: that is
     * the record's THICKNESS, not a small record. So the box starts at its true
     * proportions and the apparent width comes from being edge-on. What must
     * still interpolate is the object's overall size in the scene, because the
     * wall's spines are drawn much smaller than the pulled record.
     */
    const start = risePose({ progress: 0, slotDepth: 1.6 });
    const end = risePose({ progress: 1, slotDepth: 1.6 });

    expect(start.scale, 'starts at the spine\'s size in the scene').toBeGreaterThan(0);
    expect(start.scale).toBeLessThan(end.scale);
    expect(end.scale, 'ends at full size').toBeCloseTo(1, 5);
  });
});
