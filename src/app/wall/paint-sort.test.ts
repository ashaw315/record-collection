import { describe, expect, it } from 'vitest';
import { OUT_MS, gestureFaces, poseAt } from './gesture';
import { NEARER, nearer, paintOrder, seatBounds, type PaintBounds } from './paint-sort';
import { wallLayout } from './wall-layout';

/**
 * §W.20's camera and the probe's sort: **order the drawing's objects — not
 * faces — by separating plane, and fall back to centroid depth only when no
 * plane separates them.** Two disjoint boxes always have a consistent
 * order; for axis-aligned boxes a plane on x, y or z gives it exactly, with
 * the larger side nearer on every axis — the camera is at +(1, 1, 1), the
 * only direction P collapses. Centroid depth is invalid on its own: the
 * pulled record's cover spans a long run in y, so its centroid sits behind
 * neighbours it is in front of.
 *
 * The comparator takes BOUNDS. Passing the objects themselves rendered
 * nothing at all in the probe, so the first frame is the test (see
 * WallLabelled.test.tsx).
 */
const box = (id: string, x0: number, x1: number, y0: number, y1: number, z0 = 0, z1 = 150): PaintBounds => ({ id, x0, x1, y0, y1, z0, z1 });

describe('the camera', () => {
  it('is +(1, 1, 1): larger is nearer on every axis', () => {
    expect(NEARER).toEqual({ x: 1, y: 1, z: 1 });
  });
});

describe('nearer(a, b) — a separating plane decides, and only then the centroid', () => {
  it('orders two seated records by the plane on x between them', () => {
    const left = box('l', 0, 12, 0, 150);
    const right = box('r', 17, 29, 0, 150);
    expect(nearer(right, left)).toBeGreaterThan(0);
    expect(nearer(left, right)).toBeLessThan(0);
  });

  it('puts a record travelled +y past the row in front of every seat, whatever its x — §W.18 with its side inverted', () => {
    const pulled = box('p', 170, 215, 150, 710);
    for (const x of [0, 170, 323]) expect(nearer(pulled, box('s', x, x + 12, 0, 150))).toBeGreaterThan(0);
  });

  it('while its y still overlaps the row, a neighbour at larger x is genuinely nearer and a neighbour at smaller x is behind', () => {
    const pulled = box('p', 170, 182, 60, 210);
    expect(nearer(box('s', 187, 199, 0, 150), pulled)).toBeGreaterThan(0);
    expect(nearer(box('s', 153, 165, 0, 150), pulled)).toBeLessThan(0);
  });

  it('falls back to centroid depth along (1, 1, 1) only when no plane separates', () => {
    const a = box('a', 0, 100, 0, 100, 0, 10);
    const b = box('b', 50, 150, 50, 150, 5, 15);
    expect(nearer(b, a)).toBeGreaterThan(0);
    expect(nearer(a, b)).toBeLessThan(0);
  });

  it('a plane on z: the row above is nearer than the row below only where nothing else separates — and the higher side is nearer', () => {
    const upper = box('u', 0, 12, 0, 150, 198, 348);
    const lower = box('d', 0, 12, 0, 150, 0, 150);
    expect(nearer(upper, lower)).toBeGreaterThan(0);
  });
});

