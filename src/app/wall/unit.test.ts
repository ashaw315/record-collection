import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const TARGET = resolve(process.cwd(), 'docs/design/Record Detail 8a - build target.dc.html');

/**
 * §11.10: the wall is a fixed unit of four shelves joined at their ends, and
 * the collection fills it left to right, top to bottom. Row length comes from
 * the unit's proportion, not the collection. §11.11 fixes the figures: 442 ×
 * 1047 on screen (1 : 2.37), twenty seats, four shelves at 198 pitch, a 150
 * face — read off the drawing's own polygons: records 12 × 150 × 150 (a 12″
 * sleeve is square) on shelves 360 × 150 × 8, uprights 10 × 150 × 792 at
 * both ends.
 */
describe('the unit’s figures are the drawing’s (§11.11)', () => {
  it('draws at the 150 face, the sleeve square, records as deep as the shelf', () => {
    expect(SPINE_HEIGHT).toBe(150);
    expect(DEPTH).toBe(SPINE_HEIGHT);
    expect(SHELF_DEPTH).toBe(DEPTH);
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
    expect(UPRIGHT).toEqual({ thickness: 10, depth: SHELF_DEPTH, height: SHELVES_PER_UNIT * ROW_PITCH });
    const furniture = unitFurniture(0);
    /* Two uprights and four shelves, three faces each: eighteen polygons, as drawn. */
    expect(furniture).toHaveLength(18);
    for (const face of furniture) expect(face.points).toHaveLength(4);
  });

  /**
   * **The measurement comes from the same list the polygons come from.**
   * §11.11's figure was wrong twice in opposite directions (1030, then 1055)
   * because it was computed by re-declaring the bounds instead of reading
   * the boxes the drawing emits; the frame-extent defect had the same shape
   * one level up. So the extent here is the min–max over every point of
   * every face `unitFurniture` emits — never two corners, never a hand sum.
   */
  const extent = (points: readonly (readonly [number, number])[]) => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };

  it('projects to 441.7 × 1047 on screen, taller than it is wide at 1 : 2.37 — the extent over every emitted point', () => {
    const e = extent(unitFurniture(0).flatMap((face) => face.points));
    expect(e.maxX - e.minX).toBeCloseTo(441.7, 1);
    expect(e.maxY - e.minY).toBeCloseTo(1047, 1);
    expect((e.maxY - e.minY) / (e.maxX - e.minX)).toBeCloseTo(2.37, 2);
  });

  it('spans exactly what §11.11’s own polygons span, when the target is on this checkout', ({ skip }) => {
    if (!existsSync(TARGET)) skip('docs/design is not on this checkout — the drawing cannot be read here');
    const html = readFileSync(TARGET, 'utf8');
    const section = html.slice(html.indexOf('11.11 ·'), html.indexOf('11.12 ·'));
    const svg = /<svg[^>]*>[\s\S]*?<\/svg>/.exec(section)?.[0] ?? '';
    const drawn = [...svg.matchAll(/<polygon[^>]*points="([^"]+)"/g)].flatMap((m) =>
      m[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number) as [number, number]),
    );
    expect(drawn.length, 'the far view at 17: 18 furniture faces and 51 record faces, four corners each').toBe((18 + 17 * 3) * 4);
    const theirs = extent(drawn);
    const ours = extent(unitFurniture(0).flatMap((face) => face.points));
    for (const k of ['minX', 'maxX', 'minY', 'maxY'] as const) expect(ours[k], k).toBeCloseTo(theirs[k], 1);
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
