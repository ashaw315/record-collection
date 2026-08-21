import { SPINE_HEIGHT } from '../shelf/spine';
import { WALL_FOV_DEGREES, wallCameraDistance } from './wall-camera';

/**
 * Where a pulled record ends up — an explicit pose, not an accident.
 *
 * **The rise had no destination.** §10b: "it was on the shelf a moment ago and
 * now it is in your hands." Unit 19's CSS version interpolated from the spine's
 * rect to an explicit settled rect; the scene version only knew "forward by a
 * proportion of the camera distance" and kept the slot's own height. So where a
 * record settled depended on which row it came from: measured at 125 records, a
 * row-0 record landed 252 world units above the view centre — NDC y 0.838,
 * clipped against the top of the frame.
 *
 * **A proportion of the camera distance is the wrong quantity**, and that is the
 * deeper reason. The camera frames the whole wall, so its distance scales with
 * the collection — a fixed fraction of it is a different absolute depth on a
 * one-row wall than on a nine-row one, and the record arrives a different size.
 * The destination has to be derived from how big the record should LOOK, which
 * is a property of the record and the lens, not of how many records are owned.
 */

/**
 * How much of the frame's height the settled record fills.
 *
 * Big enough to read a cover, small enough that the wall is still visible
 * behind it — the record is in your hands, not pressed against the lens.
 */
const FRAME_FILL = 0.55;

export type PulledPose = { x: number; y: number; z: number };

