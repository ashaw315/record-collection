import { describe, expect, it } from 'vitest';
import { pulledDestination } from './pulled-destination';
import { WALL_FOV_DEGREES, wallCameraDistance } from './wall-camera';
import { SPINE_HEIGHT } from '../shelf/spine';

/**
 * Where a pulled record ends up.
 *
 * **The rise had no destination, and that was the defect.** §10b: "it was on
 * the shelf a moment ago and now it is in your hands." Unit 19's CSS version
 * interpolated from the spine's rect to an explicit settled rect; the scene
 * version only knew "forward by a proportion of the camera distance" and kept
 * the slot's own height, so a record pulled from row 0 settled 252 world units
 * above the view centre — NDC y 0.838, clipped at the top of the frame.
 *
 * Measured before this existed, and the measurement disproved the hypothesis
 * that all three QA symptoms shared one cause. Only the placement was this.
 *
 * The destination is arithmetic — camera, viewport and wall in, pose out — so
 * it is tested directly rather than by rendering and looking.
 */

/** A wall as tall as N rows, which is what the camera frames. */
const wallOf = (rows: number) => rows * (SPINE_HEIGHT + 8);

describe('pulledDestination', () => {
  it('centres the record in view, not at its slot\'s row', () => {
    /**
     * **The defect, asserted directly.** The record kept `home.y`, so where it
     * settled depended on which row it came from: row 0 landed near the top of
     * the frame and row 2 near the bottom. Neither is a destination anyone
     * chose.
     *
     * Fails against `pulled-destination.ts` if it returns the slot's height.
     */
    const wallHeight = wallOf(3);
    const target = pulledDestination({ wallWidth: 1280, wallHeight });

    expect(target.x, 'centred across the wall').toBeCloseTo(640, 0);
    expect(target.y, 'centred in the camera\'s view, which looks at -height/2').toBeCloseTo(
      -wallHeight / 2,
      0,
    );
  });

  it('sits on the CAMERA AXIS, which is the wall\'s centre', () => {
    /**
     * **Two other answers were measured wrong before this one.** Centring the
     * record on the window put it at NDC 0.62; on the visible slice of the wall,
     * 0.93. Both were exactly the offset from the camera's axis, projected.
     *
     * The camera is FIXED on the wall's centre because A24b forbids panning it,
     * so what appears in the middle of the frame is whatever sits on that axis —
     * "where the reader is looking" is not a scroll question. That the wall may
     * extend past the window is handled by the canvas scrolling with the page,
     * which is what the fixed camera bought.
     */
    const wallHeight = wallOf(4);
    const target = pulledDestination({ wallWidth: 1280, wallHeight });

    expect(target.y, 'on the axis the camera looks down').toBeCloseTo(-wallHeight / 2, 5);
    expect(target.x).toBeCloseTo(640, 5);
  });

  it('lands at the SAME APPARENT SIZE at 5 records and at 125', () => {
    /**
     * **The discriminating fixture, and the reason a camera-relative
     * destination is wrong.** The camera frames the whole wall, so its distance
     * scales with the collection — a fraction of that distance is a different
     * absolute depth on a one-row wall than on a nine-row one, and the record
     * arrives a different size.
     *
     * Apparent size is what a reader sees: the record's height divided by the
     * frame's height at its distance. A test at one collection size cannot tell
     * the two designs apart, which is the same shape as unit 22's plane needing
     * one record and many.
     */
    const apparent = (rows: number) => {
      const wallHeight = wallOf(rows);
      const target = pulledDestination({ wallWidth: 1280, wallHeight });
      const cameraZ = wallCameraDistance({ wallHeight });
      const distance = cameraZ - target.z;
      const halfFrame = distance * Math.tan((WALL_FOV_DEGREES * Math.PI) / 360);
      return SPINE_HEIGHT / (halfFrame * 2);
    };

    // One row is roughly five records; nine rows is 125 at 390px.
    expect(apparent(9), 'a deep wall').toBeCloseTo(apparent(1), 3);
    expect(apparent(3), 'and the ordinary one').toBeCloseTo(apparent(1), 3);
  });

  it('fills a readable fraction of the frame — a cover you can look at', () => {
    /**
     * "Now it is in your hands" is a size claim as much as a position one. Too
     * small and it is a thumbnail hovering over a wall; too large and it fills
     * the frame flat with no wall visible behind it, which is what the
     * near-the-lens hypothesis predicted and the measurement ruled out.
     */
    const wallHeight = wallOf(3);
    const target = pulledDestination({ wallWidth: 1280, wallHeight });
    const distance = wallCameraDistance({ wallHeight }) - target.z;
    const frameHeight = 2 * distance * Math.tan((WALL_FOV_DEGREES * Math.PI) / 360);
    const fraction = SPINE_HEIGHT / frameHeight;

    expect(fraction, 'the record is a good part of the frame').toBeGreaterThan(0.35);
    expect(fraction, 'but the wall is still visible behind it').toBeLessThan(0.8);
  });

  it('stays in FRONT of the wall, so it occludes what it came from', () => {
    /**
     * The finding this whole rewrite was for. A destination behind the wall
     * plane would put the record inside the shelf.
     */
    const target = pulledDestination({ wallWidth: 1280, wallHeight: wallOf(3) });

    expect(target.z).toBeGreaterThan(SPINE_HEIGHT / 2);
  });

  it('never travels past the camera', () => {
    /**
     * The degenerate case a proportion-of-distance design reaches on a tall
     * wall: the record ends up between the lens and the near plane, filling the
     * frame or vanishing entirely.
     */
    for (const rows of [1, 3, 5, 9, 20]) {
      const wallHeight = wallOf(rows);
      const target = pulledDestination({ wallWidth: 1280, wallHeight });
      expect(target.z, `${rows} rows`).toBeLessThan(wallCameraDistance({ wallHeight }));
    }
  });

  it('is deterministic', () => {
    const a = pulledDestination({ wallWidth: 1280, wallHeight: wallOf(3) });
    const b = pulledDestination({ wallWidth: 1280, wallHeight: wallOf(3) });
    expect(a).toEqual(b);
  });
});

/**
 * **The frame-fit tests that stood here are gone, and the question went with
 * them.**
 *
 * They asserted that `pulledDestination`'s `FRAME_FILL` produced a record
 * inside the frame at both viewports — the right assertion while the record's
 * size came from a fraction of the frustum. It no longer does: the card became
 * a summary of constant height, so the size is now `recordSizeFor(frame,
 * widthFraction, cardFraction)` in `fill-candidates.ts`, tested there against
 * a portrait frame, a landscape one and a squat one.
 *
 * **Deleted rather than adjusted.** A test kept past the question it asks
 * starts passing for a reason nobody chose, and this one would have gone green
 * the moment `FRAME_FILL` stopped deciding anything — reporting health about a
 * constant no longer on the path.
 *
 * What `pulledDestination` still owns, and what the tests above still cover, is
 * WHERE the record settles: centred on the camera's axis, the same apparent
 * size whatever the collection's size. That is untouched by the fill rule.
 *
 * `viewportAspect` remains exported and tested in `wall-camera.test.ts`, and
 * remains deliberately unused by `WallScene` until the aspect decision lands.
 */
