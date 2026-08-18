import { SPINE_HEIGHT, SPINE_ROW_HEIGHT } from './spine';

/**
 * The two surfaces §10b's wall is made of, and the reason they are two.
 *
 * **Unit 21 chose "dim wall with the shelf edge along its foot" and then
 * painted both with one colour.** The choice existed in a comment; the pixels
 * were a single `#1a1714` rectangle with an edge gradient repeating down it. An
 * empty stretch of that reads as a dark void — which is precisely the failure
 * the full-width plane was meant to fix, surviving the fix because nothing
 * asserted the two surfaces differed.
 *
 * So they are separated here, as values, where a test can compare them:
 *
 *   - `WALL_BACK` is what is BEHIND and ABOVE the records. It is not shelf. It
 *     is the base colour of the whole wall, so wherever no record and no plane
 *     is drawn, wall is what shows. That is what makes an under-filled shelf
 *     read as an under-filled shelf rather than as missing data: unit 21
 *     measured that 1111px of unoccupied TIMBER implies records that should
 *     have been there, while wall implies nothing.
 *   - `SHELF_PLANE` is the horizontal surface records stand ON, seen very
 *     slightly from above. It runs edge to edge because furniture does: a real
 *     shelf ends where the wall ends, not where the records do.
 *   - `SHELF_LIP` is the plane's front edge seen end-on.
 *
 * **The plane is lighter than the wall, and the lip darker than the plane.**
 * That ordering is the lighting: a room lit from the front puts light on the
 * horizontal surface, leaves the wall behind falling away, and turns the
 * forward-facing lip into the darkest of the three. Reversing any pair reads as
 * a shadow box rather than a shelf, which is why the ordering is asserted and
 * not just the difference.
 */

/** Behind and above the records. Not shelf. */
export const WALL_BACK = '#100e0d';

/** The horizontal surface records stand on, catching the light. */
export const SHELF_PLANE = '#4d3b2b';

/** The plane's front edge, facing the viewer rather than the light. */
export const SHELF_LIP = '#1d160f';

/**
 * How deep the lit surface of the plane is, in pixels.
 *
 * The plane is nearly edge-on — §10b A24b is square-on with no perspective — so
 * what is visible of a horizontal surface is a narrow band, not a slab. Deeper
 * than this and the shelf reads as a plinth each row stands on; shallower and
 * it disappears into its own lip.
 */
export const PLANE_DEPTH = 6;

/** The lip below it, thinner still. */
export const LIP_DEPTH = SPINE_ROW_HEIGHT - SPINE_HEIGHT - PLANE_DEPTH;

/**
 * The repeating background that paints a shelf under EVERY row.
 *
 * A `border-bottom` would draw one line beneath the final row and leave the
 * rows above floating; the repeat is what makes wrapping look like a bookcase.
 * The interval is `SPINE_ROW_HEIGHT`, derived from the spine height rather than
 * restated, so the two cannot drift.
 *
 * Returned as a style object rather than written inline so the relationships
 * above can be asserted without rendering a component.
 */
export function shelfSurface(): {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: string;
  backgroundOrigin: string;
  backgroundClip: string;
} {
  const planeEnd = SPINE_HEIGHT + PLANE_DEPTH;

  /**
   * What makes the wall read as a WALL rather than as a void.
   *
   * Chosen by looking, at five records, against a flat baseline. A flat
   * `WALL_BACK` field is a correct colour and an empty image: at five records
   * it is 240px of featureless black and the eye reads *nothing there* rather
   * than *wall*. Two gradients fix it without adding an object:
   *
   *   - light rising from the shelf line, as a room lit from the front puts on
   *     the wall just above a surface;
   *   - the top falling away, so the wall recedes instead of ending.
   *
   * Neither has a hard boundary, which is the point — a boundary is what turned
   * every candidate width in unit 21 into a box. These are the only soft edges
   * in the surface, and they are soft because light is.
   */
  const wallLight =
    'linear-gradient(to bottom, rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 40%), ' +
    'radial-gradient(120% 90% at 50% 115%, rgba(255,238,215,.09) 0%, rgba(0,0,0,0) 65%)';

  return {
    /*
      The WALL is the base. Everything not explicitly painted as shelf is wall,
      which is what makes the empty portion read as wall rather than as timber
      nobody filled.
    */
    backgroundColor: WALL_BACK,
    /*
      Hard stops, not blends. A softened edge was tried in unit 21 and read as a
      grey smear resembling a loading state; furniture has edges.
    */
    backgroundImage: `${wallLight}, linear-gradient(to bottom, transparent 0, transparent ${SPINE_HEIGHT}px, ${SHELF_PLANE} ${SPINE_HEIGHT}px, ${SHELF_PLANE} ${planeEnd}px, ${SHELF_LIP} ${planeEnd}px, ${SHELF_LIP} ${SPINE_ROW_HEIGHT}px)`,
    /*
      The lighting spans the whole wall ONCE; only the shelf pattern repeats per
      row. Three layers, three sizes, three repeats — in the same order, because
      CSS pairs them positionally and a missing entry silently cycles.
    */
    backgroundSize: `100% 100%, 100% 100%, 100% ${SPINE_ROW_HEIGHT}px`,
    backgroundRepeat: 'no-repeat, no-repeat, repeat-y',
    /*
      Painted in the padding box, so the pattern starts under the container's
      top padding automatically. An explicit offset double-counted it in unit 6
      and floated the timber above the first row.
    */
    backgroundOrigin: 'padding-box',
    backgroundClip: 'padding-box',
  };
}

/**
 * Perceived brightness of a hex colour, 0 to 1.
 *
 * **Exists so the palette's ORDERING can be asserted rather than eyeballed.**
 * "The plane is lighter than the wall" is the lighting decision this file
 * makes, and comparing hex strings cannot check it — `#3d3025` and `#141110`
 * sort by neither channel consistently.
 *
 * Rec. 709 coefficients, applied to linearised channels. The weights are the
 * point: green carries most of perceived brightness and blue least, so a plain
 * mean would rank two timber browns that differ in hue rather than in level
 * exactly backwards.
 */
export function relativeLuminance(hex: string): number {
  const normalised = hex.replace('#', '');
  const channel = (offset: number): number => {
    const value = parseInt(normalised.slice(offset, offset + 2), 16) / 255;
    // sRGB transfer curve: the stored value is not proportional to light.
    return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  };

  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}
