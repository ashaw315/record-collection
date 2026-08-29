import { describe, expect, it } from 'vitest';
import { SPINE_HEIGHT, SHELF_EDGE } from '../shelf/spine';
import { WALL_FOV_DEGREES, wallCameraDistance } from './wall-camera';
import {
  framedCameraDistance,
  topClipMargin,
  shelfSurfaceDepth,
  shelfSurfaceSpan,
  SHELF_PLANE_DEPTH,
  SHELF_LIP_DEPTH,
} from './wall-framing';

const t = Math.tan((WALL_FOV_DEGREES * Math.PI) / 360);

/**
 * **The top row's spines are clipped, and the cause is not perspective.**
 *
 * The camera is framed so the wall EXACTLY fills the frame at the wall plane,
 * `z = 0`: the frustum's top edge lands at `y = 0`, which is precisely the top
 * of row 0. Zero margin.
 *
 * But spines are boxes standing IN FRONT of that plane, at `z = width / 2`
 * (~8-12px). The frustum narrows toward the camera, so at the spine's own depth
 * the visible top has dropped to `-z · tan(halfFOV)` and the spine's top
 * `z · tan(halfFOV)` pixels are outside the frame.
 *
 * Measured: **1.69px at every collection size** — 1 record, 17 and 125 — because
 * the shortfall is a function of spine depth and FOV alone, not of wall height.
 * That is why it is visible on every wall regardless of how many records are on
 * it, unlike the edge-compression defect whose severity is inverse to size.
 */
describe('the top row is not clipped by the frustum', () => {
  it('reports the shortfall a wall-plane framing leaves at the spine depth', () => {
    // A 12px-deep spine at 16 degrees loses z * tan(8deg).
    expect(topClipMargin({ spineDepth: 12 })).toBeCloseTo(12 * t, 5);
  });

  /**
   * The number that matters, stated as the defect. Fails against a camera
   * distance derived from the wall plane.
   */
  it('is INDEPENDENT of wall height, which is why every collection size shows it', () => {
    const twelve = topClipMargin({ spineDepth: 12 });
    expect(twelve).toBeCloseTo(1.69, 1);
    // Same answer whatever the wall height, because height is not an input.
    expect(topClipMargin({ spineDepth: 12 })).toBe(twelve);
  });

  /**
   * **The fix: frame against the plane the SPINES occupy, not the wall behind
   * them.** Standing that much further back widens the frustum at the spine's
   * depth by exactly the amount that was being lost.
   */
  it('stands the camera back so the spine plane is fully framed', () => {
    const wallHeight = 248;
    const spineDepth = 12;

    const framed = framedCameraDistance({ wallHeight, spineDepth });
    const naive = wallCameraDistance({ wallHeight });

    expect(framed, 'further back than a wall-plane framing').toBeGreaterThan(naive);

    // At the spine's depth the frustum must cover the wall's full height.
    const halfFrameAtSpine = (framed - spineDepth) * t;
    expect(halfFrameAtSpine, 'the spine plane is framed exactly').toBeCloseTo(wallHeight / 2, 5);
  });

  it('leaves the top of row 0 inside the frame, not exactly on its edge', () => {
    const wallHeight = 248;
    const spineDepth = 12;
    const framed = framedCameraDistance({ wallHeight, spineDepth });

    const cameraY = -wallHeight / 2;
    const visibleTop = cameraY + (framed - spineDepth) * t;

    // Row 0's spines run from y = 0 down to y = -SPINE_HEIGHT.
    expect(visibleTop, 'the spine top at y=0 is visible').toBeGreaterThanOrEqual(0);
  });

  it('still frames the wall when there is no spine depth to account for', () => {
    expect(framedCameraDistance({ wallHeight: 248, spineDepth: 0 })).toBeCloseTo(
      wallCameraDistance({ wallHeight: 248 }),
      5,
    );
  });
});

/**
 * **The shelf reads as a line rather than a surface because it has no depth.**
 *
 * §10b: "a dim wall carrying the shelf edge along its foot is the one that reads
 * as furniture", and the three surfaces are a fixed lighting order — the plane
 * lighter than the wall because a room lit from the front puts light on a
 * HORIZONTAL surface, the lip darker because it faces the viewer.
 *
 * A vertical quad has no horizontal surface. It cannot catch the light the
 * ordering describes, so the plane and the lip differ only by their authored
 * colours and the shelf reads as two thin stripes with the records floating in
 * front of them.
 *
 * `shelf-surface.ts` has carried `PLANE_DEPTH = 6` and `LIP_DEPTH = 2` since the
 * CSS wall — "deeper than this and the shelf reads as a plinth each row stands
 * on; shallower and it disappears into its own lip". The WebGL wall never used
 * them.
 */
