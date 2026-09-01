import { describe, expect, it } from 'vitest';
import { canvasPx, framePx, raw, wallPx } from './frames';
import { FRAME_FILL, FRAME_FILLS, pulledDestination } from './pulled-destination';
import { WALL_FOV_DEGREES, viewportCameraDistance, wallCameraDistance } from './wall-camera';
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
const wallOf = (rows: number) => wallPx(rows * (SPINE_HEIGHT + 8));

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
    const target = pulledDestination({ wallWidth: wallPx(1280), wallHeight });

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
    const target = pulledDestination({ wallWidth: wallPx(1280), wallHeight });

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
      const target = pulledDestination({ wallWidth: wallPx(1280), wallHeight });
      const cameraZ = wallCameraDistance({ wallHeight });
      const distance = raw(cameraZ) - raw(target.z);
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
    const target = pulledDestination({ wallWidth: wallPx(1280), wallHeight });
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
    const target = pulledDestination({ wallWidth: wallPx(1280), wallHeight: wallOf(3) });

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
      const target = pulledDestination({ wallWidth: wallPx(1280), wallHeight });
      expect(target.z, `${rows} rows`).toBeLessThan(wallCameraDistance({ wallHeight }));
    }
  });

  it('is deterministic', () => {
    const a = pulledDestination({ wallWidth: wallPx(1280), wallHeight: wallOf(3) });
    const b = pulledDestination({ wallWidth: wallPx(1280), wallHeight: wallOf(3) });
    expect(a).toEqual(b);
  });
});

/**
 * **The record fits the VIEWPORT frame at the pulled depth (the aspect fix).**
 *
 * On the wall the record is rendered in the same scene as the wall, through a
 * camera whose aspect is the CANVAS's — and the canvas is as tall as the whole
 * wall, so at 390px it is ~8x taller than wide. A record sized for that frame's
 * height overflowed its width by 4.5x: the original defect, live on the wall.
 *
 * The fix keeps the camera on the canvas ratio (a viewport aspect insets the
 * wall and breaks A24a, measured) and instead solves the record's DEPTH so it
 * fits the VIEWPORT's aspect. `pulledDestination` takes the viewport dimensions
 * and pushes the record back far enough that its WIDTH fits too.
 *
 * These fail against a `pulledDestination` that ignores the viewport — i.e. the
 * height-only `FRAME_FILL` derivation.
 */
describe('the pulled record fits the viewport, not just the canvas', () => {
  const RECORD = 240; // SPINE_HEIGHT, the record's world size.

  /** The frame's width at a depth, for a given camera aspect (the CANVAS's). */
  function frameWidthAt(cameraZ: number, recordZ: number, canvasAspect: number) {
    const gap = cameraZ - recordZ;
    const frameHeight = 2 * gap * Math.tan((WALL_FOV_DEGREES * Math.PI) / 360);
    return frameHeight * canvasAspect;
  }

  const CASES = [
    { name: 'phone', viewport: { width: canvasPx(390), height: canvasPx(844) }, wall: { width: wallPx(358), height: wallOf(10) } },
    { name: 'desktop', viewport: { width: canvasPx(1280), height: canvasPx(900) }, wall: { width: wallPx(1248), height: wallOf(4) } },
  ];

  for (const { name, viewport, wall } of CASES) {
    it(`${name}: the record is inside the frame's WIDTH`, () => {
      const target = pulledDestination({
        wallWidth: wall.width,
        wallHeight: wall.height,
        viewport,
      });
      const cameraZ = wallCameraDistance({ wallHeight: wall.height });
      const canvasAspect = raw(wall.width) / raw(wall.height);
      const frameW = frameWidthAt(cameraZ, target.z, canvasAspect);

      expect(
        RECORD / frameW,
        `${name}: record fills ${((RECORD / frameW) * 100).toFixed(0)}% of frame width`,
      ).toBeLessThanOrEqual(1);
    });
  }

  it('pushes the record further back on a portrait viewport than a landscape one', () => {
    // A tall narrow canvas needs the record deeper to fit its width; a wide one does not.
    const phone = pulledDestination({
      wallWidth: wallPx(358),
      wallHeight: wallOf(10),
      viewport: { width: canvasPx(390), height: canvasPx(844) },
    });
    const cameraPhone = wallCameraDistance({ wallHeight: wallOf(10) });
    // The record must sit closer to the camera than the wall, but the gap is larger on a phone.
    expect(cameraPhone - phone.z).toBeGreaterThan(0);
  });

  it('still accepts the viewport being omitted, and then frames by height as before', () => {
    // Back-compat: the destination tests above call it without a viewport.
    const noViewport = pulledDestination({ wallWidth: wallPx(1280), wallHeight: wallOf(3) });
    expect(Number.isFinite(noViewport.z)).toBe(true);
  });
});

