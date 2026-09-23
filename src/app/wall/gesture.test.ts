import { describe, expect, it } from 'vitest';
import { COS30, DEPTH, SPINE_HEIGHT, coverTransform, frontFace, labelTransform, project, rightFace, spineWidth, topFace, type PlacedSeat } from './geometry';
import { LANDED_SIZE, parseMatrix } from './landing';
import { OPEN_ANGLE, WIDEST, footprint, footprintsCollide } from './rotation';
import {
  FINISH_MS,
  GROWTH,
  GROWTH_END,
  GROWTH_START,
  OUT_MS,
  RETURN_MS,
  ROTATION_START,
  SWING_MS,
  TRAVEL,
  easeInOutCubic,
  gestureFaces,
  outTime,
  poseAt,
  settled,
  type GestureState,
} from './gesture';

/**
 * §W.19 / §W.21: the assembled gesture on one clock. Out is 1600ms — the
 * probe's 1300 for travel, growth and rotation, with a 300ms finish added
 * after it rather than carved out — and the return is the whole gesture
 * reversed at 860ms (700 × 1600 / 1300). Travel is 290 · easeInOutCubic(k)
 * over the 1300; rotation is 45° on its own ease over the last 58%, joining
 * at k = 0.42 with the record 85.9 out; and growth (150 → 560, §W.19) rides
 * the ROTATION's window, not the travel's (§W.25): an orthographic
 * projection has no size change on approach, so growth is the record
 * leaving the projection, which is what the rotation is. Growth and
 * rotation share one fixed point — the foot of the cover's near vertical
 * edge (§W.21) — and the finish's two terms come after 45°.
 */
const seat: PlacedSeat = { id: 'p', x: 170, y: 0, z: 594, width: spineWidth('p') };
const width = (poly: readonly (readonly [number, number])[]) => Math.max(...poly.map(([x]) => x)) - Math.min(...poly.map(([x]) => x));
const height = (poly: readonly (readonly [number, number])[]) => Math.max(...poly.map(([, y]) => y)) - Math.min(...poly.map(([, y]) => y));

describe('the clock', () => {
  it('is 1300 out plus a 300 finish — 1600 — and 860 back, the return being the out reversed', () => {
    expect(SWING_MS).toBe(1300);
    expect(FINISH_MS).toBe(300);
    expect(OUT_MS).toBe(1600);
    expect(RETURN_MS).toBeCloseTo((700 * 1600) / 1300, 9);
    expect(outTime({ id: 'p', direction: 'out', ms: 400 })).toBe(400);
    expect(outTime({ id: 'p', direction: 'out', ms: 9999 })).toBe(OUT_MS);
    expect(outTime({ id: 'p', direction: 'back', ms: 0 })).toBe(OUT_MS);
    expect(outTime({ id: 'p', direction: 'back', ms: RETURN_MS / 2 })).toBeCloseTo(OUT_MS / 2, 9);
    expect(outTime({ id: 'p', direction: 'back', ms: RETURN_MS })).toBe(0);
    expect(settled({ id: 'p', direction: 'out', ms: OUT_MS })).toBe(true);
    expect(settled({ id: 'p', direction: 'out', ms: OUT_MS - 1 })).toBe(false);
    expect(settled({ id: 'p', direction: 'back', ms: RETURN_MS })).toBe(true);
  });

  it('poses: travel on the swing, growth and rotation on the rotation’s window, the finish after it', () => {
    expect(TRAVEL).toBe(290);
    /* §W.19's landed square is 560 on a 150 seat: 3.73×. */
    expect(LANDED_SIZE).toBe(560);
    expect(GROWTH).toBeCloseTo(560 / 150, 12);
    expect(poseAt(0)).toEqual({ k: 0, travel: 0, scale: 1, angle: 0, finish: 0 });
    const join = poseAt(ROTATION_START * SWING_MS);
    expect(join.travel).toBeCloseTo(85.9, 1);
    expect(join.angle).toBe(0);
    expect(join.scale).toBe(1);
    expect(poseAt(ROTATION_START * SWING_MS + 1).angle).toBeGreaterThan(0);
    expect(poseAt(ROTATION_START * SWING_MS + 1).scale).toBeGreaterThan(1);
    const end = poseAt(SWING_MS);
    expect(end).toEqual({ k: 1, travel: TRAVEL, scale: GROWTH, angle: OPEN_ANGLE, finish: 0 });
    expect(poseAt(SWING_MS + FINISH_MS / 2).finish).toBe(0.5);
    expect(poseAt(OUT_MS)).toEqual({ ...end, finish: 1 });
  });

  it('growth rides the rotation’s window, not the travel’s (§W.25): size does not change through the first third', () => {
    /*
      The window is a motion parameter, adjustable like the finish's 300ms
      (§W.25: no still can judge it — the endpoints agree under every
      distribution). Its default is the rotation's own window, so the two
      transforms with one cause arrive together.
    */
    expect(GROWTH_START).toBe(ROTATION_START);
    expect(GROWTH_END).toBe(1);
    for (const k of [0.1, 0.25, 0.42]) {
      const pose = poseAt(k * SWING_MS);
      expect(pose.travel, `k=${k}`).toBeGreaterThan(0);
      expect(pose.scale, `k=${k}`).toBe(1);
    }
    /* On the window, growth's progress IS the rotation's progress: one ease, one cause. */
    for (const k of [0.5, 0.6, 0.7, 0.85, 1]) {
      const pose = poseAt(k * SWING_MS);
      const progress = easeInOutCubic((k - GROWTH_START) / (GROWTH_END - GROWTH_START));
      expect(pose.scale, `k=${k}`).toBeCloseTo(1 + (GROWTH - 1) * progress, 12);
      expect(pose.angle / OPEN_ANGLE, `k=${k}`).toBeCloseTo(progress, 12);
    }
    /*
      The tell §W.25 records: growth on the travel's curve gave a size change
      that was 1.41 of the position change at EVERY instant — a constant ratio
      is two quantities sharing a curve when only one belongs on it. Here the
      ratio is not constant: zero while the record only travels, then rising.
    */
    const ratio = (k: number) => (poseAt(k * SWING_MS).scale - 1) * DEPTH / poseAt(k * SWING_MS).travel;
    expect(ratio(0.3)).toBe(0);
    expect(ratio(0.7)).toBeGreaterThan(0);
    expect(ratio(1)).toBeGreaterThan(ratio(0.7));
  });
});

