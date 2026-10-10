import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { cubeRow } from './block-figure';
import { solidCapEdge } from './figure-solids';
import { construction } from './records/[id]/construction';
import { inkCoverage } from './records/[id]/ink';
import { ownFitViewBox } from './records/[id]/own-fit';

/**
 * §T.6: the three solids "together covering no more than the
 * construction's ink". Step 110 drew them at this size always; step 112
 * makes it the cap on a size taken from the width left.
 */
const area = (points: ReadonlyArray<readonly [number, number]>) => Math.abs(points.reduce((sum, [x, y], i) => { const [nx, ny] = points[(i + 1) % points.length]; return sum + x * ny - nx * y; }, 0)) / 2;

describe('the ink’s allowance for three cubes', () => {
  for (const id of Array.from({ length: 6 }, () => randomUUID())) {
    /* Fails against a cap taken from the figure's box: the box overstates the drawing two to three times (§50). */
    it(`${id}: three cubes at the cap cover the construction’s ink, and no more`, () => {
      const scene = construction(id);
      const [x, y, width, height] = ownFitViewBox(scene).split(' ').map(Number);
      const cap = solidCapEdge(scene);
      expect(cap.box).toEqual({ x, y, width, height });
      const drawn = cubeRow(cap.box, cap.edge, 3).reduce((sum, slot) => sum + area(slot.base) + area(slot.shade) + area(slot.top), 0);
      const ink = inkCoverage(scene) * width * height;
      expect(drawn).toBeLessThanOrEqual(ink * (1 + 1e-9));
      expect(drawn / ink).toBeCloseTo(1, 6);
    });
  }
});
