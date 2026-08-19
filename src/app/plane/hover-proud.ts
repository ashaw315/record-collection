/**
 * How proud a spine sits when the pointer is over it, and when that costs a
 * draw.
 *
 * §10b's hover: hovering pushes a record proud of the wall, the way you push
 * one out with a finger to read it before deciding. **The thing that pops is
 * the thing that will come out**, so the click is legible in advance — which is
 * why this is better than a label alone.
 *
 * No crosshair. The reference needs a reticle because its camera moves and
 * aiming is genuinely hard; this wall is square on and the pointer is already
 * the aim. The proud spine IS the aimed-at marker.
 *
 * Separated from the scene because the decisions are testable and the WebGL is
 * not: which spine is proud, and whether a pointer move costs a frame.
 */

/**
 * How far forward a hovered spine comes, in wall pixels.
 *
 * **Proud, not pulled.** Enough to read as the object responding; not enough to
 * be confusable with the rise, or hover reads as a half-finished click. The
 * rise travels hundreds of units to its destination — this is a nudge.
 */
export const PROUD_DEPTH = 26;

/**
 * How long the proud motion takes, in milliseconds.
 *
 * Short: this is a response to the pointer, not an animation to watch, and a
 * slow one lags behind a reader scanning the wall. Well under the rise's 620ms,
 * for the same reason the depth is — the two motions must not be confusable.
 */
export const PROUD_MS = 140;

/**
 * How far forward a given spine should sit.
 *
 * **One owner: the hovered id.** Every spine's offset is derived from that
 * single value rather than held per spine. Crossing the wall quickly touches
 * forty spines, and per-spine state is the shape that has failed in this
 * project every time it has been built — two things that must agree about which
 * one is proud. Here "only one is proud" is unrepresentable otherwise.
 */
export function proudOffset({
  id,
  hoveredId,
}: {
  id: string;
  hoveredId: string | null;
}): number {
  return id === hoveredId ? PROUD_DEPTH : 0;
}

/**
 * Whether a pointer move needs a frame.
 *
 * **The discipline that keeps hover free.** Before this unit the wall cost ZERO
 * draws across 60 fast pointer moves, because there was no hover handler at
 * all. A naive implementation raycasts and renders on every `pointermove`
 * across 125 spines.
 *
 * The raycast is cheap and unavoidable; the DRAW is not. So the scene is marked
 * dirty only when the hovered spine changes, and the eased motion then runs on
 * its own until it settles — and settles to zero. A still wall with a still
 * pointer must cost nothing, which is the reasoning NOTES recorded before any
 * three.js work began.
 */
export function shouldRedraw({
  previous,
  next,
}: {
  previous: string | null;
  next: string | null;
}): boolean {
  return previous !== next;
}
