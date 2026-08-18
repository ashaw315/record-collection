/**
 * The arithmetic behind §10b's first `three.js` unit: one static textured
 * plane, and nothing else.
 *
 * **Separated from the renderer because WebGL's failures are silent.** A black
 * square, a washed-out texture, or nothing at all are all the same observation
 * from the outside, and the error messages point at the draw call rather than
 * the cause. What can be reasoned about — the camera arithmetic and which image
 * belongs on the face — is pulled out here where a test can hold it, so that
 * when the canvas is blank the arithmetic is already eliminated.
 */

/** An orthographic camera's clipping planes, in world units. */
export type Frustum = { left: number; right: number; top: number; bottom: number };

/**
 * A frustum that renders a 1×1 plane square, whatever shape the canvas is.
 *
 * **The camera and the geometry have to agree, and nothing warns you when they
 * do not.** A square texture on a square plane still renders stretched if the
 * frustum's aspect differs from the canvas's, because one world unit then
 * measures a different number of pixels horizontally and vertically. The result
 * looks like a slightly wrong crop rather than like a bug — which is why §10b's
 * "a 12″ sleeve is square" needs arithmetic behind it rather than a constant.
 *
 * The SHORTER axis is pinned to the plane's own size so the sleeve is never
 * cropped by the camera; the longer axis grows to fill the canvas. A zero-sized
 * canvas — measured before layout — falls back to square rather than dividing
 * by zero, because `NaN` here renders nothing at all, silently.
 */
export function squareFrustum(canvasWidth: number, canvasHeight: number): Frustum {
  const aspect = canvasWidth > 0 && canvasHeight > 0 ? canvasWidth / canvasHeight : 1;

  // Half-extents: the shorter axis is 0.5 either side of centre, so a 1x1 plane
  // exactly fits it, and the longer axis is scaled by the aspect.
  const halfWidth = aspect >= 1 ? aspect / 2 : 0.5;
  const halfHeight = aspect >= 1 ? 0.5 : 1 / (2 * aspect);

  return { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight };
}

/** The part of an `images` row this needs. Narrowed so a test can pass literals. */
export type ImageRow = { imageType: string | null; url: string };

/**
 * The image that goes on the front face, or `null` when there is none.
 *
 * §10b: the front is the `cover` image, and "a record with no cover gets a
 * plain sleeve there too … an honest absence rather than a placeholder. Both
 * cases are ordinary and neither is an error state."
 *
 * **Never falls back to another type.** `label` and `matrix` are photographs of
 * the record rather than surfaces of the sleeve (§4.2 as amended by A21a), and
 * putting a close-up of the dead wax on the front face would be the app
 * asserting something false about what the sleeve looks like.
 *
 * First match rather than last: duplicate covers are legal, and the plane must
 * show a stable one rather than whichever the database returned last.
 */
export function coverTextureUrl(images: readonly ImageRow[]): string | null {
  return images.find((image) => image.imageType === 'cover')?.url ?? null;
}
