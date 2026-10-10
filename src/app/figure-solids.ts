import { COS30, SIN30 } from '@/app/wall/geometry';
import type { Construction } from './records/[id]/construction';
import { inkCoverage } from './records/[id]/ink';
import { ownFitViewBox } from './records/[id]/own-fit';

type Point = readonly [number, number];
export type SolidFaces = { base: Point[]; shade: Point[]; top: Point[] };

/** §T.6: "up to three", from "the first three records the screen shows". */
export const SOLID_SLOTS = 3;

/** A cube at 30° of edge 1: three rhombi, each COS30 in area. */
const CUBE_AREA = 3 * COS30;

/**
 * §T.6 (step 110): the heading's figure is the construction with a row of
 * §26's isometric boxes to its right. "Stand them in one row on the
 * construction's ground line, to its right, one size, half a solid's width
 * apart so the figure scales as one set of proportions, together covering
 * no more than the construction's ink." "The figure's box is the
 * construction and the row together, and the air test applies to that
 * whole box."
 *
 * Everything is in the still's own units, so the figure scales as one
 * thing. The box is §26's cube, the plainest of its archetypes; three
 * places are always kept, so the figure's box, and with it whether and how
 * large it is drawn, does not change with how many of the records shown
 * have a colour. The size is the largest the ink allows: the three
 * together cover the construction's ink exactly, measured as §50 measures
 * it (`inkCoverage`), not its box.
 */
export function figureWithSolids(scene: Pick<Construction, 'forms' | 'disc'>): {
  viewBox: readonly [number, number, number, number];
  aspect: number;
  /** Where the construction's own box stands in the figure's. */
  construction: { x: number; y: number; width: number; height: number };
  slots: SolidFaces[];
  solidsToInk: number;
} {
  const [x0, y0, width, height] = ownFitViewBox(scene).split(' ').map(Number);
  const ink = inkCoverage(scene) * width * height;
  /* No taller than the construction: a cube is two edges tall. */
  const edge = Math.min(Math.sqrt(ink / (SOLID_SLOTS * CUBE_AREA)), height / 2);
  const solidWidth = 2 * edge * COS30;
  const gap = solidWidth / 2;
  const ground = y0 + height;

  const slots: SolidFaces[] = [];
  for (let i = 0; i < SOLID_SLOTS; i += 1) {
    /* The cube's plan origin projects to its top face's upper corner; its lowest corner is one edge beneath the middle. */
    const cx = x0 + width + gap + solidWidth / 2 + i * (solidWidth + gap);
    const oy = ground - 2 * edge * SIN30;
    const p = (u: number, v: number, w: number): Point => [cx + (u - v) * COS30 * edge, oy + (u + v) * SIN30 * edge - w * edge];
    slots.push({
      base: [p(0, 1, 0), p(1, 1, 0), p(1, 1, 1), p(0, 1, 1)],
      shade: [p(1, 0, 0), p(1, 1, 0), p(1, 1, 1), p(1, 0, 1)],
      top: [p(0, 0, 1), p(1, 0, 1), p(1, 1, 1), p(0, 1, 1)],
    });
  }
  const figureWidth = width + SOLID_SLOTS * (gap + solidWidth);
  return {
    viewBox: [x0, y0, figureWidth, height],
    aspect: figureWidth / height,
    construction: { x: x0, y: y0, width, height },
    slots,
    solidsToInk: (SOLID_SLOTS * CUBE_AREA * edge * edge) / ink,
  };
}
