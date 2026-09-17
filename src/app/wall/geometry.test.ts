import { describe, expect, it } from 'vitest';
import {
  COS30,
  DEPTH,
  GAP,
  LEDGE,
  ROW_PITCH,
  SHELF_INSET_X,
  SHELF_INSET_Y,
  SIN30,
  SLIDE,
  SPINE_HEIGHT,
  SPINE_WIDTH_MAX,
  SPINE_WIDTH_MIN,
  coverTransform,
  frontFace,
  labelsFit,
  layoutRow,
  oneRecordPx,
  paintOrder,
  project,
  rightFace,
  rowPlanes,
  shelfPlane,
  spineWidth,
  topFace,
  type PlacedSeat,
} from './geometry';

/**
 * The geometry both wall components share (The Wall D2, on 5b's constants).
 *
 * **One `project(x, y, z)` and nothing individually sheared.** 5b advanced
 * seats along the projection's length axis; the build advanced them along
 * screen x and sheared each spine on its own, so the row was flat, 5b's climb
 * sat in the pitch as an empty band, and the shelf — laid along the axis
 * correctly — peeled away from spines that were not. c5ce6ab flattened the
 * shelf to match, and its test asserted the flattening as an invariant. That
 * test is deleted with this file's rewrite, not updated: it encoded the defect.
 *
 * Every face below is three coordinates seen once through the same function.
 */

describe('the wall proportions derive rather than being asserted', () => {
  it('derives the width bounds from the spine height', () => {
    expect(SPINE_HEIGHT).toBe(240);
    expect(SPINE_WIDTH_MIN).toBe(Math.round(SPINE_HEIGHT / 14));
    expect(SPINE_WIDTH_MAX).toBe(Math.round(SPINE_HEIGHT / 10));
    expect(SPINE_WIDTH_MIN).toBe(17);
    expect(SPINE_WIDTH_MAX).toBe(24);
  });

  it('keeps every spine inside the real bounds', () => {
    for (let index = 0; index < 200; index += 1) {
      const width = spineWidth(`record-${index}`);
      expect(width, `record-${index}`).toBeGreaterThanOrEqual(SPINE_WIDTH_MIN);
      expect(width, `record-${index}`).toBeLessThanOrEqual(SPINE_WIDTH_MAX);
    }
  });

  it('gives one record one width, stably', () => {
    expect(spineWidth('abc')).toBe(spineWidth('abc'));
    expect(spineWidth('abc')).not.toBe(spineWidth('xyz'));
  });

  /**
   * **D2's figures are the reference's units (H = 150) applied as ratios to
   * 5b's 240**, because the 9px floor's argument is made at 240 and a 12-unit
   * spine would not hold it. Each ratio is named so the next change to H moves
   * every figure with it rather than one of them.
   */
  it('applies D2’s ratios to the wall’s constant', () => {
    const ratio = SPINE_HEIGHT / 150;
    expect(DEPTH, 'square: a record is as deep as it is tall').toBe(SPINE_HEIGHT);
    expect(GAP).toBe(Math.round(5 * ratio));
    expect(SHELF_INSET_X).toBe(Math.round(20 * ratio));
    expect(SHELF_INSET_Y).toBe(Math.round(10 * ratio));
    expect(LEDGE).toBe(Math.round(46 * ratio));
    expect(SLIDE, 'the slide equals the ledge').toBe(LEDGE);
    expect(ROW_PITCH).toBe(Math.round(286 * ratio));
  });
});

describe('one projection', () => {
  it('is the reference’s: x down-right, y down-left, z straight up', () => {
    expect(project(1, 0, 0)).toEqual([COS30, SIN30]);
    expect(project(0, 1, 0)).toEqual([-COS30, SIN30]);
    expect(project(0, 0, 1)).toEqual([0, -1]);
    expect(project(0, 0, 0)).toEqual([0, 0]);
  });

  it('draws the front face as the same four 3D corners seen once', () => {
    /* The spine's near face lies at y + D; its four corners projected, in order. */
    const seat: PlacedSeat = { id: 'r', x: 100, y: 16, z: 458, width: 19 };
    const D = DEPTH;
    expect(frontFace(seat)).toEqual([
      project(100, 16 + D, 458),
      project(119, 16 + D, 458),
      project(119, 16 + D, 458 + SPINE_HEIGHT),
      project(100, 16 + D, 458 + SPINE_HEIGHT),
    ]);
  });
});