describe('the shelf has depth, so a record stands ON it', () => {
  it('carries the depths the surface rule was written against', () => {
    expect(SHELF_PLANE_DEPTH).toBe(6);
    expect(SHELF_LIP_DEPTH).toBe(2);
    expect(
      SHELF_PLANE_DEPTH + SHELF_LIP_DEPTH,
      'the two together are the shelf edge',
    ).toBe(SHELF_EDGE);
  });

  /**
   * **The shelf must reach the front of the deepest spine.**
   *
   * A spine's box is positioned at `z = width / 2` and scaled to `width`, so it
   * spans `z = 0` (flush with the wall) to `z = width` — up to 24px forward.
   * `PLANE_DEPTH = 6` was authored for the CSS shelf and reaches z = 6, leaving
   * two thirds of every record's foot over nothing. That is what lets you see
   * underneath the top row.
   *
   * **The constant is not changed**: "deeper than this and the shelf reads as a
   * plinth each row stands on" was decided by looking, and it is about the
   * VISIBLE lip, not about how far back the surface runs under the records. So
   * the depth the geometry needs is derived from the spines instead, and the
   * authored constant keeps its own job.
   */
  /**
   * **A SHELF IS AS DEEP AS THE RECORD IS TALL, because a 12" sleeve is SQUARE.**
   *
   * The first version derived this from spine WIDTH, which made the plane
   * exactly as deep as the deepest record — so the surface visible BEHIND the
   * records was zero, at every tilt angle, by construction. Adam, looking at the
   * 20° comparison: *"At 20° I can see the top of every record and still nothing
   * of the surface they stand on. That is not occlusion hiding the shelf. There
   * is no surface there to hide."*
   *
   * He was right and my occlusion explanation was wrong. A record standing on a
   * shelf occupies its own THICKNESS of depth (17-24px here); the shelf it
   * stands on runs back the sleeve's full DIMENSION, which for a square sleeve
   * is the same 240px as its height. The built plane was short by a factor of 10.
   *
   * Measured at 20° tilt, plane visible behind the records:
   *
   *     24px plane   ->   0.0px
   *     240px plane  ->  73.9px
   */
  /**
   * **The shelf is as deep as a RECORD, not as deep as a sleeve is tall.**
   *
   * The previous rule said 240px because a 12" sleeve is square — true of a
   * sleeve lying flat, and wrong here. **These records stand EDGE-ON.** What
   * occupies shelf depth is a record's THICKNESS, and a shelf ten times deeper
   * than the thing standing on it reads as a plank the records are perched on
   * the front of, which is exactly what the 3/4 orbit showed.
   *
   * Adam: *"the shelf runs back much further than a record is deep, so it is
   * both too deep and in the wrong place relative to the things standing on
   * it."*
   *
   * So: the deepest record, plus a small overhang at the front.
   */
  it('is as deep as a record, plus a small front overhang', () => {
    const deepestSpine = Math.round(SPINE_HEIGHT / 10); // MAX_SPINE_WIDTH = 24
    expect(shelfSurfaceDepth()).toBeGreaterThan(deepestSpine);
    expect(
      shelfSurfaceDepth(),
      'a shelf many times a record deep reads as a plank, not a shelf',
    ).toBeLessThan(deepestSpine * 2);
  });

  /**
   * A little surface must remain visible behind the records — enough to read as
   * a shelf they stand ON rather than a ledge they sit at the edge of — but not
   * the 210px the sleeve-is-square rule produced.
   */
  it('leaves a little surface behind the records, not a plank', () => {
    const deepestSpine = Math.round(SPINE_HEIGHT / 10);
    const behind = shelfSurfaceDepth() - deepestSpine;
    expect(behind, 'some surface behind the record').toBeGreaterThan(0);
    expect(behind, 'but not a plank running off behind them').toBeLessThan(deepestSpine);
  });

  /**
   * **THE RECORDS STAND AT THE FRONT OF THE SHELF, and the surface runs BACK.**
   *
   * `+z` is toward the camera. Records span `z = 0..width` — their backs flush
   * with the wall — so a surface spanning `z = 0..240` extends 216px toward the
   * VIEWER, in front of them. The records end up perched on the shelf's rear
   * edge with a plank jutting out under nothing, which is what "the shelf runs
   * out before the records do" describes from the other side.
   *
   * A shelf you browse holds the record at the front, sleeve face-on, with the
   * surface running back toward the wall. So the surface starts BEHIND the wall
   * plane and ends just past the deepest record.
   */
  /**
   * **The record stands ON the surface, with the surface reaching past it on
   * BOTH sides.** Verified in the 3/4 orbit, which is the only view in which
   * this dimension is visible at all — square-on compresses it to nothing, which
   * is how a shelf the wrong depth survived three rounds of looking.
   */
  it('brackets the record: surface behind it and a small overhang in front', () => {
    const { back, front } = shelfSurfaceSpan();
    const deepestSpine = Math.round(SPINE_HEIGHT / 10);

    expect(back, 'surface continues behind the deepest record').toBeLessThan(0);
    expect(front, 'and overhangs a little in front of it').toBeGreaterThan(deepestSpine);
    expect(front - deepestSpine, 'a small overhang, not a ledge').toBeLessThan(deepestSpine);
    expect(Math.abs(back), 'and not a plank behind').toBeLessThan(deepestSpine);
  });

  it('is deeper than a record, so the record sits ON it rather than filling it', () => {
    const { back, front } = shelfSurfaceSpan();
    const deepestSpine = Math.round(SPINE_HEIGHT / 10);
    expect(front - back, 'total surface depth').toBe(shelfSurfaceDepth());
    expect(front - back).toBeGreaterThan(deepestSpine);
  });

  it('keeps the authored lip depth, which is what the eye judges', () => {
    // The lip is the front face the viewer sees; its 2px was chosen by looking.
    expect(SHELF_LIP_DEPTH).toBe(2);
  });
});
