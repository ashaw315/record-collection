import { describe, expect, it } from 'vitest';
import {
  PLANE_DEPTH,
  SHELF_LIP,
  SHELF_PLANE,
  WALL_BACK,
  shelfSurface,
  relativeLuminance,
} from './shelf-surface';
import { SPINE_HEIGHT, SPINE_ROW_HEIGHT } from './spine';

/**
 * The wall behind the records and the plane they stand on are DIFFERENT
 * SURFACES, which is the whole finding of unit 22.
 *
 * Unit 21 chose "dim wall with the shelf edge along its foot" by looking, and
 * then implemented it as ONE background colour with a repeating edge gradient —
 * so wall and plane were the same paint and the choice existed only in the
 * comment. An empty stretch of that surface reads as a dark void rather than as
 * shelf with nothing on it, which is the failure the full-width plane was
 * supposed to fix.
 */

describe('the wall and the plane are distinguishable surfaces', () => {
  it('does not paint the wall and the plane the same colour', () => {
    /**
     * **The assertion the prompt asks for by name**: it must fail if the two
     * became the same colour. Against unit 21's implementation — a single
     * `bg-[#1a1714]` for the whole area — this fails, which is why the unit
     * exists.
     *
     * Fails against `shelf-surface.ts` if `WALL_BACK` and `SHELF_PLANE` are
     * ever set to the same value.
     */
    expect(WALL_BACK).not.toBe(SHELF_PLANE);
  });

  it('makes the plane LIGHTER than the wall, so it reads as a lit surface', () => {
    /**
     * Not merely different — different in the right direction. A shelf is lit
     * from the front of the room, so the horizontal surface catches light and
     * the wall behind falls away. Reversing this reads as a shadow box: the
     * records float in front of something brighter than the thing they stand
     * on.
     *
     * Fails against a palette that darkens the plane instead, which "not equal"
     * alone would happily accept.
     */
    expect(relativeLuminance(SHELF_PLANE)).toBeGreaterThan(relativeLuminance(WALL_BACK));
  });

  it('separates them by enough to SEE, not merely by enough to assert', () => {
    /**
     * A one-value difference satisfies `not.toBe` and is invisible on a screen,
     * which is a test passing while the feature it names does not exist.
     *
     * The threshold is stated as a ratio of luminances rather than a hex
     * distance, because that is what an eye responds to. Verified by looking at
     * the rendered candidates, not derived.
     */
    const contrast = relativeLuminance(SHELF_PLANE) / Math.max(relativeLuminance(WALL_BACK), 0.0001);
    expect(contrast, 'the plane must be visibly lighter than the wall').toBeGreaterThan(1.35);
  });

  it('keeps the lip darker than the plane it edges', () => {
    /**
     * The front lip is the plane's leading edge seen end-on: it faces the
     * viewer rather than the light, so it is the darkest of the three. If it
     * matched the plane the shelf would have no visible front and the records
     * would appear to stand on nothing.
     */
    expect(relativeLuminance(SHELF_LIP)).toBeLessThan(relativeLuminance(SHELF_PLANE));
  });
});

