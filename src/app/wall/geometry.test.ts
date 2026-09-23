import { describe, expect, it } from 'vitest';
import {
  COS30,
  DEPTH,
  ROW_PITCH,
  SEAT_PITCH,
  SHELF_DEPTH,
  SHELF_INSET_X,
  SHELF_INSET_Y,
  SIN30,
  SPINE_HEIGHT,
  SPINE_WIDTH_MAX,
  SPINE_WIDTH_MIN,
  coverTransform,
  frontFace,
  labelTransform,
  labelsFit,
  layoutRow,
  oneRecordPx,
  project,
  rightFace,
  rowBreaks,
  spineWidth,
  topFace,
  type PlacedSeat,
} from './geometry';
import { paintOrder, seatBounds } from './paint-sort';

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
    expect(SPINE_HEIGHT).toBe(150);
    expect(SPINE_WIDTH_MIN).toBe(Math.round(SPINE_HEIGHT / 14));
    expect(SPINE_WIDTH_MAX).toBe(Math.round(SPINE_HEIGHT / 10));
    expect(SPINE_WIDTH_MIN).toBe(11);
    expect(SPINE_WIDTH_MAX).toBe(15);
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

});

describe('one projection', () => {
  it('is the reference’s: x down-right, y down-left, z straight up', () => {
    expect(project(1, 0, 0)).toEqual([COS30, SIN30]);
    expect(project(0, 1, 0)).toEqual([-COS30, SIN30]);
    expect(project(0, 0, 1)).toEqual([0, -1]);
    expect(project(0, 0, 0)).toEqual([0, 0]);
  });

  it('draws the front face as the same four 3D corners seen once', () => {
    /* The spine is the +y face, at y + D — toward the camera; its four corners projected, in order. */
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

describe('which side the reader is on (§W.20) — the sign convention, asserted once', () => {
  /*
    P(x, y, z) = [(x − y)·cos30, (x + y)·sin30 − z] collapses (1, 1, 1):
    P(1, 1, 1) = 0, so the camera lies on that line, and with the tops
    visible it is at +(1, 1, 1). The visible faces are +x, +y and +z; the
    spine is the +y face and LARGER is nearer on every axis. §W.15's
    (+, −, +) camera is not a viewpoint of this projection — P(1, −1, 1) is
    not zero — and is withdrawn by §W.20. An extent comparison cannot
    catch a flip in y; this block can.
  */
  const seat: PlacedSeat = { id: 'r', x: 100, y: 16, z: 458, width: 19 };

  it('the projection collapses (1, 1, 1) and nothing else on the ±y side', () => {
    expect(project(1, 1, 1)).toEqual([0, 0]);
    expect(project(1, -1, 1)).not.toEqual([0, 0]);
  });

  it('puts the spine on the +y face: the front face is at y + depth', () => {
    expect(frontFace(seat)[0]).toEqual(project(100, 16 + DEPTH, 458));
    expect(frontFace({ ...seat, depth: 300 })[0], 'at the box’s own depth').toEqual(project(100, 16 + 300, 458));
  });

  it('enters the label’s plane at the +y face’s bottom-left corner', () => {
    const [px, py] = project(100, 16 + DEPTH, 458);
    expect(labelTransform(seat)).toBe(`matrix(0 -1 ${COS30} ${SIN30} ${px} ${py})`);
  });
});

describe('the row is on the axis', () => {
  const seats = Array.from({ length: 5 }, (_, index) => ({ id: `r${index}`, section: 'A' }));

  it('advances each seat by the unit’s fixed pitch, the hashed width textured inside it', () => {
    /*
      §W.10: the row is the unit's, not the collection's — a fixed seat of 17
      (a 12 spine and a 5 gap as drawn), the record's width varying inside it.
    */
    const placed = layoutRow(seats, 0);
    expect(placed[0].x).toBe(SHELF_INSET_X);
    for (let index = 1; index < placed.length; index += 1) {
      expect(placed[index].x).toBe(placed[index - 1].x + SEAT_PITCH);
      expect(placed[index].width).toBeLessThanOrEqual(SEAT_PITCH - 2);
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
    const [a, b] = layoutRow(seats, 0);
    const [fa, fb] = [frontFace(a), frontFace(b)];
    const [dx, dy] = project(b.x - a.x, 0, 0);

    expect(dy, 'the row is not flat').not.toBe(0);
    /* Left edges only: the right edges also carry the two widths' difference. */
    for (const index of [0, 3]) {
      expect(fb[index][0] - fa[index][0], `corner ${index} Δsx`).toBeCloseTo(dx, 9);
      expect(fb[index][1] - fa[index][1], `corner ${index} Δsy`).toBeCloseTo(dy, 9);
    }
  });

  it('stacks rows down the z axis at the pitch, row 0 highest — one fixture, nothing along x (§W.23)', () => {
    const top = layoutRow(seats, 0)[0];
    const next = layoutRow(seats, 1)[0];
    expect(top.z - next.z).toBe(ROW_PITCH);
    expect(top.x).toBe(next.x);
  });
});

describe('§2’s section breaks are marks within the shelf, not its ends (§W.7)', () => {
  const shelf = [
    { id: 'a1', section: 'A' },
    { id: 'a2', section: 'A' },
    { id: 'b1', section: 'B' },
    { id: 'b2', section: 'B' },
    { id: 'c1', section: 'C' },
  ];
  const placed = layoutRow(shelf, 0);

  it('draws one rule across the plane at each boundary between sections, none within one', () => {
    const breaks = rowBreaks(shelf, placed);
    expect(breaks).toHaveLength(2);
    const between = (a: PlacedSeat, b: PlacedSeat) => (a.x + a.width + b.x) / 2;
    const z = placed[0].z;
    expect(breaks[0]).toEqual([
      project(between(placed[1], placed[2]), 0, z),
      project(between(placed[1], placed[2]), SHELF_DEPTH, z),
    ]);
    expect(breaks[1][0]).toEqual(project(between(placed[3], placed[4]), 0, z));
  });

  it('draws none within a section', () => {
    const one = [{ id: 'x', section: 'A' }];
    expect(rowBreaks(one, layoutRow(one, 0))).toEqual([]);
  });

  it('keeps the break where the pulled record’s seat is, since the seat is still there', () => {
    expect(rowBreaks(shelf, layoutRow(shelf, 0))).toHaveLength(2);
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

  it('maps the cover’s rect onto the right face entered from its NEAR-top corner (y + D, the spine’s edge), local x toward the far end, un-mirrored', () => {
    /*
      D2's matrix(−cos30, sin30, 0, 1, far-top) has determinant −cos30: the
      plane is mirrored, which is why D2 removed its caption rather than
      un-mirroring it. §W.7 puts type on this face for the record with no
      cover, and a sleeve's own lettering reads backwards on a mirrored
      plane — so the face is entered from the near-top corner (y + D, where
      the spine is) with local x running toward the far end: the cover's
      left edge is at the spine, as a front cover's is. matrix(cos30, −sin30,
      0, 1, near-top), determinant +cos30. local (0,0) → near-top, (D,0) →
      far-top, (0,H) → near-bottom.
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
    near(apply(0, 0), project(119, 16 + D, 458 + H));
    near(apply(D, 0), project(119, 16, 458 + H));
    near(apply(0, H), project(119, 16 + D, 458));
    expect(a * d - b * c, 'not mirrored: positive determinant').toBeGreaterThan(0);
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

describe('paint order within a row is seat order (§W.8)', () => {
  /**
   * SVG has no z-index: paint order is document order, and document order is
   * what a keyboard walks. Within a row the separating-plane order agrees
   * with seat order because seats are separated on x alone. Across rows it
   * does not — the upper row is nearer and paints later — and that question
   * is with Design (paint-sort.test.ts, WallLabelled.test.tsx).
   */
  const row = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, section: 'A' }));
  const placed = layoutRow(row, 0).map((seat) => seatBounds(seat));

  it('agrees on every seat of a row', () => {
    expect(paintOrder(placed).map((seat) => seat.id)).toEqual(placed.map((seat) => seat.id));
  });

  it('would disagree if a seat varied in depth — the control that shows the check discriminates', () => {
    const perturbed = placed.map((seat) => (seat.id === 'a1' ? { ...seat, y0: seat.y0 + 200, y1: seat.y1 + 200 } : seat));
    expect(paintOrder(perturbed).map((seat) => seat.id)).not.toEqual(perturbed.map((seat) => seat.id));
  });
});
