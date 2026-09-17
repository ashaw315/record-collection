import { describe, expect, it } from 'vitest';
import { COS30, DEPTH, SIN30, SPINE_HEIGHT, project, type PlacedSeat } from './geometry';
import { LANDING_PAD, landingMatrix, landingSquare, parseMatrix } from './landing';
import { coverTransform } from './geometry';
import { pullEase } from './pull-curve';

/**
 * §11.9: the pulled record takes the drawing's whole region — the largest
 * square it holds, unsheared. The right face IS the cover, so the face
 * already toward the reader straightens and grows: §11.2's one curve drives
 * translation, scale and shear together, and the shear resolving to zero is
 * not rotation. At rest the shear is EXACTLY zero — a value that rounds to
 * near-zero looks identical and is not the same claim.
 */
const seat: PlacedSeat = { id: 'r', x: 100, y: 16, z: 0, width: 20 };
const view = { x: 0, y: 0, width: 960, height: 760 };

describe('landingSquare', () => {
  it('is the largest square the region holds, inset by the page’s padding, centred', () => {
    const square = landingSquare(view);
    expect(square.size).toBe(Math.min(960, 760) - 2 * LANDING_PAD);
    expect(square.x).toBe((960 - square.size) / 2);
    expect(square.y).toBe((760 - square.size) / 2);
  });

  it('follows the visible region when it is scrolled', () => {
    const square = landingSquare({ x: 300, y: 50, width: 960, height: 760 });
    expect(square.x).toBe(300 + (960 - square.size) / 2);
    expect(square.y).toBe(50 + (760 - square.size) / 2);
  });
});

describe('landingMatrix — the right face straightening and growing on one curve', () => {
  const square = landingSquare(view);

  it('is the face’s own matrix at 0: the cover starts where it is', () => {
    expect(landingMatrix(seat, square, 0)).toBe(coverTransform(seat));
  });

  it('is exactly axis-aligned at 1 — zero shear, not near-zero', () => {
    const [a, b, c, d, e, f] = parseMatrix(landingMatrix(seat, square, 1));
    expect(b).toBe(0);
    expect(c).toBe(0);
    expect(a).toBe(square.size / DEPTH);
    expect(d).toBe(square.size / SPINE_HEIGHT);
    expect(e).toBe(square.x);
    expect(f).toBe(square.y);
  });

  it('moves every entry on the same eased value — translation, scale and shear together', () => {
    const t = 0.5;
    const eased = pullEase(t);
    const from = parseMatrix(coverTransform(seat));
    const to = [square.size / DEPTH, 0, 0, square.size / SPINE_HEIGHT, square.x, square.y];
    const at = parseMatrix(landingMatrix(seat, square, t));
    at.forEach((value, index) => {
      expect(value, `entry ${index}`).toBeCloseTo(from[index] + (to[index] - from[index]) * eased, 9);
    });
    /* And the shear entry is the face's −sin30, draining with the same value. */
    expect(at[1]).toBeCloseTo(-SIN30 * (1 - eased), 9);
    expect(from[0]).toBeCloseTo(COS30, 9);
  });

  it('starts on the face’s near-top corner, as the geometry projects it', () => {
    const [, , , , e, f] = parseMatrix(landingMatrix(seat, square, 0));
    const [px, py] = project(seat.x + seat.width, seat.y + DEPTH, seat.z + SPINE_HEIGHT);
    expect(e).toBeCloseTo(px, 9);
    expect(f).toBeCloseTo(py, 9);
  });
});
