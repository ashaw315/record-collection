import { describe, expect, it } from 'vitest';
import {
  DEPTH,
  GAP,
  ROW_PITCH,
  SEAT_PITCH,
  SHELF_DEPTH,
  SHELF_LENGTH,
  SHELF_THICKNESS,
  SPINE_HEIGHT,
  SPINE_WIDTH_MAX,
  SPINE_WIDTH_MIN,
  UNIT_PITCH_X,
  UPRIGHT,
  project,
} from './geometry';
import { PER_SHELF, SHELVES_PER_UNIT, intoUnits, unitFurniture, unitOf } from './unit';

/**
 * §11.10: the wall is a fixed unit of four shelves joined at their ends, and
 * the collection fills it left to right, top to bottom. Row length comes from
 * the unit's proportion, not the collection. §11.11 fixes the figures: 398 ×
 * 1030 on screen (1 : 2.59), twenty seats, four shelves at 198 pitch, a 150
 * face — read off the drawing's own polygons: records 12 × 100 × 150 on
 * shelves 350 × 100 × 8, uprights 10 × 100 × 792 at both ends.
 */
describe('the unit’s figures are the drawing’s (§11.11)', () => {
  it('draws at the 150 face, records as deep as the shelf', () => {
    expect(SPINE_HEIGHT).toBe(150);
    expect(DEPTH).toBe(100);
    expect(SHELF_DEPTH).toBe(100);
    expect(SHELF_THICKNESS).toBe(8);
    expect(ROW_PITCH).toBe(198);
  });

  it('seats twenty a shelf at a fixed pitch of 17, width textured within the seat', () => {
    expect(PER_SHELF).toBe(20);
    expect(SEAT_PITCH).toBe(17);
    expect(GAP).toBe(5);
    /* The hash's bounds follow the face (§1's derivation), and never exceed the seat. */
    expect(SPINE_WIDTH_MIN).toBe(Math.round(SPINE_HEIGHT / 14));
    expect(SPINE_WIDTH_MAX).toBe(Math.round(SPINE_HEIGHT / 10));
    expect(SPINE_WIDTH_MAX).toBeLessThanOrEqual(SEAT_PITCH - 2);
    expect(SHELF_LENGTH).toBe(350);
    /* Twenty seats fill 0…340 exactly; the right upright takes the last 10. */
    expect(PER_SHELF * SEAT_PITCH).toBe(SHELF_LENGTH - UPRIGHT.thickness);
  });

  it('is four shelves joined by uprights at their ends — no back, no front, no top', () => {
    expect(SHELVES_PER_UNIT).toBe(4);
    expect(UPRIGHT).toEqual({ thickness: 10, depth: 100, height: SHELVES_PER_UNIT * ROW_PITCH });
    const furniture = unitFurniture(0);
    /* Two uprights and four shelves, three faces each: eighteen polygons, as drawn. */
    expect(furniture).toHaveLength(18);
    for (const face of furniture) expect(face.points).toHaveLength(4);
  });

  it('projects to 398 × 1022 on screen, taller than it is wide at 1 : 2.57', () => {
    /*
      §11.11's prose says 398 × 1030 and 1 : 2.59; its own polygons span
      −789…233, which is 1022 — the 8 is a shelf thickness counted twice.
      Built to the polygons, since the drawing is the figure's source.
    */
    const points = unitFurniture(0).flatMap((face) => face.points);
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeCloseTo(398.4, 0);
    expect(height).toBeCloseTo(1022, 0);
    expect(height / width).toBeCloseTo(2.57, 1);
  });

  it('puts the top shelf’s surface at the unit’s highest shelf, filled top-down', () => {
    /* Shelf tops at z = 594, 396, 198, 0 — the collection fills the top one first. */
    const tops = unitFurniture(0).filter((face) => face.kind === 'shelf-top').map((face) => face.z);
    expect(tops).toEqual([594, 396, 198, 0]);
    expect(project(0, 0, 594)[1]).toBeLessThan(project(0, 0, 0)[1]);
  });
});

describe('the collection fills units left to right, top to bottom; the wall gains units', () => {
  const seats = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, section: 'A' }));

  it('puts seventeen on the top shelf of one unit, three shelves empty and drawn', () => {
    const units = intoUnits(seats(17));
    expect(units).toHaveLength(1);
    expect(units[0].map((row) => row.length)).toEqual([17, 0, 0, 0]);
  });

  it('gains units above one unit’s worth — 200 is 80 + 80 + 40 — and no row lengthens', () => {
    const units = intoUnits(seats(200));
    expect(units.map((unit) => unit.flat().length)).toEqual([80, 80, 40]);
    expect(units[2].map((row) => row.length)).toEqual([20, 20, 0, 0]);
    for (const unit of units) for (const row of unit) expect(row.length).toBeLessThanOrEqual(PER_SHELF);
  });

  it('places units along x at the drawing’s pitch, and knows which unit a seat is in', () => {
    expect(UNIT_PITCH_X).toBe(600);
    expect(unitOf(0)).toBe(0);
    expect(unitOf(79)).toBe(0);
    expect(unitOf(80)).toBe(1);
  });
});
