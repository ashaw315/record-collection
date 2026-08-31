import { describe, expect, it } from 'vitest';
import { SPINE_HEIGHT, MAX_SPINE_WIDTH, SHELF_EDGE } from '../shelf/spine';
import { WALL_TOP_MARGIN } from './wall-layout';
import { WALL_FOV_DEGREES, viewportCameraDistance } from './wall-camera';
import { pulledDestination } from './pulled-destination';

const wallOf = (rows: number) => WALL_TOP_MARGIN + rows * (SPINE_HEIGHT + SHELF_EDGE);
const VIEWPORT = 886;

/**
 * **THE SAFEGUARD `WallScene.tsx` PROMISED AND NOBODY WROTE.**
 *
 * Its comment read, for weeks: *"the camera distance scales with the collection,
 * and that is fine for the camera and NOT fine for the pull depth. See
 * `PULL_DEPTH_CAP` below."* There was no below.
 *
 * **The mechanism.** `pulledDestination` solves for the distance at which a
 * record fills `FRAME_FILL` of the frame — a CONSTANT, 1552px at this FOV. The
 * camera's distance was derived from WALL HEIGHT. So the record's world position
 * `cameraZ - 1552` moved with the collection:
 *
 *     1 row    z =  -561    behind the wall it came out of
 *     3 rows   z =  1204
 *     10 rows  z =  7380    far past the viewer
 *
 * **The naive fix — pinning the record's depth — was tried and reverted**,
 * because it breaks a real §10b property asserted next door: *"lands at the SAME
 * APPARENT SIZE at 5 records and at 125"*. Under a camera whose distance scales
 * with the collection, position and size cannot both be constant.
 *
 * **Framing on the VIEWPORT satisfies both**, because it removes the scaling
 * rather than compensating for it.
 */
describe('the pulled record settles at one depth, whatever the collection', () => {
  it('stays in front of the wall it came out of', () => {
    for (const rows of [1, 2, 3, 5, 10]) {
      const d = pulledDestination({
        wallWidth: 1280,
        wallHeight: wallOf(rows),
        viewportHeight: VIEWPORT,
        viewport: { width: 1280, height: 900 },
      });
      expect(d.z, `at ${rows} row(s)`).toBeGreaterThan(MAX_SPINE_WIDTH);
    }
  });

  /**
   * **The property the whole defect violates.** §10b's "now it is in your hands"
   * is a claim about the record, not about how many others are owned.
   */
  it('settles at the same depth at 1 row and at 10', () => {
    const zs = [1, 2, 3, 5, 10].map(
      (rows) =>
        pulledDestination({
          wallWidth: 1280,
          wallHeight: wallOf(rows),
          viewportHeight: VIEWPORT,
          viewport: { width: 1280, height: 900 },
        }).z,
    );
    expect(Math.max(...zs) - Math.min(...zs)).toBeLessThan(1);
  });

  /**
   * **And the apparent size stays constant too**, which is what the naive fix
   * broke. Both properties hold only because the camera stopped scaling.
   */
  it('lands at the same apparent size whatever the collection', () => {
    const apparent = (rows: number) => {
      const wallHeight = wallOf(rows);
      const target = pulledDestination({
        wallWidth: 1280,
        wallHeight,
        viewportHeight: VIEWPORT,
        viewport: { width: 1280, height: 900 },
      });
      const cameraZ = viewportCameraDistance({ viewportHeight: VIEWPORT });
      const halfFrame = (cameraZ - target.z) * Math.tan((WALL_FOV_DEGREES * Math.PI) / 360);
      return SPINE_HEIGHT / (halfFrame * 2);
    };

    expect(apparent(10)).toBeCloseTo(apparent(1), 6);
    expect(apparent(3)).toBeCloseTo(apparent(1), 6);
  });

  it('does not depend on wall height at all', () => {
    const a = viewportCameraDistance({ viewportHeight: VIEWPORT });
    const b = viewportCameraDistance({ viewportHeight: VIEWPORT });
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(0);
  });
});