describe('paintOrder — the reference’s insertion, over every object: each shelf, each upright, each record', () => {
  const seat = (id: string, i: number, z: number) => box(id, i * 17, i * 17 + 12, 0, 150, z, z + 150);
  /* A shelf is sorted as the span between the uprights (unit.ts says why). */
  const shelf = (id: string, top: number) => box(id, 0, 340, 0, 150, top - 8, top);
  const upright = (id: string, x0: number) => box(id, x0, x0 + 10, 0, 150, -8, 784);
  const ids = (objects: PaintBounds[]) => paintOrder(objects).map((o) => o.id);

  it('paints a shelf before the records standing on it and the shelf above them after — the plane on z', () => {
    const order = ids([shelf('lower', 396), shelf('upper', 594), seat('a', 0, 396), seat('b', 1, 396)]);
    expect(order.indexOf('lower')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('upper'), 'the shelf above a row is nearer than the row’s tops — it must cover them').toBeGreaterThan(order.indexOf('b'));
  });

  it('paints the left upright before the row and the right upright after it — the plane on x', () => {
    const order = ids([upright('left', -10), upright('right', 340), seat('a', 0, 594), seat('t', 19, 594)]);
    expect(order.indexOf('left')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('right')).toBeGreaterThan(order.indexOf('t'));
  });

  it('keeps each row in seat order, and paints a lower record before the upper one in its column — larger z is nearer', () => {
    /*
      §W.8 asked for document order = seat order to be asserted because it
      would fail exactly here: a record's projected extent is 150 plus a 75px
      top face against a 198 pitch, so a lower record's top overpaints the
      bottom 27px of the record above it unless that one paints later. The
      paint order is right, and the reading order is with Design.
    */
    const upper = [0, 1, 2].map((i) => seat(`u${i}`, i, 594));
    const lower = [0, 1, 2].map((i) => seat(`l${i}`, i, 396));
    const order = ids([...upper, ...lower]);
    expect(order.filter((id) => id.startsWith('u'))).toEqual(['u0', 'u1', 'u2']);
    expect(order.filter((id) => id.startsWith('l'))).toEqual(['l0', 'l1', 'l2']);
    for (const i of [0, 1, 2]) expect(order.indexOf(`l${i}`), `column ${i}`).toBeLessThan(order.indexOf(`u${i}`));
  });

  it('inserts a pulled record after the seats behind it and before the neighbour at larger x, and last once past the row on y', () => {
    const row = [0, 1, 2, 3, 4].map((i) => seat(`s${i}`, i, 594));
    const early = { ...box('p', 34, 46, 60, 210, 594, 744), moving: true };
    const orderEarly = ids([...row.filter((s) => s.id !== 's2'), early]);
    expect(orderEarly.indexOf('p')).toBeGreaterThan(orderEarly.indexOf('s1'));
    expect(orderEarly.indexOf('p')).toBeLessThan(orderEarly.indexOf('s3'));
    const past = { ...box('p', 34, 46, 150, 300, 594, 744), moving: true };
    expect(ids([...row, upright('right', 340), past]).at(-1)).toBe('p');
  });

  it('orders the whole fixture without a cycle: the top shelf before its row, the row before the right upright', () => {
    const objects = [upright('L', -10), shelf('S0', 594), shelf('S1', 396), shelf('S2', 198), shelf('S3', 0), upright('R', 340), ...[0, 7, 19].map((i) => seat(`s${i}`, i, 594))];
    const order = ids(objects);
    expect(order.indexOf('S0')).toBeLessThan(order.indexOf('s0'));
    expect(order.indexOf('s19')).toBeLessThan(order.indexOf('R'));
    expect(order.indexOf('L')).toBeLessThan(order.indexOf('S3'));
  });

  it('never drops or duplicates an object — the first frame renders', () => {
    const objects = [shelf('s', 594), upright('l', -10), upright('r', 340), seat('a', 0, 594), { ...box('p', 17, 29, 0, 150, 594, 744), moving: true }];
    expect([...ids(objects)].sort()).toEqual(objects.map((o) => o.id).sort());
  });
});

