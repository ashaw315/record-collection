/**
 * **The wall goes out of focus behind a pulled record.**
 *
 * A stronger dim was tried first and rejected by looking — Adam: *"Darkening is
 * not the effect. The wall goes dim rather than going out of focus, and at 125
 * records the noise is still all there, just darker."* Blur removes the detail;
 * darkening only lowers it.
 *
 * **This JOINS the dim rather than replacing it.** Out of focus AND slightly
 * darker is what a shallow depth of field actually does, so the two are
 * independent controls and the combination is what gets judged.
 *
 * ---
 *
 * **THE CONSTRAINT THAT MATTERS, WRITTEN HERE RATHER THAN REMEMBERED.**
 *
 * The scene draws only when something has changed (`render-loop.ts`), and a
 * resting pointer costs zero draws — there is an E2E test counting them.
 *
 * A post-process pass does NOT threaten that: the composer renders on demand
 * exactly as `renderer.render` does, and the frames where this radius changes
 * are already dirty because the record is moving.
 *
 * **What WOULD break it is animating the blur on a timer of its own.** So the
 * radius is a pure function of the rise's progress — the same value the dim
 * reads — and nothing here may acquire a clock. A blur that ticks independently
 * turns a scene with zero idle draws into one that renders continuously, which
 * is a real regression traded for an effect nobody asked to be animated
 * separately.
 */

/**
 * How soft the wall gets at full pull, in screen pixels.
 *
 * Bounded on both sides: under a pixel or two is indistinguishable from no blur
 * at all — the failure the dim had, reached from the other direction — and a
 * very large radius costs fragment work for an effect nobody asked to be
 * dramatic.
 */
export const WALL_BLUR_MAX_PX = 12;

/**
 * The blur radius at a given point in the rise.
 *
 * **Linear, for the reason `wallDim` is linear**, and that reason was recorded
 * when a cubic ease-out was rejected for the dim: it is 88% of the way by
 * halfway, so the backdrop resolves ahead of the record and the arrival happens
 * against an already-soft wall. Adam agreed the argument transfers and asked for
 * the control to check it rather than assume it, which `/scene` provides.
 */
export function wallBlurPx(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));

  return WALL_BLUR_MAX_PX * t;
}

/**
 * A pixel radius as the texture-space step the blur shaders take.
 *
 * `HorizontalBlurShader` and `VerticalBlurShader` sample at offsets of `h`/`v`
 * in UV units, so the same pixel radius is a different step on a narrow canvas
 * than on a wide one. **Converting against the live canvas size is what keeps
 * the blur constant through a resize** — the scene's own resize deliberately
 * tracks width only, so height changes reach this by way of the render target
 * rather than a rebuild.
 */
export function wallBlurStep({ px, sizePx }: { px: number; sizePx: number }): number {
  if (sizePx <= 0) return 0;

  return px / sizePx;
}


/**
 * **Render layers, because a screen-space blur cannot exempt an object the way
 * the dim does.**
 *
 * The dim is a MATERIAL property applied per mesh, so `wallDimExempt` can name
 * the one record that is out and leave it at full brightness. **Blur is
 * screen-space:** by the time the passes run, the wall and the record are the
 * same pixels, and blurring the frame blurs the record with it — measured, and
 * visible immediately at 125 records.
 *
 * §10b forbids that outright: a cover rendered at anything other than its own
 * fidelity is the app being wrong about the record, the same class as inventing
 * a spine colour. The dim entry records the identical finding about a DOM scrim
 * that cost the cover 0.30x its brightness.
 *
 * So the wall and the pulled record are drawn on separate layers: the composer
 * renders and blurs the WALL layer, then the record is drawn over it sharp.
 */
export const WALL_LAYER = 0;
export const RECORD_LAYER = 1;
