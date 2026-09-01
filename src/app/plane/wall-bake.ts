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
 * softens; too large and the wall reads as BLOCKS rather than as out of focus —
 * which is the tension, because a single downsample cannot be both soft and
 * smooth.
 *
 * **1/8, and 1/5 was tried and measured worse.** Relative contrast — detail as a
 * fraction of brightness, which is what the eye reads — over the spine band:
 *
 *     no blur   0.255
 *     1/5       0.223    barely blurred; individual spines still readable
 *     1/8       0.140    detail halved
 *
 * The blockiness 1/5 was reaching for is real but secondary: mipmaps and linear
 * magnification smooth the ramp, and a wall that is *soft but slightly stepped*
 * reads better than one that is *smooth but still legible*. Criterion's is both,
 * because a real Gaussian has a wide falloff; a single downsample cannot be.
 *
 * **The measurement needed normalising to mean anything.** Absolute contrast
 * said 1/5 was SHARPER than no blur at all — because the baked wall is 1.7x
 * brighter (the dim no longer stacks on it), and a bright blurred image beats a
 * dark sharp one on absolute difference.
 */
export const BAKE_DOWNSAMPLE = 8;

/** The render target's size for a given canvas, never zero. */
export function bakeResolution({
  width,
  height,
  downsample = BAKE_DOWNSAMPLE,
}: {
  width: number;
  height: number;
  /** `/scene` sweeps this; production takes the default. */
  downsample?: number;
}): { width: number; height: number } {
  const n = downsample > 0 ? downsample : BAKE_DOWNSAMPLE;

  return {
    width: Math.max(1, Math.round(width / n)),
    height: Math.max(1, Math.round(height / n)),
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


/**
 * How much of the RETURN the blur takes to clear, as a fraction.
 *
 * **The asymmetry here is the opposite of the one that was wrong for durations**,
 * and the reason is different in kind. There, equal durations won because a
 * record going back at speed reads as DROPPED rather than replaced — a claim
 * about the object.
 *
 * This is a claim about ATTENTION. Adam: *"the wall coming back into focus is
 * not something I am watching."* On the way out the blur is part of what the eye
 * follows; on the way back it is scenery, and holding it for the full 1400ms
 * leaves a soft wall sitting behind a record that has already gone home.
 *
 * Not instant, because instant is the snap this fixes arriving from the other
 * side.
 */
export const RETURN_CLEAR_FRACTION = 0.45;

/**
 * How much of the blurred wall shows, against the sharp one beneath it.
 *
 * **This is the fix for the snap.** The quad used to replace the wall outright
 * the moment a record left the shelf, so the blur was binary — only its
 * BRIGHTNESS ramped, which is why the wall went out of focus before the record
 * had moved.
 *
 * Linear on the way out, for the reason `wallDim` is linear: the backdrop
 * arrives WITH the record rather than ahead of it. A curve that is 88% of the
 * way by halfway puts the arrival against an already-soft wall, which is the
 * modal opening §10b exists to avoid.
 */
export function bakeMix({
  progress,
  returning,
}: {
  progress: number;
  returning: boolean;
}): number {
  const t = Math.min(1, Math.max(0, progress));

  if (!returning) return t;

  /*
    Reading 1 -> 0 on the way home, the blur is gone by the time the record has
    travelled `RETURN_CLEAR_FRACTION` of the way — so it clears early and the
    rest of the return happens against a wall already back in focus.
  */
  const travelled = 1 - t;
  const cleared = Math.min(1, travelled / RETURN_CLEAR_FRACTION);

  return 1 - cleared;
}
