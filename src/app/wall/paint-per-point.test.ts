import { describe, expect, it } from 'vitest';
import { DEPTH, SPINE_HEIGHT, frontFace, rightFace, topFace, type PlacedSeat, type Point } from './geometry';
import { OUT_MS, RETURN_MS, gestureFaces, outTime, poseAt, type GestureState } from './gesture';
import { paintOrder, seatBounds, type PaintBounds } from './paint-sort';
import { recordOffset } from './pan';
import { wallLayout } from './wall-layout';

/*
  §W.18 read per point. A point on the record past y = 150 may have nothing
  painted over it; a point behind the plane has exactly what stands in front of
  it painted over it: the shelf above, the row above, a neighbour at larger x
  and the right upright. Points are sampled on the record's three drawn faces,
  each point's physical y comes from the pose here and not from the code under
  test, and what covers it is asked of the real paint order and the real drawn
  faces. No object is excused by name.

  Per point because a whole-record check cannot tell a record hidden correctly
  from one hidden wrongly. 539cd55 counted the board covering the part still
  under it as a failure, and that false count, 2, 23 and 60 of the seats at 22,
  43 and 80, is what the 1 Nov ruling was asked on. Under this test the record as
  one object fails none: what paints after it, the row above and the neighbours
  at larger x, cannot overlap a point past the plane, since such an object at the
  same pixel would have a smaller y. Fails on the old axis order, 1, 21 and 57.

  Across the window the failure was measured in, 80 to 640ms of the pose clock.
*/
const PLANE = DEPTH;
const WINDOW = [80, 160, 240, 320, 400, 480, 560, 640];
const SAMPLES = [0.1, 0.3, 0.5, 0.7, 0.9];

type Poly = readonly Point[];
const inside = (polygon: Poly, [x, y]: Point) => {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const box = (polygons: readonly Poly[]) => {
  const pts = polygons.flat();
  return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
};
const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const bilinear = ([p0, p1, p2, p3]: Poly, u: number, v: number) => lerp(lerp(p0, p1, u), lerp(p3, p2, u), v);

type Sample = { point: Point; y: number; face: string };
/* The quads run as gestureFaces builds them; each point's body coordinates give its physical y, foot-relative. */
const samplesOf = (seat: PlacedSeat, state: GestureState): Sample[] => {
  const pose = poseAt(outTime(state));
  const faces = gestureFaces(seat, pose);
  const [dx] = recordOffset(seat, state);
  const footY = seat.y + DEPTH + pose.travel;
  const physicalY = (a: number, b: number) => footY - a * Math.sin(pose.angle) - b * Math.cos(pose.angle);
  const out: Sample[] = [];
  const add = (face: string, quad: Poly, body: (u: number, v: number) => [number, number]) => {
    for (const u of SAMPLES) {
      for (const v of SAMPLES) {
        const [x, y] = bilinear(quad, u, v);
        const [a, b] = body(u, v);
        out.push({ point: [x + dx, y], y: physicalY(a, b), face });
      }
    }
  };
  add('cover', faces.cover, (u) => [0, DEPTH * (1 - u)]);
  add('spine', faces.spine, (u) => [seat.width * (1 - u), 0]);
  add('top', faces.top, (u, v) => [seat.width * (1 - u) * (1 - v) + 0, DEPTH * (1 - v)]);
  return out;
};

const measure = (count: number, direction: GestureState['direction'], ms: (t: number) => number) => {
  const { placed, pieces } = wallLayout(Array.from({ length: count }, (_, i) => ({ id: `r${i}`, section: 'S' })), [], 1440, 900);
  const shapes = [
    ...placed.map((seat) => {
      const polygons = [frontFace(seat), topFace(seat), rightFace(seat)];
      return { id: seat.id, polygons, ...box(polygons) };
    }),
    ...pieces.map((piece) => {
      const polygons = piece.faces.map((f) => f.points);
      return { id: piece.id, polygons, ...box(polygons) };
    }),
  ];
  const seatOf = new Map(placed.map((p) => [p.id, p]));
  const pieceOf = new Map(pieces.map((p) => [p.id, p]));
  /* The ruled set: what stands in front of a point still inside the row. */
  const overBehind = (id: string, seat: PlacedSeat) => {
    const other = seatOf.get(id);
    if (other !== undefined) return other.z > seat.z || (other.z === seat.z && other.x > seat.x);
    const piece = pieceOf.get(id);
    return id === 'upright-right' || (piece?.kind === 'shelf' && piece.bounds.z0 >= seat.z + SPINE_HEIGHT);
  };
  const failing = new Map<string, string>();
  for (const seat of placed) {
    for (const t of WINDOW) {
      const state: GestureState = { id: seat.id, direction, ms: ms(t) };
      const moving = { id: seat.id, ...gestureFaces(seat, poseAt(outTime(state))).sortBounds, moving: true };
      const order: readonly PaintBounds[] = paintOrder<PaintBounds>([
        ...pieces.map((piece) => ({ id: piece.id, ...piece.bounds })),
        ...placed.filter((p) => p.id !== seat.id).map(seatBounds),
        moving,
      ]);
      const at = new Map(order.map((o, i) => [o.id, i]));
      const own = order.findIndex((o) => o.id === seat.id);
      for (const sample of samplesOf(seat, state)) {
        const [x, y] = sample.point;
        for (const shape of shapes) {
          if (shape.id === seat.id || x < shape.x0 || x > shape.x1 || y < shape.y0 || y > shape.y1) continue;
          if (!shape.polygons.some((polygon) => inside(polygon, sample.point))) continue;
          const after = (at.get(shape.id) ?? -1) > own;
          const emerged = sample.y >= PLANE;
          const wrong = emerged ? after : after !== overBehind(shape.id, seat);
          if (wrong && !failing.has(seat.id)) failing.set(seat.id, `${seat.id} on z${seat.z} at ${t}ms: ${sample.face} ${emerged ? 'in front' : 'behind'} against ${shape.id}`);
        }
      }
    }
  }
  return { failing };
};

describe('§W.18, per point: what is past the plane and what is behind it', () => {
  for (const count of [22, 43, 80]) {
    for (const [direction, ms, journey] of [
      ['out', (t: number) => t, 'leaving'],
      /* The return reads the same times backwards: outTime(back at ms) = t. */
      ['back', (t: number) => (1 - t / OUT_MS) * RETURN_MS, 'going back'],
    ] as const) {
      it(`at ${count} records, at every seat on every shelf, every point of a record ${journey} is painted as ruled`, () => {
        const { failing } = measure(count, direction, ms);
        expect(failing.size, [...failing.values()].slice(0, 4).join('; ')).toBe(0);
      }, 60_000);
    }
  }
});