/*
  §W.18 and §W.20, read as rulings over the real wall. At d < 150 "a neighbour
  at larger x is genuinely nearer, so it correctly draws in front of the pulled
  record"; at d >= 150 the record "draws in front of the whole row". So what may
  paint after a pulled record is that neighbour, what stands above it, and the
  right upright, then nothing. The row below is never on that list: the defect
  was a full row below moving the record behind its own shelf, clean at 22
  records and wrong at 23, which is why these counts straddle the shelf's end.
  The list is every object, not left neighbours, so a shelf's leftmost seat,
  which has none, is held too: that seat is the one Adam reported.
*/
describe('the pulled record against the wall, §W.18 and §W.20', () => {
  const layoutOf = (count: number) => wallLayout(Array.from({ length: count }, (_, i) => ({ id: `r${i}`, section: 'S' })), [], 1440, 900);
  const paintedAfter = (count: number, seatId: string, ms: number) => {
    const { placed, pieces } = layoutOf(count);
    const seat = placed.find((p) => p.id === seatId);
    if (seat === undefined) throw new Error(`no seat ${seatId}`);
    const bounds = gestureFaces(seat, poseAt(ms)).sortBounds;
    const order = paintOrder<PaintBounds>([
      ...pieces.map((piece) => ({ id: piece.id, ...piece.bounds })),
      ...placed.filter((p) => p.id !== seatId).map(seatBounds),
      { id: seatId, ...bounds, moving: true },
    ]);
    return { seat, placed, pieces, bounds, after: order.slice(order.findIndex((o) => o.id === seatId) + 1), order };
  };

  for (const count of [22, 23, 43, 80]) {
    it(`at ${count} records nothing but a nearer object paints after a pulled record, at every seat, from the press to the landing`, () => {
      const { placed, pieces } = layoutOf(count);
      const pieceOf = new Map(pieces.map((p) => [p.id, p]));
      const seatOf = new Map(placed.map((p) => [p.id, p]));
      const wrong: string[] = [];
      for (const { id } of placed) {
        for (let ms = 0; ms <= OUT_MS; ms += 80) {
          const { seat, bounds, after } = paintedAfter(count, id, ms);
          for (const object of after) {
            const other = seatOf.get(object.id);
            const nearerByRuling =
              bounds.y0 < 150 &&
              (other !== undefined
                ? (other.z === seat.z && other.x > seat.x) || other.z > seat.z
                : object.id === 'upright-right' || (pieceOf.get(object.id)?.bounds.z0 ?? -Infinity) >= seat.z);
            if (!nearerByRuling) wrong.push(`${id} at ${ms}ms: ${object.id}`);
          }
        }
      }
      expect(wrong.length, wrong.slice(0, 6).join('; ')).toBe(0);
    });
  }

  /*
    The comparator is pairwise and the insertion places by the first refusal, so
    a cycle would surface as a pair painted against its own verdict, whichever
    seat it landed on. Fails if a later change makes the order depend on the
    sort's internals, which is what the defect above was.
  */
  for (const count of [43, 80]) {
    it(`at ${count} records no pair is painted against the comparator's own verdict, at any seat or moment`, () => {
      const against: string[] = [];
      for (const { id } of layoutOf(count).placed.filter((_, i) => i % 3 === 0)) {
        for (let ms = 0; ms <= OUT_MS; ms += 200) {
          const { order } = paintedAfter(count, id, ms);
          for (let i = 0; i < order.length; i += 1) {
            for (let j = i + 1; j < order.length; j += 1) {
              if (nearer(order[i], order[j]) > 0) against.push(`${id} at ${ms}ms: ${order[i].id} before ${order[j].id}`);
            }
          }
        }
      }
      expect(against.length, against.slice(0, 6).join('; ')).toBe(0);
    }, 30_000);
  }

  it('the leftmost seat of the top shelf stays in front of its own shelf and the full row below while it leaves', () => {
    const { placed, pieces } = layoutOf(43);
    const top = Math.max(...placed.map((p) => p.z));
    const leftmost = placed.filter((p) => p.z === top).reduce((a, b) => (b.x < a.x ? b : a));
    const shelf = pieces.find((p) => p.kind === 'shelf' && p.bounds.z1 === top);
    expect(shelf, 'the precondition: the shelf it stands on').toBeDefined();
    const below = placed.filter((p) => p.z < top);
    expect(below.some((p) => p.x > leftmost.x), 'the precondition: the row below reaches past the seat').toBe(true);
    for (const ms of [120, 320, 520]) {
      const { after } = paintedAfter(43, leftmost.id, ms);
      const ids = after.map((o) => o.id);
      expect(ids, `${ms}ms`).not.toContain(shelf?.id);
      expect(ids.filter((id) => below.some((p) => p.id === id)), `${ms}ms`).toEqual([]);
    }
  });
});
