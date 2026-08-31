/**
 * **The wall, baked to a texture once when a record is pulled.**
 *
 * The composer approach failed after six wrong diagnoses, and the reason was
 * structural: a screen-space pass FILTERS THE FRAME, so the wall and the record
 * are the same pixels by the time it runs. Every step needed the partition the
 * scene already has everywhere else — material dim, id-keyed meshes, DOM chrome
 * — re-established through layer masks that someone must keep correct.
 *
 * **This replaces the wall with a picture of itself.** The record stays an
 * ordinary mesh in front of a quad, sharp because it is a DIFFERENT OBJECT. The
 * partition is physical rather than maintained.
 *
 * **One frame, not every frame**, and the premise is verified rather than
 * assumed: `WallScene` disables hover while a record is out — *"a wall that
 * twitches behind the thing being read"* — so the wall is genuinely static for
 * the whole time the bake is on screen.
 *
 * **The blur is bilinear filtering, not a shader.** Render the wall at low
 * resolution and draw it back at full size; the GPU's own texture filtering does
 * the softening. No pass, no swap buffers, no output encoding, no render target
 * colour space — the machinery that fought this scene for two hours is absent
 * rather than configured.
 */

/**
 * How much smaller the baked texture is than the canvas.
 *
 * This IS the blur radius: a texture at 1/n scale, magnified back, is softened
 * by exactly the filtering that magnification requires. Too small and nothing
 * softens; too large and the wall reads as blocks rather than as out of focus.
 */
export const BAKE_DOWNSAMPLE = 8;

/** The render target's size for a given canvas, never zero. */
export function bakeResolution({ width, height }: { width: number; height: number }): {
  width: number;
  height: number;
} {
  return {
    width: Math.max(1, Math.round(width / BAKE_DOWNSAMPLE)),
    height: Math.max(1, Math.round(height / BAKE_DOWNSAMPLE)),
  };
}

/**
 * How strongly the baked quad shows, at a given point in the rise.
 *
 * **The bake is taken UNDIMMED and the dim rides on this instead.** Baking the
 * dim in would snap the wall to full dimness the moment the texture is captured
 * — the front-loading `wallDim` was tuned to avoid, where the backdrop resolves
 * ahead of the record and the arrival happens against an already-dark wall.
 *
 * Linear for the same reason `wallDim` is, so the two ramps agree.
 */
export function bakeOpacity(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));

  return 1 - 0.35 * t;
}