describe('the drawn record: three faces, the cover’s plane and the label’s, from one construction', () => {
  it('is the seated record at 0 — faces, cover matrix and label matrix identical to the seat’s own', () => {
    const faces = gestureFaces(seat, poseAt(0));
    expect(faces.top).toEqual(topFace(seat));
    expect(faces.cover).toEqual(rightFace(seat));
    expect(faces.spine).toEqual(frontFace(seat));
    const m = parseMatrix(faces.coverMatrix);
    const c = parseMatrix(coverTransform(seat));
    m.forEach((v, i) => expect(v, `cover entry ${i}`).toBeCloseTo(c[i], 9));
    const l = parseMatrix(faces.labelMatrix);
    const l0 = parseMatrix(labelTransform(seat));
    l.forEach((v, i) => expect(v, `label entry ${i}`).toBeCloseTo(l0[i], 9));
  });

  it('keeps the foot of the pivot edge fixed under growth and rotation — three transforms, one point (§W.21)', () => {
    /*
      The tell for an origin: both endpoints are given by the drawings and
      every candidate origin agrees at both; they differ only between. So
      the check is at every instant — with the travel taken out, the foot's
      projected position never moves.
    */
    for (const t of [0, 300, 546, 700, 900, 1100, 1300]) {
      const pose = poseAt(t);
      const foot = project(seat.x + seat.width, seat.y + DEPTH + pose.travel, seat.z);
      const faces = gestureFaces(seat, pose);
      /* The cover's near-bottom corner IS the foot. */
      expect(faces.cover[1][0], `t=${t}`).toBeCloseTo(foot[0], 9);
      expect(faces.cover[1][1], `t=${t}`).toBeCloseTo(foot[1], 9);
      expect(faces.spine[1][0]).toBeCloseTo(foot[0], 9);
    }
  });

  it('is a rigid rotation re-projected: the spine closes to exactly zero at 45°, the cover widens to √2·cos30 of its run — at every scale', () => {
    const start = gestureFaces(seat, poseAt(ROTATION_START * SWING_MS));
    expect(width(start.spine)).toBeCloseTo(seat.width * COS30 * start.scale, 9);
    const end = gestureFaces(seat, poseAt(SWING_MS));
    expect(width(end.spine)).toBeCloseTo(0, 9);
    expect(width(end.cover)).toBeCloseTo(DEPTH * GROWTH * WIDEST, 6);
    expect(height(end.cover)).toBeCloseTo(SPINE_HEIGHT * GROWTH, 9);
    /* Level at 45°: an axis-aligned rectangle. */
    expect(end.cover[2][1]).toBeCloseTo(end.cover[3][1], 9);
    /* The three faces change together: the top's width is the solid's, not a separate drawing. */
    expect(width(end.top)).toBeCloseTo(width(end.cover), 6);
  });

  it('the cover advances throughout: every corner of the cover face moves toward the camera as it turns', () => {
    const depth = ([x, y]: readonly [number, number]) => x + y;
    const before = gestureFaces(seat, { ...poseAt(SWING_MS), angle: 0 });
    const after = gestureFaces(seat, poseAt(SWING_MS));
    for (const i of [0, 1, 2, 3]) expect(depth(after.coverWall[i]) + 1e-9, `corner ${i}`).toBeGreaterThanOrEqual(depth(before.coverWall[i]));
  });

  it('finishes with the projection undone: 0.8165 across and the sliver to zero, arriving at a square of the record’s own size, un-mirrored', () => {
    const mid = gestureFaces(seat, poseAt(SWING_MS + FINISH_MS / 2));
    expect(width(mid.cover)).toBeCloseTo(DEPTH * GROWTH * (WIDEST + 1) / 2, 6);
    const done = gestureFaces(seat, poseAt(OUT_MS));
    expect(width(done.cover)).toBeCloseTo(DEPTH * GROWTH, 6);
    expect(height(done.cover)).toBeCloseTo(SPINE_HEIGHT * GROWTH, 6);
    expect(width(done.spine)).toBeCloseTo(0, 9);
    /* No thickness: the top face has collapsed onto the cover's top edge. */
    expect(height(done.top)).toBeCloseTo(0, 9);
    const [a, b, c, d] = parseMatrix(done.coverMatrix);
    expect(b).toBeCloseTo(0, 9);
    expect(c).toBeCloseTo(0, 9);
    expect(a * DEPTH).toBeCloseTo(DEPTH * GROWTH, 6);
    expect(d * SPINE_HEIGHT).toBeCloseTo(SPINE_HEIGHT * GROWTH, 6);
    for (const t of [0, 546, 900, 1300, 1450, 1600]) {
      const [ma, mb, mc, md] = parseMatrix(gestureFaces(seat, poseAt(t)).coverMatrix);
      expect(ma * md - mb * mc, `determinant at ${t}`).toBeGreaterThan(0);
    }
  });

  it('carries its bounds for the sort: the seat’s at 0, and the PHYSICAL box after — unscaled, growth being the screen’s cue (§W.21)', () => {
    expect(gestureFaces(seat, poseAt(0)).sortBounds).toEqual({ x0: seat.x, x1: seat.x + seat.width, y0: 0, y1: DEPTH, z0: seat.z, z1: seat.z + SPINE_HEIGHT });
    /*
      The grown solid reaches back INTO the row on y (a 560 run at a partial
      angle), and a sort on the grown box loses its y-plane and falls to the
      centroid, where a long row's far records come out nearer than the
      record in front of them — the row painted over the cover. The box the
      sort sees is the one the clearance is asserted on: travelled and
      rotated at the record's own size.
    */
    for (const t of [900, SWING_MS]) {
      const { sortBounds: bounds } = gestureFaces(seat, poseAt(t));
      const physical = gestureFaces(seat, { ...poseAt(t), scale: 1 }).sortBounds;
      expect(bounds, `t=${t}`).toEqual(physical);
      expect(bounds.z1, `t=${t}`).toBe(seat.z + SPINE_HEIGHT);
    }
    expect(gestureFaces(seat, poseAt(SWING_MS)).sortBounds.y0, 'past the row entirely at 45°').toBeGreaterThan(DEPTH);
    expect(gestureFaces(seat, poseAt(SWING_MS)).sortBounds.y1).toBeGreaterThanOrEqual(DEPTH + TRAVEL);
  });
});

describe('the joint state over the whole path', () => {
  const neighbours = Array.from({ length: 20 }, (_, i) => i)
    .filter((i) => i !== 10)
    .map((i) => ({ x0: i * 17, x1: i * 17 + spineWidth(`s${i}`), y0: 0, y1: DEPTH }));
  const box = { ...seat, x: 170, width: 12, depth: DEPTH, height: SPINE_HEIGHT };

  it('the physical box — travelled and rotated, growth being the screen’s cue — clears every neighbour at every frame', () => {
    for (let frame = 0; frame <= 78; frame += 1) {
      const pose = poseAt((frame / 78) * SWING_MS);
      const plan = footprint({ ...box, y: box.y + pose.travel }, pose.angle);
      for (const n of neighbours) expect(footprintsCollide(plan, n), `frame ${frame}`).toBe(false);
    }
  });
});

describe('the return', () => {
  it('is the out reversed on one clock: the same pose at the mirrored time', () => {
    const back: GestureState = { id: 'p', direction: 'back', ms: RETURN_MS * 0.25 };
    expect(poseAt(outTime(back))).toEqual(poseAt(OUT_MS * 0.75));
  });
});