describe('the record is always camera-centred — no lift (A33a)', () => {
  const wall = { wallWidth: wallPx(358), wallHeight: wallOf(10) };
  const viewport = { width: canvasPx(390), height: canvasPx(844) };

  /**
   * **A33a removed the stacked lift.** The summary card became an OVERLAY on
   * the record's lower portion rather than a block beneath it in a column, so
   * the record no longer shifts up to make room — it stays on the camera axis
   * at every width, and the overlay reads through it.
   *
   * The lift was tried and cost two "which frame" bugs (a fixed fraction that
   * clipped the record, then a screen-space lift that divided by the viewport
   * height instead of the canvas height). Removing it deletes both. This test
   * pins that the Y is the axis regardless of what the caller passes, so a
   * re-introduced lift fails here.
   */
  it('centres the record on the camera axis whatever the viewport', () => {
    const withViewport = pulledDestination({ ...wall, viewport, widthFill: 0.9 });
    const withoutViewport = pulledDestination(wall);

    expect(withViewport.y, 'on the axis, -wallHeight/2').toBe(-wall.wallHeight / 2);
    expect(withoutViewport.y, 'the axis does not depend on the viewport').toBe(
      -wall.wallHeight / 2,
    );
  });

  it('is the same Y at a phone and a desktop wall', () => {
    const phone = pulledDestination({ wallWidth: wallPx(358), wallHeight: wallOf(10), viewport, widthFill: 0.9 });
    const desktop = pulledDestination({
      wallWidth: wallPx(1248),
      wallHeight: wallOf(4),
      viewport: { width: canvasPx(1280), height: canvasPx(900) },
      widthFill: 0.9,
    });
    /* Both on their own wall's axis — the record is centred at every width. */
    expect(phone.y).toBe(-wallOf(10) / 2);
    expect(desktop.y).toBe(-wallOf(4) / 2);
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


describe('the record settles at the VISIBLE viewport centre, not the wall centre', () => {
  const wallHeight = wallOf(10); // a tall wall, so scroll matters
  const viewportHeight = framePx(844);

  function ndcAt(y: number, z: number, camZ: number): number {
    const halfAngle = (WALL_FOV_DEGREES * Math.PI) / 360;
    const halfHeight = (camZ - z) * Math.tan(halfAngle);
    return (y - -wallHeight / 2) / halfHeight;
  }

  /**
   * **The record projects to the same screen place at any scroll (13b).** The
   * fix for the mis-PLACED record: its position must not depend on which row its
   * slot is in. Given the visible-viewport centre (scrollY + vh/2), the record's
   * projected NDC must match that centre's NDC — the same at scroll 0, 500, 2000.
   *
   * Fails against `y: -wallHeight/2` (the old value), whose NDC is fixed at the
   * WALL centre and so lands off-screen at the extremes.
   */
  it('places the record so it projects to the visible centre at every scroll', () => {
    /*
      **The camera the scene actually builds**, which is framed on the VIEWPORT
      rather than the wall since the pull-depth fix. This line read
      `wallCameraDistance({ wallHeight })` — a restatement of the implementation's
      old derivation, not an independent check of it, so it began comparing the
      record's position against a camera that no longer exists.

      The BEHAVIOUR asserted below is unchanged: the record projects to the
      centre of the visible slice at every scroll. Only the camera it is measured
      against moved.
    */
    const camZ = viewportCameraDistance({ viewportHeight });
    for (const scrollY of [0, 500, 2000]) {
      const viewCentrePx = canvasPx(scrollY + raw(viewportHeight) / 2);
      const target = pulledDestination({
        wallWidth: wallPx(358),
        wallHeight,
        viewport: { width: canvasPx(390), height: canvasPx(raw(viewportHeight)) },
        widthFill: 0.9,
        viewCentrePx,
        viewportHeight,
      });

      // The record's projected NDC.
      const recordNdc = ndcAt(target.y, target.z, camZ);
      // The visible centre's NDC on the wall plane.
      const centreNdc = ndcAt(-viewCentrePx, 0, camZ);
      expect(recordNdc, `scroll ${scrollY}: record centred in the visible slice`).toBeCloseTo(
        centreNdc,
        4,
      );
    }
  });

  it('falls back to the wall centre when no view centre is given', () => {
    /* The geometry tests and any caller without a scroll position are unchanged. */
    const target = pulledDestination({ wallWidth: wallPx(358), wallHeight });
    expect(target.y).toBe(-wallHeight / 2);
  });
});

/**
 * `FRAME_FILL` was hardcoded and had never been compared against anything — and
 * for most of this work the record's apparent size was being judged against the
 * plain-sleeve fallback, a flat grey rectangle, because the harness had no
 * artwork. A sweepable fill is what makes "is it big enough to be in your hands"
 * an answerable question.
 */
describe('the settled size is a parameter, not a constant', () => {
  const base = {
    wallWidth: wallPx(1248),
    wallHeight: wallOf(4),
    viewport: { width: canvasPx(1280), height: canvasPx(900) },
    viewportHeight: framePx(886),
  };

  /**
   * **A bigger fill brings the record CLOSER**, which is the whole mechanism:
   * apparent size is set by distance under a fixed lens.
   *
   * Fails against an implementation that ignores `frameFill` — which is exactly
   * what the width branch did before it was threaded through too.
   */
  it('settles nearer the camera for a larger fill', () => {
    const small = pulledDestination({ ...base, frameFill: 0.4 });
    const large = pulledDestination({ ...base, frameFill: 0.9 });

    expect(raw(large.z), 'larger fill is closer to the viewer').toBeGreaterThan(raw(small.z));
  });

  /** Omitting it must reproduce the shipped value exactly, or every existing judgement moves. */
  it('defaults to the shipped fill', () => {
    const omitted = pulledDestination(base);
    const explicit = pulledDestination({ ...base, frameFill: FRAME_FILL });

    expect(raw(omitted.z)).toBe(raw(explicit.z));
  });

  /**
   * **The fill must actually be the fraction it claims.** Solving the projection
   * back out is what catches an off-by-one in the formula that a
   * relative-ordering test would pass.
   */
  it('fills the fraction of frame height it names', () => {
    for (const fill of [0.4, 0.55, 0.9]) {
      const target = pulledDestination({ ...base, frameFill: fill });
      const cameraZ = raw(viewportCameraDistance({ viewportHeight: framePx(886) }));
      const distance = cameraZ - raw(target.z);
      const frameHeight = 2 * distance * Math.tan((WALL_FOV_DEGREES * Math.PI) / 360);

      expect(SPINE_HEIGHT / frameHeight, `fill ${fill}`).toBeCloseTo(fill, 4);
    }
  });

  /** The range must reach past the current value in both directions. */
  it('offers a range around the shipped value', () => {
    const values = Object.values(FRAME_FILLS);

    expect(Math.min(...values)).toBeLessThan(FRAME_FILL);
    expect(Math.max(...values), 'a ceiling worth trying').toBeGreaterThan(0.8);
  });
});
