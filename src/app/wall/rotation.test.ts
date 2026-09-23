import { describe, expect, it } from 'vitest';
import { COS30, DEPTH, SPINE_HEIGHT, frontFace, project, rightFace, spineWidth, topFace, type RecordBox } from './geometry';
import {
  FINISH_COMPRESSION,
  OPEN_ANGLE,
  WIDEST,
  finishBasis,
  footprint,
  footprintsCollide,
  rotatedBounds,
  rotatedCorners,
  rotatedFaces,
} from './rotation';

/**
 * §W.16 / §W.17 / §W.20: the turn is a rigid rotation in three dimensions,
 * re-projected every frame — never interpolated corners — about the cover's
 * near vertical edge at y + depth, in the direction that opens the face. Rigid
 * to 45°, where the cover projects to its widest, 1.2247 : 1; then a
 * two-term finish — 0.8165 horizontal compression and the 8.49-unit
 * thickness sliver collapsing to zero — both terms being the projection
 * removed. The signature is the spine closing 10.39 → 0 at the same 45°.
 *
 * Every figure below is §W.17's, reproduced from the rotation rather than
 * typed in as a constant the rotation is then asserted to equal.
 */
const box: RecordBox = { id: 'r', x: 170, y: 0, z: 594, width: 12, depth: DEPTH, height: SPINE_HEIGHT };
const axisX = box.x + box.width;
const width = (poly: readonly (readonly [number, number])[]) => Math.max(...poly.map(([x]) => x)) - Math.min(...poly.map(([x]) => x));
const height = (poly: readonly (readonly [number, number])[]) => Math.max(...poly.map(([, y]) => y)) - Math.min(...poly.map(([, y]) => y));

describe('at rest the rotation is the seated record', () => {
  it('projects the same three faces the seat draws, at angle 0', () => {
    const faces = rotatedFaces(box, 0);
    expect(faces.top).toEqual(topFace(box));
    expect(faces.cover).toEqual(rightFace(box));
    expect(faces.spine).toEqual(frontFace(box));
    expect(rotatedBounds(box, 0)).toEqual({ x0: box.x, x1: axisX, y0: 0, y1: DEPTH, z0: box.z, z1: box.z + SPINE_HEIGHT });
  });
});

describe('the axis and the direction (§W.16, §W.17)', () => {
  it('pivots about the cover’s near vertical edge at y + depth, which does not move, and turns the cover normal from +x toward +y', () => {
    const corners = rotatedCorners(box, OPEN_ANGLE);
    const axisY = box.y + box.depth;
    const onAxis = corners.filter(([x, y]) => Math.abs(x - axisX) < 1e-9 && Math.abs(y - axisY) < 1e-9);
    expect(onAxis, 'the two axis corners — the near edge, at y + depth — stay put').toHaveLength(2);
    /* The cover's far corner (the y = 0 end) swings to +x: (sin45, −cos45) · 150 from the axis — toward the camera, every point advancing. */
    const far = corners.find(([x, y, z]) => z === box.z && Math.abs(x - (axisX + Math.SQRT1_2 * DEPTH)) < 1e-6 && Math.abs(y - (axisY - Math.SQRT1_2 * DEPTH)) < 1e-6);
    expect(far).toBeDefined();
    /* §W.20 reinstates the pivot's ground: (0.707, 0.707, 0)·(1, 1, 1) = 1.414 > 1 — the cover turns toward the reader, every point advancing. */
    const depthOf = ([x, y, z]: readonly [number, number, number]) => x + y + z;
    const before = rotatedCorners(box, 0);
    /* The cover's corners are those on the axis plane dx = 0: indices 4…7 of the enumeration. */
    for (const i of [4, 5, 6, 7]) expect(depthOf(corners[i]), `cover corner ${i}`).toBeGreaterThanOrEqual(depthOf(before[i]) - 1e-9);
    /* The pivot itself is the nearest point and stays; the cover's far corners advance strictly. */
    for (const i of [4, 5]) expect(depthOf(corners[i]) - depthOf(before[i]), `far corner ${i}`).toBeGreaterThan(0);
  });

  it('at 45° the cover is its widest — 183.7 against a constant 150, which is √2·cos30 — and the spine has closed to zero', () => {
    const faces = rotatedFaces(box, OPEN_ANGLE);
    expect(WIDEST).toBeCloseTo(Math.SQRT2 * COS30, 12);
    expect(width(faces.cover)).toBeCloseTo(DEPTH * WIDEST, 6);
    expect(width(faces.cover)).toBeCloseTo(183.71, 1);
    expect(height(faces.cover)).toBeCloseTo(SPINE_HEIGHT, 9);
    /* The cover is an axis-aligned rectangle here: its top edge is level. */
    expect(faces.cover[2][1]).toBeCloseTo(faces.cover[3][1], 9);
    expect(width(faces.spine), 'the spine, 10.39 at rest, edge-on at 45°').toBeCloseTo(0, 9);
    expect(width(rotatedFaces(box, 0).spine)).toBeCloseTo(box.width * COS30, 9);
  });

  it('at 45° the thickness projects to an 8.49 sliver: the solid is 183.7 × 158.49, not 183.7 × 150', () => {
    const corners = rotatedCorners(box, OPEN_ANGLE).map(([x, y, z]) => project(x, y, z));
    expect(width(corners)).toBeCloseTo(183.71, 1);
    expect(height(corners)).toBeCloseTo(SPINE_HEIGHT + box.width * Math.SQRT1_2, 6);
    expect(height(corners)).toBeCloseTo(158.49, 1);
  });

  it('opens rather than closes: the cover’s projected width grows monotonically from 129.9 to 183.7', () => {
    let last = 0;
    for (const step of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      const w = width(rotatedFaces(box, OPEN_ANGLE * step).cover);
      expect(w).toBeGreaterThanOrEqual(last - 1e-9);
      last = w;
    }
    expect(width(rotatedFaces(box, 0).cover)).toBeCloseTo(DEPTH * COS30, 9);
  });
});

