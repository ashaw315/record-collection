import { describe, expect, it } from 'vitest';
import {
  COS30,
  DEPTH,
  SHELF_DEPTH,
  SHELF_INSET_Y,
  SIN30,
  SPINE_HEIGHT,
  coverTransform,
  frontFace,
  project,
  rightFace,
  spineWidth,
  topFace,
  type PlacedSeat,
} from './geometry';
import { ARROW_LANE, LANDING_PAD, landedBox, landingBox, landingBoxAt, landingSize, projectedBox } from './landing';
import { pullEase } from './pull-curve';

/**
 * §11.10: the pulled record stays in the projection — it slides forward
 * along the depth axis and grows, and it does not straighten. The right face
 * is the cover, so the cover arrives as a parallelogram at the wall's own
 * angle: large, unmistakably the cover, and still part of the same drawing.
 * §11.9's straightening is withdrawn: a flat axis-aligned square had no edge
 * in common with anything beneath it and read as an image pasted over a line
 * drawing. And the seat empties — a record cannot be in the row and in front
 * of it; the gap says where it goes back.
 *
 * **The landed record is a box under the one projection.** Its cover face is
 * `rightFace()` of that box — the same function that draws every seated face
 * — so its shear is the wall's angle by construction and a landing that
 * drifts toward flat cannot exist, rather than being asserted away.
 */
/* Placed as layoutRow places it: the width is the id's hash, which is what the landing keeps. */
const seat: PlacedSeat = { id: 'r', x: 100, y: 0, z: 594, width: spineWidth('r') };
const view = { x: 0, y: 0, width: 960, height: 760 };

describe('landingSize — the largest cover face the region holds', () => {
  it('fits both the face’s projected height and its projected width, inset by the pads and the arrow lanes', () => {
    const size = landingSize(view, seat.width);
    /* A W × S × S box projects (S + W)·cos30 wide and S + (S + W)·sin30 tall. */
    expect(size + (size + seat.width) * SIN30).toBeLessThanOrEqual(view.height - 2 * LANDING_PAD + 1e-9);
    expect((size + seat.width) * COS30).toBeLessThanOrEqual(view.width - 2 * (LANDING_PAD + ARROW_LANE) + 1e-9);
    expect(size).toBeGreaterThan(SPINE_HEIGHT * 2);
  });
});

describe('landedBox — where the record lands', () => {
  const box = landedBox(seat.id, view);

  it('keeps the record’s own width, grows depth and height to one square face, and stands one shelf’s depth in front of the row', () => {
    expect(box.width).toBe(seat.width);
    expect(box.depth).toBe(box.height);
    expect(box.height).toBe(landingSize(view, seat.width));
    expect(box.y).toBe(SHELF_INSET_Y + SHELF_DEPTH);
  });

  it('is centred in the visible region, in projection', () => {
    const bb = projectedBox(box);
    expect((bb.minX + bb.maxX) / 2).toBeCloseTo(view.x + view.width / 2, 6);
    expect((bb.minY + bb.maxY) / 2).toBeCloseTo(view.y + view.height / 2, 6);
  });

  it('has a cover face that IS rightFace() of the box — sheared at the wall’s angle, exactly', () => {
    const cover = rightFace(box);
    /* Vertical edges vertical, exactly; horizontal edges at 30°, exactly the projection's. */
    expect(cover[0][0]).toBe(cover[3][0]);
    expect(cover[1][0]).toBe(cover[2][0]);
    const slope = (cover[1][1] - cover[0][1]) / (cover[1][0] - cover[0][0]);
    expect(slope).toBeCloseTo(-SIN30 / COS30, 12);
    /* And the far-top corner is where project() puts it: nothing about the face is re-derived. */
    expect(cover[3]).toEqual(project(box.x + box.width, box.y, box.z + box.height));
  });
});

describe('landingBoxAt — one curve from the seat to the landing', () => {
  it('is the seat’s own box at 0 and the landed box at 1, exactly', () => {
    const at0 = landingBoxAt(seat, view, 0);
    expect(at0).toEqual({ ...seat, depth: DEPTH, height: SPINE_HEIGHT });
    expect(rightFace(at0)).toEqual(rightFace(seat));
    expect(frontFace(at0)).toEqual(frontFace(seat));
    expect(topFace(at0)).toEqual(topFace(seat));
    expect(landingBoxAt(seat, view, 1)).toEqual(landedBox(seat.id, view));
  });

  it('draws the landed box’s faces from its own depth and height — not the seated constants', () => {
    const landed = landedBox(seat.id, view);
    const cover = rightFace(landed);
    expect(cover[1]).toEqual(project(landed.x + landed.width, landed.y + landed.depth, landed.z));
    expect(cover[3]).toEqual(project(landed.x + landed.width, landed.y, landed.z + landed.height));
    expect(topFace(landed)[2]).toEqual(project(landed.x + landed.width, landed.y + landed.depth, landed.z + landed.height));
    expect(frontFace(landed)[0]).toEqual(project(landed.x, landed.y + landed.depth, landed.z));
    /* And the cover's plane is entered at the box's near-top corner, unmirrored, at the wall's angle. */
    const [px, py] = project(landed.x + landed.width, landed.y + landed.depth, landed.z + landed.height);
    expect(coverTransform(landed)).toBe(`matrix(${COS30} ${-SIN30} 0 1 ${px} ${py})`);
  });

  it('moves every dimension on the pull’s eased value — translation, growth and depth together', () => {
    const landed = landedBox(seat.id, view);
    const eased = pullEase(0.5);
    const at = landingBox(seat, view, 0.5);
    expect(at.x).toBeCloseTo(seat.x + (landed.x - seat.x) * eased, 9);
    expect(at.y).toBeCloseTo(seat.y + (landed.y - seat.y) * eased, 9);
    expect(at.z).toBeCloseTo(seat.z + (landed.z - seat.z) * eased, 9);
    expect(at.depth).toBeCloseTo(DEPTH + (landed.depth - DEPTH) * eased, 9);
    expect(at.height).toBeCloseTo(SPINE_HEIGHT + (landed.height - SPINE_HEIGHT) * eased, 9);
    /* Still a box under the projection at every step: its faces share their corners. */
    expect(frontFace(at)[2]).toEqual(rightFace(at)[2]);
    expect(topFace(at)[1]).toEqual(rightFace(at)[3]);
  });

  it('never straightens: the cover’s top edge keeps the wall’s slope at every step', () => {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const cover = rightFace(landingBoxAt(seat, view, t));
      const slope = (cover[1][1] - cover[0][1]) / (cover[1][0] - cover[0][0]);
      expect(slope, `t=${t}`).toBeCloseTo(-SIN30 / COS30, 12);
    }
  });
});