export function pulledDestination({
  wallWidth,
  wallHeight,
  viewport,
  widthFill,
  layout,
  stackedCardHeight,
}: {
  wallWidth: number;
  wallHeight: number;
  /**
   * **Set when rendering on the wall, omitted for the pure-geometry tests.**
   *
   * The record's WIDTH only needs constraining when it is actually being shown:
   * the on-wall camera has the CANVAS aspect (a viewport aspect insets the wall
   * and breaks A24a, measured), so on a tall narrow canvas the record must be
   * pushed back to fit the frame's width. The tests that assert only WHERE the
   * record settles pass nothing and get the height-framed depth, unchanged.
   *
   * The dimensions themselves are not read — the width fit uses the canvas
   * aspect the camera already has — so this is a presence flag carrying its
   * reason, not a size input. Typed as the viewport it represents rather than a
   * bare boolean, so a caller passes what it means.
   */
  viewport?: { width: number; height: number };
  /**
   * How much of the frame's WIDTH the record fills when a viewport is given.
   * The stacked phone layout wants the record near full-bleed (≈0.9); the
   * default keeps the wall's framing (the record sits back in the scene). Only
   * consulted when `viewport` is set.
   */
  widthFill?: number;
  /**
   * **The A32 layout, which decides whether the record shifts up for the card.**
   *
   * `'flanked'` (the default) leaves the record on the camera axis — the panels
   * sit beside it and want it centred, and this is the shape verified at 1280.
   * `'stacked'` lifts the record into the upper part of the frame so the summary
   * card has room in a COLUMN beneath it, rather than floating over the scene.
   * The lift is only applied for `'stacked'`, so the flanking layout is
   * (see `stackedCardHeight` for how far it lifts)
   * byte-identical to before.
   */
  layout?: 'flanked' | 'stacked';
  /**
   * The stacked card's height in SCREEN pixels. The record lifts by half of it,
   * so the record's centre moves up by exactly what the card takes from the
   * bottom — centring the record in the space ABOVE the card rather than in the
   * whole viewport. Only consulted for `'stacked'`; defaults to a sensible card
   * height so an omitted value does not clip the record.
   */
  stackedCardHeight?: number;
}): PulledPose {
  const cameraZ = wallCameraDistance({ wallHeight });
  const halfAngle = (WALL_FOV_DEGREES * Math.PI) / 360;

  /*
    Solve for the distance at which a `SPINE_HEIGHT`-tall record fills
    `FRAME_FILL` of the frame's HEIGHT:

      frameHeight = 2 · distance · tan(halfAngle)
      SPINE_HEIGHT / frameHeight = FRAME_FILL
  */
  const byHeight = SPINE_HEIGHT / (2 * FRAME_FILL * Math.tan(halfAngle));

  /*
    **The aspect fix.** The camera's aspect is the CANVAS's — width/height of the
    wall — so the frame at a given depth is that ratio wide. On a tall narrow
    canvas (a phone: ~8:1 tall) a record framed by height alone is far too wide
    for the frame, and overflowed 4.5x. So the record must ALSO fit the viewport:
    pushed back until `SPINE_HEIGHT` fills at most `FRAME_FILL` of the frame's
    WIDTH, where the frame's width uses the canvas aspect the camera actually has.

      frameWidth = frameHeight · canvasAspect = 2 · distance · tan · (canvasW / canvasH)
      SPINE_HEIGHT / frameWidth = FRAME_FILL   ->   distance = SPINE_HEIGHT / (2 · FRAME_FILL · tan · canvasAspect)

    The record settles at whichever distance is FURTHER — the binding constraint,
    because further is smaller and a record that fits width and height both is at
    the max of the two. With no viewport, height alone decides, as before.
  */
  const canvasAspect = wallWidth / wallHeight;
  const byWidth =
    viewport === undefined
      ? 0
      : SPINE_HEIGHT / (2 * (widthFill ?? FRAME_FILL) * Math.tan(halfAngle) * canvasAspect);

  const distance = Math.max(byHeight, byWidth);

  /*
    **The stacked lift, computed in SCREEN space, not a magic fraction.** The
    record is centred on the camera axis — the middle of the viewport. The card
    is pinned to the bottom, so to sit the record ABOVE it in a column the
    record's centre must move up by half the card's height: that clears the
    card's band from the bottom and centres the record in what remains.

    A fixed fraction of the frame was tried (0.18) and clipped the record off the
    top — it does not track the viewport height or the card height, and a lift
    that only works at one screen size is the "which frame" trap this unit keeps
    hitting. So the lift is a screen quantity (half the card height) converted to
    world units at the record's depth.
  */
  const frameHeightAtRecord = 2 * distance * Math.tan(halfAngle);
  const DEFAULT_CARD_HEIGHT = 200;
  let lift = 0;
  if (layout === 'stacked' && viewport !== undefined) {
    /*
      **The record's on-screen size maps through the CANVAS height, not the
      viewport height.** The canvas is drawn at 1 world unit = 1 px and is as
      tall as the whole wall (`wallHeight`), not the viewport — only a slice of
      it is visible. A first version divided by `viewport.height` and lifted the
      record 3.5x too far, clipping it off the top: the seventh "which frame"
      error in this unit, and again a screenshot caught what the number hid.

      `wallHeight` world units map to `wallHeight` canvas px, so the record
      (SPINE_HEIGHT world) is `SPINE_HEIGHT / frameHeightAtRecord * wallHeight`
      px on screen. The lift converts half the card's height from those px back
      to world.
    */
    const recordScreenPx = (SPINE_HEIGHT / frameHeightAtRecord) * wallHeight;
    const worldPerScreenPx = SPINE_HEIGHT / recordScreenPx;
    const halfCard = (stackedCardHeight ?? DEFAULT_CARD_HEIGHT) / 2;
    lift = halfCard * worldPerScreenPx;
  }

  return {
    // Centred across the wall.
    x: wallWidth / 2,

    /**
     * **On the camera's axis**, which is the wall's centre.
     *
     * Two other answers were tried and measured wrong, and the reason is worth
     * recording: the camera is FIXED on the wall's centre, because A24b forbids
     * panning it. So "where the reader is looking" is not a property of the
     * scroll position at all — whatever is on the camera's axis is what appears
     * in the middle of the frame. Centring the record on the window put it at
     * NDC 0.62, and on the visible slice of the wall at 0.93; both are exactly
     * the offset from the axis, projected.
     *
     * That the wall may extend past the window is a SCROLL question, and the
     * canvas scrolls with the page — which is what the fixed camera bought.
     */
    // Camera axis, lifted for the stacked layout so a card fits beneath.
    y: -wallHeight / 2 + lift,
    z: cameraZ - distance,
  };
}
