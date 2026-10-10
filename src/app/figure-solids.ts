import { COS30 } from '@/app/wall/geometry';
import { SOLID_SLOTS } from './block-figure';
import type { Construction } from './records/[id]/construction';
import { inkCoverage } from './records/[id]/ink';
import { ownFitViewBox } from './records/[id]/own-fit';

/** A cube at 30° of edge 1: three rhombi, each COS30 in area. */
const CUBE_AREA = 3 * COS30;

/**
 * §T.6: the solids "together covering no more than the construction's
 * ink". The largest edge, in the construction's own units, at which three
 * of §26's cubes cover exactly that ink, measured as §50 measures it
 * (`inkCoverage`) and not as the box, which overstates the drawing two to
 * three times. Step 112 sizes the cubes "to the width left beside [the
 * construction], up to the ink cap": this is the cap.
 */
export function solidCapEdge(scene: Pick<Construction, 'forms' | 'disc'>): { edge: number; box: { x: number; y: number; width: number; height: number } } {
  const [x, y, width, height] = ownFitViewBox(scene).split(' ').map(Number);
  const ink = inkCoverage(scene) * width * height;
  return { edge: Math.sqrt(ink / (SOLID_SLOTS * CUBE_AREA)), box: { x, y, width, height } };
}
