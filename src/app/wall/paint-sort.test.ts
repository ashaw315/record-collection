import { describe, expect, it } from 'vitest';
import { NEARER, nearer, paintSort, type PaintBounds } from './paint-sort';

/**
 * §11.20's camera and the probe's sort: **order the drawing's objects — not
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

  it('puts a record travelled +y past the row in front of every seat, whatever its x — §11.18 with its side inverted', () => {
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

describe('paintSort — the seated row by x alone, the moving records joining by their own bounds', () => {
  const row = Array.from({ length: 5 }, (_, i) => box(`s${i}`, i * 17, i * 17 + 12, 0, 150));

  it('is the seat order for a seated row, rows top to bottom first', () => {
    const upper = row.map((s) => ({ ...s, id: `u${s.id}`, z0: 198, z1: 348, row: 0 }));
    const ids = paintSort([...row.map((s) => ({ ...s, row: 1 })), ...upper].reverse()).map((b) => b.id);
    expect(ids).toEqual([...upper.map((b) => b.id), ...row.map((b) => b.id)]);
  });

  it('inserts a pulled record after the seats behind it and before the seats nearer than it', () => {
    /* Pulled from seat 2, only 60 out and 1.8× deep: seats 0–1 are behind (x-plane), seats 3–4 nearer (x-plane), its own seat by centroid. */
    const pulled = { ...box('p', 34, 50, 60, 330), row: 0, moving: true };
    const seats = row.map((s) => ({ ...s, row: 0 }));
    const ids = paintSort([...seats, pulled]).map((b) => b.id);
    /* s2 is the seat it left, kept here only to show the centroid fallback: no plane separates them and p's centroid is nearer. */
    expect(ids).toEqual(['s0', 's1', 's2', 'p', 's3', 's4']);
  });

  it('paints it last once it is past the row on y', () => {
    const pulled = { ...box('p', 34, 80, 150, 710), row: 0, moving: true };
    expect(paintSort([...row.map((s) => ({ ...s, row: 0 })), pulled]).map((b) => b.id).at(-1)).toBe('p');
  });

  it('never drops or duplicates an object — the first frame renders', () => {
    const pulled = { ...box('p', 34, 46, 0, 150), row: 0, moving: true };
    const ids = paintSort([...row.map((s) => ({ ...s, row: 0 })), pulled]).map((b) => b.id);
    expect([...ids].sort()).toEqual([...row.map((b) => b.id), 'p'].sort());
  });
});