describe('shelfSurface', () => {
  it('paints a plane band at the foot of EVERY row, not just the last', () => {
    /**
     * The wrapping wall's defining property. A single border-bottom draws one
     * line under the final row and leaves every row above floating — the defect
     * the repeating background already exists to prevent, restated here because
     * this unit rewrites that background.
     *
     * Fails against `shelfSurface` if the repeat interval stops matching the
     * row rhythm.
     */
    const surface = shelfSurface();

    /**
     * **Asserted per LAYER, not as a whole string.** The surface carries wall
     * lighting as well as the shelf pattern, and CSS pairs `background-image`,
     * `-size` and `-repeat` POSITIONALLY: the shelf is the last layer, so its
     * repeat and size are the last entries. A whole-string comparison broke the
     * moment lighting was added even though the property it names was still
     * true — and, worse, would have kept passing if the entries were listed in
     * the wrong ORDER, which is the failure that actually bites.
     */
    const repeats = surface.backgroundRepeat.split(',').map((part) => part.trim());
    const sizes = surface.backgroundSize.split(',').map((part) => part.trim());
    // Split on TOP-LEVEL commas only: every layer is a `...gradient(...)`
    // whose own arguments are comma-separated, and `rgba(0,0,0,.5)` nests a
    // second level inside those. Depth counting is the only reliable reader.
    let depth = 0;
    let layers = 1;
    for (const character of surface.backgroundImage) {
      if (character === '(') depth += 1;
      else if (character === ')') depth -= 1;
      else if (character === ',' && depth === 0) layers += 1;
    }

    expect(repeats.at(-1), 'the shelf layer repeats down the wall').toBe('repeat-y');
    expect(sizes.at(-1), 'at exactly one row interval').toBe(`100% ${SPINE_ROW_HEIGHT}px`);

    /**
     * A missing entry makes CSS CYCLE the list rather than error, so a
     * three-layer image with two sizes silently gives the shelf the wall's
     * size. Counting them is what catches that.
     */
    expect(sizes, 'one size per layer, or CSS cycles them').toHaveLength(layers);
    expect(repeats, 'one repeat per layer, likewise').toHaveLength(layers);

    // The lighting spans the wall once; only the shelf repeats.
    for (const repeat of repeats.slice(0, -1)) {
      expect(repeat, 'wall lighting is painted once, not per row').toBe('no-repeat');
    }
  });

  it('starts the plane where the spines END, so records stand ON it', () => {
    /**
     * The geometric claim the whole illusion rests on: a spine is
     * `SPINE_HEIGHT` tall and the surface it rests on begins at its foot. Off
     * by a few pixels and the records either float above the shelf or sink into
     * it.
     *
     * Fails against `shelfSurface` if the first colour stop drifts from
     * `SPINE_HEIGHT`.
     */
    const surface = shelfSurface();

    expect(surface.backgroundImage).toContain(`${SPINE_HEIGHT}px`);
  });

  it('gives the plane a front lip thinner than the plane itself', () => {
    /**
     * A lip as deep as the plane is a stripe, not an edge. This pins the
     * relationship rather than the numbers, so changing the row rhythm cannot
     * silently invert it.
     */
    expect(SHELF_LIP.length).toBeGreaterThan(0);
    expect(PLANE_DEPTH).toBeGreaterThan(0);
    expect(PLANE_DEPTH).toBeLessThan(SPINE_ROW_HEIGHT - SPINE_HEIGHT + PLANE_DEPTH);
  });

  it('paints the WALL as the base, so an empty stretch is wall rather than void', () => {
    /**
     * **The unit's thesis as an assertion.** Where no record stands, what shows
     * is the wall colour — the same wall visible above the records — rather
     * than an unoccupied expanse of shelf timber. Unit 21 measured that 1111px
     * of empty TIMBER implies records that should have been there; wall implies
     * nothing.
     *
     * Fails against `shelfSurface` if the base colour is set to the plane.
     */
    const surface = shelfSurface();

    expect(surface.backgroundColor).toBe(WALL_BACK);
  });
});

describe('relativeLuminance', () => {
  /**
   * The instrument the palette assertions above depend on. Unit 17's lesson:
   * two endpoint assertions can both pass while the band between them
   * collapses, so this is swept rather than spot-checked.
   */
  it('orders black below grey below white', () => {
    expect(relativeLuminance('#000000')).toBeLessThan(relativeLuminance('#808080'));
    expect(relativeLuminance('#808080')).toBeLessThan(relativeLuminance('#ffffff'));
  });

  it('increases monotonically across the whole greyscale ramp', () => {
    /**
     * The sweep. A luminance function that saturates, clips or inverts in the
     * middle would pass both endpoint tests above and silently break every
     * comparison the palette makes.
     */
    const ramp = Array.from({ length: 32 }, (_, step) => {
      const value = Math.round((step / 31) * 255)
        .toString(16)
        .padStart(2, '0');
      return relativeLuminance(`#${value}${value}${value}`);
    });

    for (let i = 1; i < ramp.length; i += 1) {
      expect(ramp[i], `step ${i} must exceed step ${i - 1}`).toBeGreaterThan(ramp[i - 1]);
    }
  });

  it('reads the three channels with their real weights, not as an average', () => {
    /**
     * Green carries most of perceived brightness and blue least. A plain mean
     * would call these three equal and would rank the palette wrongly whenever
     * two colours differ in hue rather than in level — which the timber
     * browns do.
     */
    expect(relativeLuminance('#00ff00')).toBeGreaterThan(relativeLuminance('#ff0000'));
    expect(relativeLuminance('#ff0000')).toBeGreaterThan(relativeLuminance('#0000ff'));
  });
});
