import { SHELF_EDGE, SPINE_HEIGHT, SPINE_ROW_HEIGHT } from './spine';

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

/** The lip below it, thinner still — whatever is left of the shelf's depth. */
export const LIP_DEPTH = SHELF_EDGE - PLANE_DEPTH;

/**
 * How tall the wall is: the viewport, less what sits above it.
 *
 * **A24a has said this since the amendment and it had never been implemented.**
 * "The shelf is a view that owns the screen, not a section of a page. Below the
 * nav there is the wall and nothing else." Unit 21 moved the controls off the
 * wall and nothing filled the space they left, so the wall stayed exactly as
 * tall as its own contents.
 *
 * That is what made every treatment of the empty space fail. A container sized
 * by its contents has no empty space to treat: at five records it was a 268px
 * band floating in a 900px page, and it read as a widget however it was
 * painted. Three rounds of colour candidates were all painting a box that was
 * the wrong shape.
 *
 * **Set from the viewport rather than from the row count**, so five records and
 * five hundred get the same wall and the difference between them is how much of
 * it is occupied — which is the whole point of a wall scanned by eye.
 *
 * `svh` rather than `vh`: on a phone `vh` is the viewport with the browser
 * chrome RETRACTED, so a `100vh` wall is taller than the screen at rest and its
 * shelf line sits permanently under the address bar. `svh` is the smallest
 * state, which is the one that is always visible.
 */
export const WALL_OFFSET_PX = 205;

/** The wall fills what is left of the screen below the nav and the controls. */
export const WALL_MIN_HEIGHT = `calc(100svh - ${WALL_OFFSET_PX}px)`;

/**
 * The WALL's own surface — and it is now only the wall.
 *
 * **This used to paint all three surfaces as one background on one box, and
 * that was the defect three rounds of colour candidates could not reach.** The
 * shelf plane was a gradient stop inside a repeating pattern, so it had no
 * position anything could be measured against and no existence independent of
 * the box it was painted on. Records could not stand on it because it was not a
 * thing; it was a stripe.
 */
export function shelfSurface(): {
  backgroundColor: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: string;
} {
  /**
   * What makes the wall read as a WALL rather than as a void.
   *
   * Chosen by looking, against a flat baseline. A flat `WALL_BACK` field is a
   * correct colour and an empty image, and the eye reads *nothing there* rather
   * than *wall*. Two gradients fix it without adding an object: light rising
   * from the foot, as a room lit from the front puts on the wall just above a
   * surface, and the top falling away so the wall recedes instead of ending.
   *
   * Neither has a hard boundary, which is the point — a boundary is what turned
   * every candidate width in unit 21 into a box. These are the only soft edges
   * in the surface, and they are soft because light is.
   */
  const wallLight =
    'linear-gradient(to bottom, rgba(0,0,0,.55) 0%, rgba(0,0,0,0) 35%), ' +
    'radial-gradient(140% 70% at 50% 100%, rgba(255,238,215,.10) 0%, rgba(0,0,0,0) 70%)';

  return {
    backgroundColor: WALL_BACK,
    backgroundImage: wallLight,
    /*
      The lighting spans the whole wall ONCE. Two layers, two sizes, two
      repeats, in the same order — CSS pairs them positionally and a short list
      cycles silently rather than erroring.
    */
    backgroundSize: '100% 100%, 100% 100%',
    backgroundRepeat: 'no-repeat, no-repeat',
  };
}

/**
 * The shelf drawn under EVERY row, and the ONLY thing that draws a shelf.
 *
 * **One mechanism, after four attempts at two.** A repeating background for the
 * wrapped rows plus an element for the last one produced a doubled shelf line
 * every time — 8px apart, then 3px, then a stray band in the padding — because
 * "where does the last row end" is a question a repeating background cannot
 * answer and an element cannot ask. Every version of that seam was invisible to
 * rect assertions, because a background has no box, and obvious in a
 * screenshot.
 *
 * A per-spine shelf was tried too: seam-free, and it stops where the records
 * stop, which breaks §10b's plane rule outright.
 *
 * So the repeat draws all of them. How many spines fit on a row is the
 * browser's decision from a width the server never sees, and the repeat follows
 * that layout rather than predicting it. The shelf line has no element of its
 * own; it is the row rhythm, and a spine's foot IS where it falls — which is
 * what the foot assertion measures against.
 */
export function shelfRows(): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: string;
  backgroundPosition: string;
  backgroundOrigin: string;
  backgroundClip: string;
} {
  return {
    /*
      Lit surface over dark lip, as hard stops. The plane catches light from the
      front of the room; the lip faces the viewer rather than the light and is
      the darkest of the three. Softening this read as a grey smear resembling a
      loading state — furniture has edges.
    */
    /*
      One tile is a row of spines with its shelf beneath: `SPINE_HEIGHT` of
      nothing, then the lit plane, then the lip. Bottom-anchored, so the last
      tile's shelf lands under the last row's feet and the pattern tiles upward
      from there — a shelf under every row, and adding a record cannot shift the
      ones above it.
    */
    backgroundImage: `linear-gradient(to bottom, transparent 0, transparent ${SPINE_HEIGHT}px, ${SHELF_PLANE} ${SPINE_HEIGHT}px, ${SHELF_PLANE} ${SPINE_HEIGHT + PLANE_DEPTH}px, ${SHELF_LIP} ${SPINE_HEIGHT + PLANE_DEPTH}px, ${SHELF_LIP} ${SPINE_ROW_HEIGHT}px)`,
    backgroundSize: `100% ${SPINE_ROW_HEIGHT}px`,
    backgroundRepeat: 'repeat-y',
    /*
      **Anchored to the BOTTOM, because that is where the rows are anchored.**

      Spines are `items-end`, so every row's feet sit at the bottom of its line
      box and the last row's at the bottom of the content box. Anchoring to the
      top instead assumes the first row begins exactly at the padding edge — it
      does not, and the shelves then land `padding-top` above every set of feet.
      Measured: the painted band at y=445 with the feet at y=465, a 20px gap
      that no rect assertion in this project could see, because a background has
      no box.

      Bottom-anchoring also means the repeat grows upward from the last row, so
      adding a record cannot shift the shelves under the rows above it.
    */
    backgroundPosition: 'left bottom',
    /*
      `padding-box`, so the bottom anchor is the box's padding edge — which the
      rows region extends one shelf below the last row's feet, giving that shelf
      somewhere to be drawn. With `content-box` the anchor is the feet
      themselves and the last shelf lands 8px above them, inside the row.
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
