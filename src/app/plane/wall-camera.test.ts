import { describe, expect, it } from 'vitest';
import {
  PULL_FRACTION,
  WALL_FOV_DEGREES,
  edgeCompression,
  wallCameraDistance,
} from './wall-camera';

/**
 * The wall's camera: one perspective camera with a very long focal length.
 *
 * **A24b and §10b conflict under a single camera, and this is the resolution.**
 * A24b says the wall is square on with no perspective, so a spine at the edge
 * is as legible as one at the centre. §10b says a record leaving the shelf
 * turns from edge-on to face-on. Both were specified independently and they
 * cannot both hold under an orthographic camera: a rotation about Y with no
 * convergence is a pure horizontal squash, so a turning record reads as being
 * squeezed. Measured on `/plane`, twice, before this was tried.
 *
 * A long lens keeps A24b's REASON — spines equally legible, no raking angle —
 * while giving the turn enough convergence to read as a turn. One camera, no
 * switching, no two systems agreeing about a blend.
 *
 * These tests pin the two properties that decide whether it works, and they are
 * the two the prompt named: edge legibility, and enough convergence to turn.
 */

describe('the wall camera is near-orthographic ACROSS the wall', () => {
  it('compresses an edge spine by only a few percent at 1280px', () => {
    /**
     * **A24b's reason, as a number.** Criterion's closet foreshortens spines
     * toward the edges, and this wall exists to be scanned by eye — §10b
     * requires artist, title and catalogue number legible on EVERY spine.
     *
     * A wide lens would squeeze the outermost spines noticeably; the bar is
     * that an edge spine is as legible as a centre one, which in practice means
     * the compression is small enough not to be seen. 3% is roughly half a
     * pixel on a 17px spine.
     *
     * Fails against `wall-camera.ts` if the field of view is widened to a
     * normal lens, which is exactly the change that would break the wall.
     */
    const compression = edgeCompression({ wallWidth: 1280 });

    expect(compression, 'an edge spine is within 3% of a centre spine').toBeLessThan(0.03);
  });

  it('stays near-orthographic on a WIDE wall, where the angle is worst', () => {
    /**
     * The discriminating case. Compression grows with how far off-axis the
     * outermost spine is, so a test at one width proves nothing about another —
     * and a 2560px display is ordinary. Swept rather than spot-checked, which
     * is unit 17's finding.
     */
    for (const wallWidth of [768, 1280, 1920, 2560, 3440]) {
      expect(
        edgeCompression({ wallWidth }),
        `an edge spine at ${wallWidth}px is within 3% of a centre spine`,
      ).toBeLessThan(0.03);
    }
  });

  it('uses a LONG lens, not a normal one', () => {
    /**
     * Stated as the field of view because that is what the camera takes. A
     * 50mm-equivalent lens is about 40°; this is a long telephoto, which is
     * what makes a flat subject read flat.
     */
    expect(WALL_FOV_DEGREES, 'a long lens, well under a normal 40°').toBeLessThan(25);
    expect(WALL_FOV_DEGREES, 'but not so long it is orthographic in disguise').toBeGreaterThan(1);
  });

  it('places the camera far enough back that the wall fills the frame', () => {
    /**
     * A long lens sees a narrow angle, so it has to stand well back. Getting
     * this wrong crops the wall or leaves it a postage stamp in the middle —
     * both obvious, but obvious after a render rather than before one.
     */
    const distance = wallCameraDistance({ wallHeight: 744 });
    const halfHeight = Math.tan((WALL_FOV_DEGREES * Math.PI) / 360) * distance;

    expect(halfHeight * 2, 'the frame is the wall').toBeCloseTo(744, 0);
  });

  it('scales its distance with the wall, so the framing is independent of size', () => {
    /**
     * Five records and five hundred must both fill the frame — §10b's "a short
     * collection reads as short, not broken" applies to the camera as much as
     * to the shelf plane.
     */
    const short = wallCameraDistance({ wallHeight: 248 });
    const tall = wallCameraDistance({ wallHeight: 992 });

    expect(tall / short).toBeCloseTo(4, 5);
  });
});