describe('the row is on the axis', () => {
  const seats = Array.from({ length: 5 }, (_, index) => ({ id: `r${index}`, section: 'A' }));

  it('advances each seat by its width plus the gap, along x', () => {
    /*
      D2: thickness plus gap is what keeps the objects countable — at 22 with
      no gap the top faces tile into a ramp. So the gap is fixed and the seat
      pitch follows the width, rather than every seat sitting at the widest.
    */
    const placed = layoutRow(seats, 0, null);
    expect(placed[0].x).toBe(SHELF_INSET_X);
    for (let index = 1; index < placed.length; index += 1) {
      expect(placed[index].x).toBe(placed[index - 1].x + placed[index - 1].width + GAP);
      expect(placed[index].y).toBe(SHELF_INSET_Y);
      expect(placed[index].z).toBe(placed[0].z);
    }
  });

  it('moves consecutive seats by a translation ALONG THE AXIS, not along the screen', () => {
    /**
     * **The test that replaces the deleted one.** Corresponding corners of two
     * neighbours differ by exactly project(Δx, 0, 0): the row climbs (or
     * falls) at the projection's own rate as it goes, because it lies on the
     * axis. A row laid along screen x has Δsy = 0 here and fails.
     */
    const [a, b] = layoutRow(seats, 0, null);
    const [fa, fb] = [frontFace(a), frontFace(b)];
    const [dx, dy] = project(b.x - a.x, 0, 0);

    expect(dy, 'the row is not flat').not.toBe(0);
    /* Left edges only: the right edges also carry the two widths' difference. */
    for (const index of [0, 3]) {
      expect(fb[index][0] - fa[index][0], `corner ${index} Δsx`).toBeCloseTo(dx, 9);
      expect(fb[index][1] - fa[index][1], `corner ${index} Δsy`).toBeCloseTo(dy, 9);
    }
  });

  it('stacks rows down the z axis at the pitch, row 0 highest', () => {
    const top = layoutRow(seats, 0, null)[0];
    const next = layoutRow(seats, 1, null)[0];
    expect(top.z - next.z).toBe(ROW_PITCH);
    expect(top.x).toBe(next.x);
  });
});

describe('the shelf is a single plane the records stand on', () => {
  const seats = Array.from({ length: 3 }, (_, index) => ({ id: `r${index}`, section: 'A' }));
  const placed = layoutRow(seats, 0, null);

  const inside = (point: readonly [number, number], polygon: ReadonlyArray<readonly [number, number]>) => {
    /* Ray casting, with a tolerance for a point ON an edge. */
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi + 1e-9) {
        hit = !hit;
      }
    }
    return hit;
  };

  it('is one polygon per run, at the row’s height, spanning the run’s seats and the ledge', () => {
    const plane = shelfPlane(placed, placed[0].z);
    const last = placed[placed.length - 1];
    const x0 = placed[0].x - SHELF_INSET_X;
    const x1 = last.x + last.width + SHELF_INSET_X;
    expect(plane).toEqual([
      project(x0, 0, placed[0].z),
      project(x1, 0, placed[0].z),
      project(x1, SHELF_INSET_Y + DEPTH + LEDGE, placed[0].z),
      project(x0, SHELF_INSET_Y + DEPTH + LEDGE, placed[0].z),
    ]);
  });

  it('has every spine’s feet on it — the shelf meets the records standing on it', () => {
    /* The invariant c5ce6ab was after, asserted on the surface itself. */
    const plane = shelfPlane(placed, placed[0].z);
    for (const seat of placed) {
      const [footL, footR] = frontFace(seat);
      expect(inside(footL, plane), `${seat.id} left foot on the plane`).toBe(true);
      expect(inside(footR, plane), `${seat.id} right foot on the plane`).toBe(true);
    }
  });

  it('lands the pulled record’s front edge exactly on the shelf’s front', () => {
    /* SLIDE equals LEDGE so the slid record stops at the plane's near edge, never past it. */
    const pulled = layoutRow(seats, 0, 'r1').find((seat) => seat.id === 'r1');
    expect(pulled?.y).toBe(SHELF_INSET_Y + SLIDE);
    expect((pulled?.y ?? 0) + DEPTH).toBe(SHELF_INSET_Y + DEPTH + LEDGE);
  });
});