describe('the finish (§W.17): the projection undone on the 45° rectangle', () => {
  it('compresses horizontally by 0.8165 and collapses the sliver to zero, both reaching the square together', () => {
    expect(FINISH_COMPRESSION).toBeCloseTo(1 / (Math.SQRT2 * COS30), 12);
    const start = finishBasis(0);
    /* The rotated basis at 45°, from the pivot: x̂ (thickness, toward −x) → [0, 8.49/12], ŷ (the run, toward the far end) → [1.2247, 0], ẑ → [0, −1]. */
    expect(start.x[0]).toBeCloseTo(0, 12);
    expect(start.x[1]).toBeCloseTo(Math.SQRT1_2, 12);
    expect(start.y[0]).toBeCloseTo(WIDEST, 12);
    expect(start.y[1]).toBeCloseTo(0, 12);
    expect(start.z).toEqual([0, -1]);
    const end = finishBasis(1);
    expect(end.x).toEqual([0, 0]);
    expect(end.y[0]).toBeCloseTo(1, 12);
    expect(end.y[1]).toBe(0);
    /* Half-way, half of each term. */
    const mid = finishBasis(0.5);
    expect(mid.x[1]).toBeCloseTo(Math.SQRT1_2 / 2, 12);
    expect(mid.y[0]).toBeCloseTo((WIDEST + 1) / 2, 12);
  });
});

describe('the clearance is angle-dependent: assert the joint state, not the travel (§W.19)', () => {
  /* The row: seats at pitch 17, each 12 × 150 in plan, with the pulled seat left empty. */
  const seat = 10;
  const neighbours = Array.from({ length: 20 }, (_, i) => i)
    .filter((i) => i !== seat)
    .map((i) => ({ x0: i * 17, x1: i * 17 + spineWidth(`s${i}`), y0: 0, y1: DEPTH }));
  const pulled: RecordBox = { ...box, x: seat * 17, width: 12 };

  it('the measured path clears the row at every sampled instant — 86 at 0°, 149 at 0.6°, 223 at 15°, 290 at 45°', () => {
    for (const [travel, degrees] of [[86, 0], [149, 0.6], [223, 15], [290, 45]] as const) {
      const plan = footprint({ ...pulled, y: pulled.y + travel }, (degrees * Math.PI) / 180);
      for (const n of neighbours) expect(footprintsCollide(plan, n), `${travel} units at ${degrees}°`).toBe(false);
    }
  });

  it('the sequential path also passes, and a turn in the seat does not: 45° at zero travel sweeps into the neighbours', () => {
    const cleared = footprint({ ...pulled, y: pulled.y + 151 }, OPEN_ANGLE);
    for (const n of neighbours) expect(footprintsCollide(cleared, n)).toBe(false);
    const inSeat = footprint(pulled, OPEN_ANGLE);
    expect(neighbours.some((n) => footprintsCollide(inSeat, n)), 'a turn in the seat hits a neighbour').toBe(true);
    /* And the sweep's full radius, at 45° from the near-edge axis: √(12² + 150²) = 150.5. */
    const reach = Math.max(...footprint(pulled, OPEN_ANGLE).map(([x, y]) => Math.hypot(x - (pulled.x + pulled.width), y - (pulled.y + pulled.depth))));
    expect(reach).toBeCloseTo(Math.hypot(12, DEPTH), 6);
  });

  it('a travel-only test would pass the sequential path and fail the ruled one; the joint state passes both', () => {
    /* 86 units out at 0°: under 151, and legal — nothing has turned yet. */
    const plan = footprint({ ...pulled, y: pulled.y + 86 }, 0);
    expect(neighbours.some((n) => footprintsCollide(plan, n))).toBe(false);
    expect(86).toBeLessThan(151);
  });
});
