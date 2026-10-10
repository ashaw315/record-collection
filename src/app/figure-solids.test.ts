import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { construction } from './records/[id]/construction';
import { inkCoverage } from './records/[id]/ink';
import { ownFitViewBox } from './records/[id]/own-fit';
import { SOLID_SLOTS, figureWithSolids } from './figure-solids';

/**
 * §T.6 (step 110): "up to three of §26's isometric boxes... Stand them in
 * one row on the construction's ground line, to its right, one size, half
 * a solid's width apart so the figure scales as one set of proportions,
 * together covering no more than the construction's ink". "The figure's box
 * is the construction and the row together."
 */
/** A polygon's area by the shoelace sum. */
const area = (points: ReadonlyArray<readonly [number, number]>) => Math.abs(points.reduce((sum, [x, y], i) => { const [nx, ny] = points[(i + 1) % points.length]; return sum + x * ny - nx * y; }, 0)) / 2;
const extent = (points: ReadonlyArray<readonly [number, number]>) => ({ minX: Math.min(...points.map((p) => p[0])), maxX: Math.max(...points.map((p) => p[0])), minY: Math.min(...points.map((p) => p[1])), maxY: Math.max(...points.map((p) => p[1])) });

const ids = Array.from({ length: 25 }, () => randomUUID());

describe('the row of solids beside a construction', () => {
  it('has three places', () => {
    expect(SOLID_SLOTS).toBe(3);
  });

  for (const id of ids.slice(0, 5)) {
    const scene = construction(id);
    const [x0, y0, w, h] = ownFitViewBox(scene).split(' ').map(Number);
    const figure = figureWithSolids(scene);
    const boxes = figure.slots.map((slot) => extent([...slot.base, ...slot.shade, ...slot.top]));

    /* Fails against solids sized by the figure's box: the box overstates the drawing two to three times (§50). */
    it(`${id}: the three together cover the construction’s ink and no more`, () => {
      const ink = inkCoverage(scene) * w * h;
      const solids = figure.slots.reduce((sum, slot) => sum + area(slot.base) + area(slot.shade) + area(slot.top), 0);
      expect(solids).toBeLessThanOrEqual(ink * (1 + 1e-9));
      expect(solids / ink, 'and as much of it as the rule allows').toBeCloseTo(1, 6);
      expect(figure.solidsToInk).toBeCloseTo(solids / ink, 9);
    });

    it(`${id}: they are one size, each a box at 30° with three faces`, () => {
      const widths = boxes.map((b) => b.maxX - b.minX);
      const heights = boxes.map((b) => b.maxY - b.minY);
      for (const width of widths) expect(width).toBeCloseTo(widths[0], 9);
      for (const height of heights) expect(height).toBeCloseTo(heights[0], 9);
      /* A cube at 30°: as wide as its edge by √3, and twice its edge tall. */
      expect(widths[0] / heights[0]).toBeCloseTo(Math.sqrt(3) / 2, 9);
      for (const slot of figure.slots) for (const face of [slot.base, slot.shade, slot.top]) expect(face).toHaveLength(4);
    });

    /* Fails against a fixed gap (an earlier draft's 24), which does not scale with the figure. */
    it(`${id}: they stand to the construction’s right on its ground line, half a solid’s width apart`, () => {
      const width = boxes[0].maxX - boxes[0].minX;
      expect(boxes[0].minX - (x0 + w), 'the first, from the construction').toBeCloseTo(width / 2, 9);
      for (let i = 1; i < boxes.length; i += 1) expect(boxes[i].minX - boxes[i - 1].maxX, `between ${i} and ${i + 1}`).toBeCloseTo(width / 2, 9);
      for (const b of boxes) expect(b.maxY, 'on the ground line').toBeCloseTo(y0 + h, 9);
    });

    it(`${id}: the figure’s box is the construction and the row together, and nothing leaves it`, () => {
      const [fx, fy, fw, fh] = figure.viewBox;
      expect([fx, fy, fh]).toEqual([x0, y0, h]);
      expect(fx + fw, 'ends where the last solid ends').toBeCloseTo(boxes[boxes.length - 1].maxX, 9);
      expect(figure.construction).toEqual({ x: x0, y: y0, width: w, height: h });
      expect(figure.aspect).toBeCloseTo(fw / fh, 9);
      for (const b of boxes) expect(b.minY, 'no solid is taller than the construction').toBeGreaterThanOrEqual(fy);
    });
  }

  /* "So the figure is drawn at one set of proportions and scales as a whole": nothing in it is a pixel figure. */
  it('is the same for one construction every time', () => {
    for (const id of ids) expect(figureWithSolids(construction(id))).toEqual(figureWithSolids(construction(id)));
  });
});
