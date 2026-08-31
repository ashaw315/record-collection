/**
 * The wall's camera: ONE perspective camera with a very long focal length.
 *
 * **A24b and §10b conflict under a single camera, and this resolves it.**
 *
 * A24b: the wall is viewed square on, no perspective, so every spine is at the
 * same angle and equally legible — because §10b requires artist, title and
 * catalogue number readable on every spine, and Criterion's raking room
 * foreshortens the ones toward the edges.
 *
 * §10b: a record leaving the shelf turns from edge-on to face-on.
 *
 * Both were specified independently and they cannot both hold under an
 * ORTHOGRAPHIC camera. A rotation about Y with no convergence is a pure
 * horizontal squash: the two vertical edges stay parallel and the face simply
 * narrows by cos(angle). Measured on `/plane` twice — once it turned past
 * face-on and back, once it filled the wall with covers — before the camera
 * itself was suspected.
 *
 * A long lens keeps A24b's REASON while relaxing its literal wording. Across
 * the wall the convergence is negligible, so spines at the edge are as legible
 * as at the centre. The pulled record is much closer to the camera, where the
 * same lens converges strongly enough for a turn to read as a turn.
 *
 * One camera. No switching, no blend, no two systems agreeing about a midpoint.
 */

/**
 * The vertical field of view, in degrees.
 *
 * **Long, not normal.** A 50mm-equivalent lens is about 40°; this is a heavy
 * telephoto, which is what makes a flat subject read flat. Chosen as the widest
 * angle that still keeps an edge spine within 3% of a centre spine on a 3440px
 * display — measured rather than picked, and swept across widths because the
 * compression grows with how far off-axis the outermost spine sits.
 */
export const WALL_FOV_DEGREES = 16;

/**
 * How far toward the camera a pulled record travels, as a fraction of the
 * camera's distance from the wall.
 *
 * **Relative, not a fixed number of pixels, and that is what makes the long
 * lens work.** Convergence depends on how much CLOSER the record is than the
 * wall, in proportion — a fixed 420px pull is 4% of the way at this focal
 * length and produces almost no turn. Swept and measured:
 *
 *   FOV   edge compression @3440   convergence at 40% pull
 *    4°           0.06%                    1.038
 *   12°           0.55%                    1.120
 *   16°           0.97%                    1.164
 *   25°           2.37%                    1.271
 *   40°           6.03%                    1.487
 *
 * 16° with a 40% pull clears both bars at once: an edge spine within 1% of a
 * centre spine, and a turn that converges enough to read as a turn. Wider than
 * ~25° starts to cost visible edge compression, which is what A24b exists to
 * prevent; longer than ~12° cannot make the turn read at any sane pull depth.
 */
export const PULL_FRACTION = 0.4;

/**
 * How far back the camera stands so the wall exactly fills the frame.
 *
 * A long lens sees a narrow angle and therefore has to stand well back.
 * Derived from the wall's height rather than fixed, so five records and five
 * hundred are framed the same way — §10b's "a short collection reads as short,
 * not broken" applies to the camera as much as to the shelf plane.
 */
export function wallCameraDistance({ wallHeight }: { wallHeight: number }): number {
  const halfAngle = (WALL_FOV_DEGREES * Math.PI) / 360;
  return wallHeight / 2 / Math.tan(halfAngle);
}

/**
 * How much smaller a spine at the wall's edge projects than one at its centre.
 *
 * **This is A24b's requirement expressed as a number**, and the thing that
 * decides whether a long lens can stand in for an orthographic one. A spine at
 * the edge is further from the camera than one on the axis — by the hypotenuse
 * — so it projects slightly smaller. Under an orthographic camera this is
 * exactly 0; under a normal lens it is large enough to see.
 *
 * Returned as a fraction: 0.02 means the edge spine is 2% narrower.
 */
export function edgeCompression({ wallWidth }: { wallWidth: number }): number {
  /*
    Framing is driven by height, and a wall is wider than it is tall, so the
    camera distance for the WIDEST realistic wall is what this must hold at.
    Using the width as the framing dimension is the conservative reading: it
    puts the camera closer than height-framing would, so the compression this
    reports is never optimistic.
  */
  const distance = wallCameraDistance({ wallHeight: wallWidth });
  const halfWidth = wallWidth / 2;

  // Distance to the outermost spine, versus to one on the axis.
  const toEdge = Math.sqrt(distance * distance + halfWidth * halfWidth);

  // Projected size goes as 1/distance, so the shortfall is the ratio.
  return 1 - distance / toEdge;
}

/**
 * The camera's aspect ratio, which is a property of the APERTURE.
 *
 * **The wall's own ratio was used here and it is the wrong quantity.** The
 * canvas is as tall as the entire wall (`WallScene.tsx`: `height =
 * layout.height`), so `width / height` describes how many records are owned and
 * how they wrapped — content, not viewport. At 390px, 125 records wrap to ~10
 * rows and that ratio is ~0.12: the frame becomes a 52-unit slot and a
 * 240-unit record fills 457% of its width. Found on a real phone; the record
 * did not render at all, because the reader was inside a magnified sleeve.
 *
 * On a desktop the wall is wider than tall, so the two quantities are close
 * enough that nothing ever showed. **This is the arithmetic no test varied** —
 * `pulledDestination`'s own tests vary the RECORD COUNT and hold the viewport
 * fixed, which is the axis its defect lived on and not this one's.
 *
 * Height is never zero in practice — a viewport with no height renders nothing
 * — but it is guarded rather than asserted, because a NaN aspect propagates
 * silently into every projected position instead of failing where it is made.
 */
export function viewportAspect({
  width,
  height,
}: {
  width: number;
  height: number;
}): number {
  if (height <= 0) return 1;
  return width / height;
}


/**
 * **How far back the camera stands, framed on what the reader can SEE.**
 *
 * `wallCameraDistance` frames the whole WALL, so the camera's distance scales
 * with the collection — correct for the wall, and the cause of the pull-depth
 * defect `WallScene.tsx` described for weeks and never guarded:
 *
 *     "the camera distance scales with the collection, and that is fine for the
 *      camera and NOT fine for the pull depth. See PULL_DEPTH_CAP below."
 *
 * There was no below. And the defect is real: `pulledDestination` solves for a
 * CONSTANT distance (1552px at this FOV, from `FRAME_FILL`), so the record's
 * world position `cameraZ - 1552` moved with the collection — settling 561px
 * BEHIND the wall on a one-row collection and 7380px past the viewer at ten.
 *
 * **Pinning the record's depth was tried and reverted.** It breaks §10b's other
 * requirement, asserted next door: a record must land at the same APPARENT SIZE
 * at 5 records and at 125. Under a camera that scales, position and size cannot
 * both be constant — the two properties are in direct conflict.
 *
 * **Framing on the viewport removes the scaling rather than compensating for
 * it**, so both hold at once. The wall may be taller than the frame; that is a
 * scroll question, and the canvas scrolls with the page — which is what the
 * fixed camera bought in the first place.
 */
export function viewportCameraDistance({ viewportHeight }: { viewportHeight: number }): number {
  const halfAngle = (WALL_FOV_DEGREES * Math.PI) / 360;

  return viewportHeight / 2 / Math.tan(halfAngle);
}
