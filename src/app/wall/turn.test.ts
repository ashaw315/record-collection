import { describe, expect, it } from 'vitest';
import { COS30, SIN30, coverTransform, spineWidth } from './geometry';
import { ARROW_LANE, LANDING_PAD, landedBox, parseMatrix } from './landing';
import { PULL_DURATION_MS, pullEase } from './pull-curve';
import { TURN_DURATION_MS, pageSquare, turnEase, turnMatrix, turnMatrixAt } from './turn';

/**
 * §11.14: the pull has two phases — out, then round — and the square is the
 * second one's end. Phase one is §11.2's pull, unchanged; phase two turns
 * the record onto the page's plane: its cover's four corners go from the
 * projected parallelogram to the page square. The two abut with no hold, and
 * the boundary is legible from the velocity: the pull is ease-out, so it
 * arrives at rest; the turn is ease-in-out, so it leaves from rest.
 *
 * What the probe settles is the timing and the corner path; what this file
 * fixes is the shape: the join exact, the ends exact, the two paths distinct.
 */
const view = { x: 0, y: 0, width: 960, height: 760 };
const box = landedBox('r', view);
const square = pageSquare(view);
const slope = (f: (t: number) => number, t: number, h = 1e-4) => (f(Math.min(1, t + h)) - f(Math.max(0, t - h))) / (2 * h);

describe('the boundary: velocity returns to zero between the phases', () => {
  it('the pull arrives at rest and the turn leaves from rest — ease-out into ease-in-out', () => {
    expect(slope(pullEase, 1)).toBeLessThan(1e-3);
    expect(slope(turnEase, 0)).toBeLessThan(1e-3);
    expect(slope(turnEase, 1)).toBeLessThan(1e-3);
    /* And mid-turn it is genuinely moving: the boundary reads from velocity, not from a hold. */
    expect(slope(turnEase, 0.5)).toBeGreaterThan(1);
  });

  it('is an ease-in-out cubic, clamped, symmetric about its middle', () => {
    expect(turnEase(0)).toBe(0);
    expect(turnEase(1)).toBe(1);
    expect(turnEase(0.5)).toBe(0.5);
    expect(turnEase(0.25)).toBeCloseTo(1 - turnEase(0.75), 12);
    expect(turnEase(-1)).toBe(0);
    expect(turnEase(2)).toBe(1);
  });

  it('phase one keeps its 1000ms; phase two’s figure is the open one, and the hypothesis is faster', () => {
    expect(PULL_DURATION_MS).toBe(1000);
    expect(TURN_DURATION_MS).toBeLessThan(PULL_DURATION_MS);
  });
});

describe('pageSquare — §11.9’s square, now the second phase’s end', () => {
  it('is the largest square the region holds inside the padding and the arrow lanes, centred', () => {
    expect(square.size).toBe(Math.min(view.width - 2 * (LANDING_PAD + ARROW_LANE), view.height - 2 * LANDING_PAD));
    expect(square.x).toBe(view.x + (view.width - square.size) / 2);
    expect(square.y).toBe(view.y + (view.height - square.size) / 2);
  });
});

describe('turnMatrixAt — the cover’s corners from the parallelogram to the page square', () => {
  it('is the landed cover’s own matrix at 0 — exactly, the join shares its history with the pull', () => {
    for (const path of ['linear', 'rotation'] as const) {
      expect(turnMatrixAt(box, square, 0, path)).toBe(coverTransform(box));
    }
  });

  it('is the page square at 1 — exactly axis-aligned, on the page’s plane, not the projection’s', () => {
    for (const path of ['linear', 'rotation'] as const) {
      const [a, b, c, d, e, f] = parseMatrix(turnMatrixAt(box, square, 1, path));
      expect(b).toBe(0);
      expect(c).toBe(0);
      expect(a * box.depth).toBeCloseTo(square.size, 9);
      expect(d * box.height).toBeCloseTo(square.size, 9);
      expect(e).toBe(square.x);
      expect(f).toBe(square.y);
    }
  });

  it('linear: every entry halfway is the mean of its ends — a straight corner path', () => {
    const from = parseMatrix(coverTransform(box));
    const to = parseMatrix(turnMatrixAt(box, square, 1, 'linear'));
    const mid = parseMatrix(turnMatrixAt(box, square, 0.5, 'linear'));
    mid.forEach((value, index) => expect(value, `entry ${index}`).toBeCloseTo((from[index] + to[index]) / 2, 9));
  });

  it('rotation: the top edge swings from −30° to 0° with its length growing, the vertical edge stays vertical', () => {
    const angle = (m: number[]) => Math.atan2(m[1], m[0]);
    expect(angle(parseMatrix(turnMatrixAt(box, square, 0, 'rotation')))).toBeCloseTo(Math.atan2(-SIN30, COS30), 12);
    expect(angle(parseMatrix(turnMatrixAt(box, square, 0.5, 'rotation')))).toBeCloseTo(Math.atan2(-SIN30, COS30) / 2, 12);
    expect(angle(parseMatrix(turnMatrixAt(box, square, 1, 'rotation')))).toBeCloseTo(0, 12);
    for (const u of [0.25, 0.5, 0.75]) {
      const m = parseMatrix(turnMatrixAt(box, square, u, 'rotation'));
      expect(m[2], `c at ${u}`).toBe(0);
      const length = Math.hypot(m[0], m[1]);
      expect(length).toBeCloseTo(1 + (square.size / box.depth - 1) * u, 9);
    }
  });

  it('the two paths share their ends and differ between them', () => {
    expect(turnMatrixAt(box, square, 0.5, 'linear')).not.toBe(turnMatrixAt(box, square, 0.5, 'rotation'));
  });

  it('turnMatrix runs the same on the turn’s own curve', () => {
    expect(turnMatrix(box, square, 0.3, 'linear')).toBe(turnMatrixAt(box, square, turnEase(0.3), 'linear'));
    expect(spineWidth('r')).toBe(box.width);
  });
});
