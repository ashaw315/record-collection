import { COS30, project, type Point, type RecordBox } from './geometry';

/**
 * The turn as a rigid rotation (8a §11.16, §11.17). **The record rotates in
 * three dimensions and is re-projected every frame; its projected corners
 * are never interpolated.** A morph of four corners passes through
 * quadrilaterals that are no rotation of any record; a rigid body shows
 * three faces whose widths change together, and the reader reads rigidity
 * from the agreement.
 *
 * **The axis is the cover's near vertical edge — at y + depth, toward the
 * camera (§11.20) — not its centre.** The pivot plants that edge: it does
 * not move, and no point of the record ends nearer the shelf than it. The
 * rotation carries the cover normal from (1, 0, 0) toward (0.707, 0.707, 0):
 * against the camera's (1, 1, 1) that is 1.414 against 1, so the cover
 * turns toward the reader and every point of it advances — the pivot's
 * original ground, reinstated. It is also the direction that opens the
 * face: its horizontal edge runs 129.9 → 183.7 on screen; the other way it
 * shuts edge-on at 45°.
 *
 * **Rigid to 45°, where the cover is its widest, and then the projection is
 * undone rather than shape invented.** No rotation about a vertical axis
 * squares the cover under this projection: at 45° the cover's horizontal
 * edge projects to √2·cos30 = 1.2247 of its length against a constant
 * vertical, and the body's 12-unit thickness projects to an 8.49 sliver of
 * edge below it. The finish is a horizontal compression of 1/1.2247 = 0.8165
 * and the sliver collapsing to zero — the depth contribution (x + y)·sin30
 * going to zero — both reaching the square together. The signature is the
 * spine, 10.39 wide in projection at rest, closing to exactly zero at the
 * same 45°: its normal turns edge-on to the camera when the rotation ends.
 *
 * The clearance is a fact about the swept volume (§11.16, §11.18) and, as
 * §11.19 rules, angle-dependent: what phase one must have travelled at any
 * instant is what the rotation at that instant sweeps. `footprint` and
 * `footprintsCollide` are the joint-state check — a test that asserts the
 * travel alone passes the sequential path and fails the ruled one.
 */

/** Where the rotation stops: the cover at its widest. */
export const OPEN_ANGLE = Math.PI / 4;
/** √2·cos30 — how much longer a face diagonal projects than an axis edge. The cover's width at 45°, per unit. */
export const WIDEST = Math.SQRT2 * COS30;
/** The finish's horizontal term: the reciprocal of what made it wide. */
export const FINISH_COMPRESSION = 1 / WIDEST;

export type Corner3 = readonly [number, number, number];
export type Bounds3 = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/**
 * A point of the box, given as offsets from the axis in plan, rotated by
 * `angle` about the cover's near vertical edge — at y + depth (§11.20). In
 * plan the box is dx ∈ [−width, 0], dy ∈ [−depth, 0] from that edge.
 */
function rotate(box: RecordBox, dx: number, dy: number, z: number, angle: number): Corner3 {
  const ax = box.x + box.width;
  const ay = box.y + box.depth;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [ax + dx * c - dy * s, ay + dx * s + dy * c, z];
}

/** The eight corners, rotated. In plan the box is dx ∈ [−width, 0], dy ∈ [0, depth] from the axis. */
export function rotatedCorners(box: RecordBox, angle: number): Corner3[] {
  const corners: Corner3[] = [];
  for (const dx of [-box.width, 0]) {
    for (const dy of [-box.depth, 0]) {
      for (const z of [box.z, box.z + box.height]) corners.push(rotate(box, dx, dy, z, angle));
    }
  }
  return corners;
}

/** The three faces the seat draws — top, cover (+x), spine (−y) — rotated and projected, corner order as `geometry.ts` draws them. */
export function rotatedFaces(box: RecordBox, angle: number): { top: readonly Point[]; cover: readonly Point[]; spine: readonly Point[] } {
  const p = (dx: number, dy: number, z: number) => project(...rotate(box, dx, dy, z, angle));
  const w = box.width;
  const d = box.depth;
  const top = box.z + box.height;
  return {
    top: [p(-w, -d, top), p(0, -d, top), p(0, 0, top), p(-w, 0, top)],
    cover: [p(0, -d, box.z), p(0, 0, box.z), p(0, 0, top), p(0, -d, top)],
    spine: [p(-w, 0, box.z), p(0, 0, box.z), p(0, 0, top), p(-w, 0, top)],
  };
}

/** The rotated box's axis-aligned bounds in wall space — what a separating-plane sort orders by. */
export function rotatedBounds(box: RecordBox, angle: number): Bounds3 {
  const corners = rotatedCorners(box, angle);
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: box.z, z1: box.z + box.height };
}

/** The rotated footprint in plan: four corners, for the clearance check. */
export function footprint(box: RecordBox, angle: number): (readonly [number, number])[] {
  const plan: (readonly [number, number])[] = [
    [-box.width, -box.depth],
    [0, -box.depth],
    [0, 0],
    [-box.width, 0],
  ];
  return plan.map(([dx, dy]) => {
    const [x, y] = rotate(box, dx, dy, box.z, angle);
    return [x, y] as const;
  });
}

/** Does a convex plan polygon overlap an axis-aligned plan rectangle? Separating axes: the rectangle's two and the polygon's edge normals. */
export function footprintsCollide(plan: readonly (readonly [number, number])[], rect: { x0: number; x1: number; y0: number; y1: number }): boolean {
  const rectCorners: (readonly [number, number])[] = [
    [rect.x0, rect.y0],
    [rect.x1, rect.y0],
    [rect.x1, rect.y1],
    [rect.x0, rect.y1],
  ];
  const axes: (readonly [number, number])[] = [
    [1, 0],
    [0, 1],
  ];
  for (let i = 0; i < plan.length; i += 1) {
    const [ax, ay] = plan[i];
    const [bx, by] = plan[(i + 1) % plan.length];
    axes.push([-(by - ay), bx - ax]);
  }
  const range = (points: readonly (readonly [number, number])[], [nx, ny]: readonly [number, number]) => {
    const dots = points.map(([x, y]) => x * nx + y * ny);
    return [Math.min(...dots), Math.max(...dots)] as const;
  };
  for (const axis of axes) {
    const [a0, a1] = range(plan, axis);
    const [b0, b1] = range(rectCorners, axis);
    if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
  }
  return true;
}

/**
 * The finish's basis, `u` of the way from the 45° projection to the page's
 * plane, for a unit box: where x̂ (thickness), ŷ (the cover's run) and ẑ
 * land on screen, measured from the pivot. At 0 it is the rotated
 * projection — x̂ → [0, 0.7071], ŷ (toward the far end, to the right) →
 * [1.2247, 0], ẑ → [0, −1]; at 1 the thickness has collapsed and the run
 * is compressed to its own length: a square, face-on.
 */
export function finishBasis(u: number): { x: readonly [number, number]; y: readonly [number, number]; z: readonly [number, number] } {
  const t = Math.min(1, Math.max(0, u));
  const sliver = Math.SQRT1_2 * (1 - t);
  const run = WIDEST + (1 - WIDEST) * t;
  return { x: [0, sliver], y: [run, 0], z: [0, -1] };
}
