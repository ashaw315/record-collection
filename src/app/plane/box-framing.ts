/**
 * **How far back the box camera stands so a 1-unit record fills a given
 * fraction of the frame.**
 *
 * `BoxCanvas` renders a `BoxGeometry(1, 1, depth)` through a perspective camera.
 * Where that camera stands decides how much of the frame the record occupies —
 * and until this existed, the distance was a fixed `3.4`, which frames the
 * record at ~55%. That is right for the wall's pulled record, which sits back in
 * a scene; it is wrong for a size comparison, where the whole point is to fill
 * the frame, and it produced the defect where a "100%" element still showed a
 * 55% record with black either side (NOTES).
 *
 * The frame's height at the record's distance is `2 · d · tan(fov/2)`, and the
 * record is 1 unit, so `fill = 1 / (2 · d · tan(fov/2))`. Solving for `d`:
 *
 *     d = 1 / (2 · fill · tan(fov/2))
 *
 * A larger fill stands the camera closer; `fill = 1` puts the record edge to
 * edge. Fill is clamped above 0 because a zero or negative fraction has no
 * camera position and would divide by zero.
 */
export function boxCameraDistance(fill: number, fovDegrees: number): number {
  const safeFill = Math.max(fill, 0.01);
  return 1 / (2 * safeFill * Math.tan((fovDegrees * Math.PI) / 360));
}