describe('faces paint back to front by x + y, globally', () => {
  it('orders by depth from the camera and ignores z', () => {
    /**
     * D2: a record slid forward on one shelf is nearer than everything on
     * every other shelf at the same x. Sorting per shelf painted the pulled
     * record under rows it stands in front of.
     */
    const upper: PlacedSeat = { id: 'u', x: 100, y: 16, z: 458, width: 20 };
    const lowerSlid: PlacedSeat = { id: 's', x: 100, y: 16 + SLIDE, z: 0, width: 20 };
    const lowerRight: PlacedSeat = { id: 'r', x: 200, y: 16, z: 0, width: 20 };
    const order = paintOrder([lowerRight, lowerSlid, upper]).map((seat) => seat.id);
    expect(order).toEqual(['u', 's', 'r']);
  });

  it('is stable on ties, so a row keeps its seat order', () => {
    const a: PlacedSeat = { id: 'a', x: 50, y: 16, z: 0, width: 20 };
    const b: PlacedSeat = { id: 'b', x: 30, y: 36, z: 458, width: 20 };
    expect(paintOrder([a, b]).map((s) => s.id)).toEqual(['a', 'b']);
    expect(paintOrder([b, a]).map((s) => s.id)).toEqual(['b', 'a']);
  });
});

describe('the row pitch keeps one row off the next', () => {
  it('exceeds the silhouette plus the ledge — the figure 238 failed on', () => {
    /*
      D2: "at 238 the lower row's top faces ate the upper row's ledge." The
      lower row's highest point is its far top corner; the upper row's lowest
      is its plane's near edge. In projection that is PITCH > H + (D + LEDGE)·sin30
      — 248 in D2's units, which 238 fails and 286 clears by 38.
    */
    const minimum = SPINE_HEIGHT + (DEPTH + LEDGE) * SIN30;
    expect(ROW_PITCH).toBeGreaterThan(minimum);

    const seats = [{ id: 'r', section: 'A' }];
    const upper = layoutRow(seats, 0, null);
    const lower = layoutRow(seats, 1, null);
    const upperPlaneNear = shelfPlane(upper, upper[0].z)[2][1];
    const lowerTopFar = project(lower[0].x, lower[0].y, lower[0].z + SPINE_HEIGHT)[1];
    expect(lowerTopFar, 'the lower row’s top stays below the upper plane').toBeGreaterThan(upperPlaneNear);
  });
});