describe('the pull depth is bounded, whatever the wall\'s height', () => {
  /**
   * **A defect the 390px case exposed and 1280px could not.**
   *
   * The camera frames the whole wall, so its distance scales with the
   * collection — which is correct, and is what keeps a spine at its true 240px.
   * But the pull was a fixed FRACTION of that distance, so a 390px viewport
   * wrapping 125 records into nine rows put the camera 7941px back and sent the
   * record 3176px toward it: out of the viewport entirely, leaving an empty
   * slot with nothing visible to show for it.
   *
   * The cap is in ROWS because a row is what the reader is looking at and it
   * does not change with collection size.
   */
  const cappedPull = (wallHeight: number, cap: number) =>
    Math.min(wallCameraDistance({ wallHeight }) * PULL_FRACTION, cap);

  it('does not send the record further than the cap on a TALL wall', () => {
    const cap = 496;

    // Three rows at 1280px: the fraction is what applies.
    expect(cappedPull(744, cap)).toBeLessThanOrEqual(cap);
    // Nine rows at 390px: the cap is what applies, and it bites hard.
    expect(cappedPull(2232, cap), 'the nine-row wall is capped').toBe(cap);
  });

  it('still clears the convergence bar at the cap', () => {
    /**
     * The cap must not quietly undo the turn — which is the failure a bound
     * like this invites, and the reason it is asserted rather than assumed.
     */
    const wallDistance = wallCameraDistance({ wallHeight: 2232 });
    const atCap = convergence(wallDistance - 496, 240);
    const atWall = convergence(wallDistance, 240);

    expect(atCap, 'a capped pull still converges more than the wall').toBeGreaterThan(atWall);
  });
});

describe('the wall camera gives a TURN enough convergence to read', () => {
  it('foreshortens a turning record measurably at the centre', () => {
    /**
     * **The half A24b's literal wording forbids and §10b requires.**
     *
     * Under an orthographic camera a face rotated 45° is exactly cos(45°) of
     * its width and its two vertical edges stay parallel — a squash. Under a
     * perspective camera the near edge is larger than the far one, and that
     * difference is what the eye reads as a turn.
     *
     * The record is pulled FORWARD of the wall, so it sits much closer to the
     * camera than the wall does and the convergence there is far stronger than
     * across the wall. That is the whole trick: near-orthographic where the
     * spines are, perspective where the record is.
     */
    const wallDistance = wallCameraDistance({ wallHeight: 744 });

    /*
      **The pull is a FRACTION of the camera distance, not a fixed number of
      pixels.** Convergence depends on how much closer the record is than the
      wall in proportion, so a fixed 420px pull is 4% of the way at this focal
      length and produces almost no turn — measured at 1.024, which is what sent
      the first attempt looking at the wrong thing.
    */
    /*
      **At the wall, measured on a SPINE's depth, not a record's.** A spine
      standing in the wall is about 20px deep; a record turned face-on toward
      the viewer presents 240px. Comparing both at 240 asked how much a
      turned-out record would converge if it were still in the wall, which is
      not a state that exists — and it reported 1.095, failing a bar the wall
      comfortably meets.
    */
    const atWall = convergence(wallDistance, 20);
    const pulledForward = convergence(wallDistance * (1 - PULL_FRACTION), 240);

    expect(atWall, 'the wall itself stays flat').toBeLessThan(1.05);
    expect(
      pulledForward,
      'a record held out toward the viewer converges enough to read as turning',
    ).toBeGreaterThan(1.12);
  });
});

/**
 * How much bigger the near edge of a turned object projects than its far edge.
 *
 * A turned record's edges sit at `distance ∓ halfWidth`; under perspective the
 * projected size goes as 1/distance, so the ratio is the convergence. 1.0 is
 * orthographic — no turn readable at all.
 */
function convergence(distance: number, objectWidth: number): number {
  const near = distance - objectWidth / 2;
  const far = distance + objectWidth / 2;
  return far / near;
}
