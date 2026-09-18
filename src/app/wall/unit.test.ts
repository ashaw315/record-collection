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
  frontFace,
  layoutRow,
  project,
  rightFace,
  topFace,
} from './geometry';
import { PER_SHELF, SHELVES_PER_UNIT, intoUnits, unitFurniture, unitOf, unitPieces } from './unit';

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

  it('emits the faces §11.11’s own polygons emit — every furniture face is among the drawing’s, to 0.1', ({ skip }) => {
    /*
      A point-SET comparison, not an extent: mirroring in y leaves the
      bounding box invariant, so an extent comparison passed with every
      label on the back of every record (§11.15). A shelf's lip at y = 150
      is not among the drawing's polygons; one at y = 0 is.
    */
    if (!existsSync(TARGET)) skip('docs/design is not on this checkout — the drawing cannot be read here');
    const html = readFileSync(TARGET, 'utf8');
    const section = html.slice(html.indexOf('11.11 ·'), html.indexOf('11.12 ·'));
    const svg = /<svg[^>]*>[\s\S]*?<\/svg>/.exec(section)?.[0] ?? '';
    /* A face is its four corners, whichever corner a file starts from. */
    const key = (points: readonly (readonly [number, number])[]) =>
      points
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .sort()
        .join(' ');
    const drawn = new Set(
      [...svg.matchAll(/<polygon[^>]*points="([^"]+)"/g)].map((m) =>
        key(m[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number) as [number, number])),
      ),
    );
    expect(drawn.size, 'the far view at 17: 18 furniture faces and 51 record faces').toBe(18 + 17 * 3);
    /* §11.20 withdrew the drawing's side: its strips are −y faces. Tops and +x ends do not depend on the sign and must match. */
    for (const face of unitFurniture(0).filter((f) => !f.kind.endsWith('front'))) {
      expect(drawn.has(key(face.points)), `${face.kind} ${key(face.points)}`).toBe(true);
    }
  });

  it('seats records exactly as §11.11’s polygons do — every face of a 12-wide record at seats 0…16 is among the drawing’s', ({ skip }) => {
    /*
      The check for a seat built from two conventions: if the spine moved to
      the −y face and anything else still assumed the old one, some face of
      some record would be a polygon the drawing does not contain. Widths are
      forced to the drawing's 12 (ours hash 11…15); everything else is the
      build's own placement.
    */
    if (!existsSync(TARGET)) skip('docs/design is not on this checkout — the drawing cannot be read here');
    const html = readFileSync(TARGET, 'utf8');
    const section = html.slice(html.indexOf('11.11 ·'), html.indexOf('11.12 ·'));
    const svg = /<svg[^>]*>[\s\S]*?<\/svg>/.exec(section)?.[0] ?? '';
    const key = (points: readonly (readonly [number, number])[]) =>
      points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).sort().join(' ');
    const drawn = new Set(
      [...svg.matchAll(/<polygon[^>]*points="([^"]+)"/g)].map((m) =>
        key(m[1].trim().split(/\s+/).map((pair) => pair.split(',').map(Number) as [number, number])),
      ),
    );
    const seats = Array.from({ length: 17 }, (_, i) => ({ id: `d${i}`, section: 'S' }));
    for (const placed of layoutRow(seats, 0)) {
      const record = { ...placed, width: 12 };
      for (const [name, face] of [['top', topFace(record)], ['right', rightFace(record)]] as const) {
        expect(drawn.has(key(face)), `seat ${placed.id} ${name} ${key(face)}`).toBe(true);
      }
      /* The spine is the +y face (§11.20); the drawing's is at y = 0 and is superseded. */
      expect(drawn.has(key(frontFace(record))), `seat ${placed.id} front — not the drawing's back face`).toBe(false);
    }
  });

  it('draws the shelves’ and uprights’ strips on their +y faces — toward the camera (§11.20)', () => {
    const lip = unitFurniture(0).find((face) => face.kind === 'shelf-front');
    expect(lip?.points[0]).toEqual(project(-UPRIGHT.thickness, SHELF_DEPTH, 594 - SHELF_THICKNESS));
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

describe('the unit as objects for the painter (§11.20)', () => {
  it('is six pieces — two uprights and four shelves — each with its bounds and its three faces', () => {
    const pieces = unitPieces(0);
    expect(pieces).toHaveLength(6);
    expect(pieces.filter((p) => p.kind === 'shelf')).toHaveLength(4);
    expect(pieces.filter((p) => p.kind === 'upright')).toHaveLength(2);
    for (const piece of pieces) expect(piece.faces).toHaveLength(3);
    expect(pieces.flatMap((p) => p.faces)).toEqual(unitFurniture(0));
    const top = pieces.find((p) => p.kind === 'shelf' && p.row === 0);
    /* Sorted as the span between the uprights (its drawn faces run upright to upright): interpenetrating boxes have no separating plane. */
    expect(top?.bounds).toEqual({ x0: 0, x1: SHELF_LENGTH - UPRIGHT.thickness, y0: 0, y1: SHELF_DEPTH, z0: 594 - SHELF_THICKNESS, z1: 594 });
    expect(top?.faces[0].points[0]).toEqual(project(-UPRIGHT.thickness, 0, 594));
    const right = pieces.find((p) => p.kind === 'upright' && p.bounds.x0 > 0);
    expect(right?.bounds).toEqual({ x0: SHELF_LENGTH - UPRIGHT.thickness, x1: SHELF_LENGTH, y0: 0, y1: UPRIGHT.depth, z0: -SHELF_THICKNESS, z1: UPRIGHT.height - SHELF_THICKNESS });
  });

  it('offsets a unit’s pieces along x by the unit pitch', () => {
    const first = unitPieces(1).find((p) => p.kind === 'shelf' && p.row === 0);
    expect(first?.bounds.x0).toBe(UNIT_PITCH_X);
  });
});