describe('5b’s two faces, on the same three coordinates (D2)', () => {
  const seat: PlacedSeat = { id: 'r', x: 100, y: 16, z: 458, width: 19 };
  const H = SPINE_HEIGHT;
  const D = DEPTH;

  it('draws the top face at z + H over the record’s footprint', () => {
    expect(topFace(seat)).toEqual([
      project(100, 16, 458 + H),
      project(119, 16, 458 + H),
      project(119, 16 + D, 458 + H),
      project(100, 16 + D, 458 + H),
    ]);
  });

  it('draws the right face at x + width, back to front, floor to top', () => {
    expect(rightFace(seat)).toEqual([
      project(119, 16, 458),
      project(119, 16 + D, 458),
      project(119, 16 + D, 458 + H),
      project(119, 16, 458 + H),
    ]);
  });

  it('shares its corners: the front’s top-right IS the top’s near-right IS the right’s near-top', () => {
    /* One object, not three drawings that happen to touch. */
    const front = frontFace(seat);
    const top = topFace(seat);
    const right = rightFace(seat);
    expect(front[2]).toEqual(top[2]);
    expect(front[2]).toEqual(right[2]);
    expect(top[1], 'the top’s far-right is the right’s far-top').toEqual(right[3]);
    expect(front[1], 'the front’s bottom-right is the right’s near-bottom').toEqual(right[1]);
  });

  it('maps the cover’s rect onto the right face with D2’s matrix, which mirrors', () => {
    /*
      matrix(−cos30, sin30, 0, 1, P) with P the right face's far-top corner:
      local (0,0) → P, local (D,0) → the near-top corner, local (0,H) → the
      far-bottom corner. Its determinant is −cos30: the plane is mirrored,
      which is why the pulled record carries no caption — text on it would
      fight the geometry. Removed rather than un-mirrored (D2).
    */
    const t = coverTransform(seat);
    const m = /^matrix\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)$/.exec(t);
    expect(m, t).not.toBeNull();
    if (m === null) return;
    const [a, b, c, d, e, f] = m.slice(1).map(Number);
    const apply = (lx: number, ly: number) => [a * lx + c * ly + e, b * lx + d * ly + f];
    const near = (p: readonly number[], q: readonly number[]) => {
      expect(p[0]).toBeCloseTo(q[0], 6);
      expect(p[1]).toBeCloseTo(q[1], 6);
    };
    near(apply(0, 0), project(119, 16, 458 + H));
    near(apply(D, 0), project(119, 16 + D, 458 + H));
    near(apply(0, H), project(119, 16, 458));
    expect(a * d - b * c, 'mirrored: negative determinant').toBeLessThan(0);
  });
});

describe('the plane spans seats, not occupants (5b §2)', () => {
  it('still draws the plane under a run whose only record is pulled', () => {
    /*
      Found by the four-shelf split: a shelf of one record, pulled, lost its
      plane — shelfRuns drops a run with no seated records, and the plane was
      built from those runs. The record floated over nothing, which is the
      gap §2 forbids: the shelf is still there and the record is not on it.
    */
    const shelf = [{ id: 'only', section: 'A' }];
    const placed = layoutRow(shelf, 0, 'only');
    expect(rowPlanes(shelf, placed)).toHaveLength(1);
  });

  it('keeps one plane per section run with a record pulled from the middle', () => {
    const shelf = [
      { id: 'a1', section: 'A' },
      { id: 'a2', section: 'A' },
      { id: 'b1', section: 'B' },
    ];
    const placed = layoutRow(shelf, 0, 'a2');
    const planes = rowPlanes(shelf, placed);
    expect(planes).toHaveLength(2);
    /* A's plane spans both its seats, a2's included, at its slid-free extent. */
    expect(planes[0]).toEqual(shelfPlane(placed.slice(0, 2), placed[0].z));
  });
});

describe('D1: the wall renders at 1:1 and pans; §5 removes labels only below one record', () => {
  it('measures one record as the projected width of its three faces', () => {
    const seat: PlacedSeat = { id: 'r', x: 0, y: 0, z: 0, width: SPINE_WIDTH_MAX };
    const xs = [...frontFace(seat), ...topFace(seat), ...rightFace(seat)].map(([x]) => x);
    expect(oneRecordPx()).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 6);
    /* (width + depth) · cos30 — the footprint seen from the corner. */
    expect(oneRecordPx()).toBeCloseTo((SPINE_WIDTH_MAX + DEPTH) * COS30, 6);
  });

  it('keeps labels at any container that holds one record, and removes them below it', () => {
    expect(labelsFit(1440)).toBe(true);
    expect(labelsFit(Math.ceil(oneRecordPx()))).toBe(true);
    expect(labelsFit(Math.floor(oneRecordPx()) - 1)).toBe(false);
    expect(labelsFit(0)).toBe(false);
  });
});
