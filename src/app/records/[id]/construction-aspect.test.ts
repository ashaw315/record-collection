import { describe, expect, it } from 'vitest';
import { construction } from './construction';
import { BANDS, IDENTITY_SPANS, NO_SCROLL_HEIGHT } from './band-geometry';

/**
 * **§17: the arrangement takes the CELL's aspect.**
 *
 * The frame was 0.903 against a cell of 0.659 — "not a fitting problem, it is
 * a composition that was laid out in free space and then posted into a box".
 * The drawing occupied 73% of its cell with 147px of dead height, which is
 * what a mismatch of that size looks like.
 *
 * §17 also explains why §5.5's own remedy failed: growing a face inside a
 * drawing that occupies 73% of its cell is spending the wrong term. "The area
 * was short because the drawing was small, and the drawing was small because
 * its aspect was wrong." The sweep from 1.05 to 1.45 reached 0.494% and left
 * two records failing; the floor clears by SCALE alone once the aspect is
 * right.
 *
 * Available where the other three remedies are not, because the arrangement
 * is the generator's (§5.1) rather than the page's composition (§8, §12), so
 * re-proportioning its bounding box changes no cell, no band, no projection.
 */

/**
 * The still's cell, derived rather than typed: §17's 0.659 is this quotient.
 *
 * At the REFERENCE width of 1440, which is where every figure in §12 and §17
 * was measured — the 0.903 frame, the 73% occupancy, the 147px of dead
 * height. `MAX_GRID_WIDTH` is 1728 and gives 0.790; the page is elastic
 * between them, so the aspect the generator targets is a single chosen
 * proportion rather than a live measurement, and 1440 is the one the rulings
 * name.
 */
const REFERENCE_WIDTH = 1440;
const CELL_W = (REFERENCE_WIDTH / 12) * IDENTITY_SPANS[1];
const CELL_H = BANDS.identity;
const CELL_ASPECT = CELL_W / CELL_H;

const REAL_IDS = [
  'e73e1de1-3686-4a81-8544-ca2300e187bb',
  'd7047c62-149e-42fa-8cda-fac3f90c47cc',
  '158a3163-6a56-4673-8f88-27e7b2aec724',
  'c61c5919-8f50-4782-8e04-419fb3d2b148',
  'a31591e7-2e28-42e7-84d5-2a1f96ad31fd',
  'b9a9a9db-4bf5-42e6-b751-0eba2dfe8002',
  '30504952-8d43-4c2e-b687-b89558371df5',
  '78da2ee9-f7c7-40ea-8149-269454437ef6',
  '372aba39-59ad-46c8-b76b-f33ecae75c98',
  '464979c3-aaa2-43c5-afd4-8dc4ee2e98c6',
  '7d35194b-5a02-4e31-a568-d95a9b32b0cd',
  'b4abf39a-df33-4a9e-b65c-64d3d0a39b78',
];

const faceArea = (points: ReadonlyArray<readonly [number, number]>) => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
};

const frameOf = (id: string) => {
  const [x, y, w, h] = construction(id).viewBox.split(' ').map(Number);
  return { x, y, w, h };
};

describe('§17: the generator arranges into a box of the cell’s proportion', () => {
  it('the cell’s aspect is §17’s 0.659, derived from the band and the spans', () => {
    /* 0.6581 exactly; §17 quotes it to three figures. The derivation is the
       thing kept, so the assertion allows the ruling's own rounding. */
    expect(CELL_ASPECT).toBeCloseTo(0.659, 2);
  });

  it('gives every frame the cell’s aspect, not its own', () => {
    for (const id of REAL_IDS) {
      const { w, h } = frameOf(id);
      expect(w / h, `${id}: frame ${w.toFixed(1)}×${h.toFixed(1)}`).toBeCloseTo(CELL_ASPECT, 2);
    }
  });

  /*
    The consequence §17 draws the aspect FOR: at a matching aspect the drawing
    fills the cell in both directions, so occupancy is ~100% rather than 73%.
  */
  it('fills the cell in both directions, so nothing is dead height', () => {
    for (const id of REAL_IDS) {
      const { w, h } = frameOf(id);
      const scale = Math.min(CELL_W / w, CELL_H / h);
      const occupancy = (w * scale * h * scale) / (CELL_W * CELL_H);
      expect(occupancy, `${id}: occupancy`).toBeGreaterThan(0.99);
    }
  });

  /*
    §5.5's floor, which §17 says clears by scale alone — "at or above Code's
    figures: filling height gave a 0.600% minimum and a 1.091% median, and
    filling both directions cannot be smaller than filling one."
  */
  it('clears §5.5’s 0.5% floor on base faces alone, disc excluded', () => {
    const PAGE = REFERENCE_WIDTH * NO_SCROLL_HEIGHT;
    const short: string[] = [];
    const all: number[] = [];

    for (const id of REAL_IDS) {
      const { w, h } = frameOf(id);
      const scale = Math.min(CELL_W / w, CELL_H / h);
      const base = construction(id)
        .forms.flatMap((form) => form.faces.filter((face) => face.step === 'base'))
        .map((face) => faceArea(face.points));

      expect(base.length, `${id}: two faces carry colour`).toBe(2);

      const fraction = (base.reduce((a, b) => a + b, 0) * scale * scale) / PAGE;
      all.push(fraction);
      if (fraction < 0.005) short.push(`${id} ${(fraction * 100).toFixed(3)}%`);
    }

    expect(short, `§5.5's floor is 0.5% of the page — short: ${short.join(', ')}`).toEqual([]);
    /* §17's own bar: at or above the height-filling figures. */
    expect(Math.min(...all), 'minimum at or above §17’s 0.600%').toBeGreaterThanOrEqual(0.006);
  });

  /*
    **What must survive**, because each was a fix this file already paid for.
  */
  it('keeps the per-record offset: the hash shows through a shared frame', () => {
    const offsets = REAL_IDS.map((id) => {
      const { x, y, w, h } = frameOf(id);
      const scene = construction(id);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const form of scene.forms) {
        for (const face of form.faces) {
          for (const [px, py] of face.points) {
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
          }
        }
      }
      return { dx: (minX + maxX) / 2 - (x + w / 2), dy: (minY + maxY) / 2 - (y + h / 2) };
    });

    /*
      §17: "fitting per arrangement is what once made six records look like one
      drawing, so 35 units of vertical variation is the hash showing through a
      frame that does not normalise it away." A frame refitted per record would
      drive every offset to zero — that is the defect, not the goal.
    */
    const spread = Math.max(...offsets.map((o) => o.dy)) - Math.min(...offsets.map((o) => o.dy));
    expect(spread, 'the vertical offset still varies between records').toBeGreaterThan(10);
  });

  it('keeps the frames SHARED rather than fitted per record', () => {
    const frames = new Set(REAL_IDS.map((id) => construction(id).viewBox));
    expect(frames.size, 'frames are shared, not one per record').toBeLessThan(REAL_IDS.length);
  });
});
