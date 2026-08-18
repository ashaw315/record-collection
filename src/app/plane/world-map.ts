import { squareFrustum } from './plane';

/**
 * Mapping a DOM rect into world coordinates — what A18 named as the renderer's
 * real cost and A19c called the hardest part of this work:
 *
 *   "The record rises out of a spine that is a flex child in a wrapping CSS
 *    row, so the renderer must map a DOM rect into world coordinates and keep
 *    that mapping correct across scroll, resize and re-wrap. That is a number
 *    two systems share."
 *
 * **The question being asked, stated once because unit 18 proved it is the
 * whole game: "where are these two elements relative to each other, right
 * now, on screen?"**
 *
 * That question has exactly one right instrument: `getBoundingClientRect`, for
 * BOTH rects. It is viewport-relative, so scroll moves the spine and the canvas
 * together and cancels out of the difference — no scroll term appears here, and
 * that absence is the design rather than an oversight. Unit 18's defect was
 * pairing a document-relative `offsetTop` with a viewport-relative `clientY`;
 * the fix was not a correction term but keeping everything in one system.
 *
 * The other instruments answer other questions and are wrong for this one.
 * `offsetLeft`/`offsetTop` are document-relative, so they drift by `scrollY`
 * against anything viewport-relative. `offsetWidth`/`offsetHeight` ignore
 * transforms, which is right when measuring an element that carries one (unit
 * 13) and irrelevant here, because a spine carries none.
 *
 * **Re-measured, never cached.** A resize re-wraps the row and moves every
 * spine; a mapping computed once is correct only until something moves.
 */

/** A viewport-relative rect. The shape `getBoundingClientRect` returns. */
export type ScreenRect = { left: number; top: number; width: number; height: number };

/** A position and size in the scene's world units. */
export type WorldPlacement = { x: number; y: number; scaleX: number; scaleY: number };

/**
 * Where a screen rect sits in the scene, given the canvas it is rendered into.
 *
 * The camera is orthographic with `squareFrustum`'s extents, so world units map
 * linearly to canvas pixels: one world unit is the canvas's shorter axis, and
 * the mapping is arithmetic rather than a projection.
 *
 * **Screen Y grows down and world Y grows up**, so the vertical term is
 * negated. Getting that wrong produces unit 18's signature — one axis correct
 * and the other inverted — which reads as a motion bug rather than as a
 * coordinate-system one.
 */
export function screenRectToWorld(rect: ScreenRect, canvas: ScreenRect): WorldPlacement {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  }

  const frustum = squareFrustum(canvas.width, canvas.height);

  // World units per canvas pixel, on each axis. Equal for a square canvas and
  // deliberately computed separately so a non-square one stays correct.
  const unitsPerPixelX = (frustum.right - frustum.left) / canvas.width;
  const unitsPerPixelY = (frustum.top - frustum.bottom) / canvas.height;

  // Both rects are viewport-relative, so this difference is scroll-independent.
  const centreOffsetX = rect.left + rect.width / 2 - (canvas.left + canvas.width / 2);
  const centreOffsetY = rect.top + rect.height / 2 - (canvas.top + canvas.height / 2);

  return {
    x: centreOffsetX * unitsPerPixelX,
    // Negated: screen down is world up.
    y: -centreOffsetY * unitsPerPixelY,
    // The mesh is a 1x1 plane, so its scale IS its size in world units.
    scaleX: rect.width * unitsPerPixelX,
    scaleY: rect.height * unitsPerPixelY,
  };
}

/**
 * The inverse: where a world placement lands on screen.
 *
 * **Exists for the round-trip assertion**, which is the strongest single check
 * on this mapping: a world position projected back must land on the rect it
 * came from. If it does not, the mapping is wrong regardless of what the
 * animation looks like — and a rise that starts thirty pixels off looks
 * entirely convincing in flight.
 */
export function worldToScreenRect(world: WorldPlacement, canvas: ScreenRect): ScreenRect {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const frustum = squareFrustum(canvas.width, canvas.height);
  const pixelsPerUnitX = canvas.width / (frustum.right - frustum.left);
  const pixelsPerUnitY = canvas.height / (frustum.top - frustum.bottom);

  const width = world.scaleX * pixelsPerUnitX;
  const height = world.scaleY * pixelsPerUnitY;

  const centreX = canvas.left + canvas.width / 2 + world.x * pixelsPerUnitX;
  const centreY = canvas.top + canvas.height / 2 - world.y * pixelsPerUnitY;

  return { left: centreX - width / 2, top: centreY - height / 2, width, height };
}
