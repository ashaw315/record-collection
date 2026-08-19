import { describe, expect, it } from 'vitest';
import { spineLabelPlan } from './spine-texture';
import { SPINE_HEIGHT } from '../shelf/spine';

/**
 * How a spine's text becomes something WebGL can draw.
 *
 * **Text in a scene is not free**, and the legibility bar is the one already
 * set: readable at real size without hovering, at roughly 1:12. The CSS wall
 * got that from a rotated 9px mono span; a canvas-textured label has to earn it
 * the same way, and the thing that decides it is how many device pixels the
 * glyphs get.
 *
 * The PLAN is pure and testable — dimensions, orientation, pixel density, and
 * what string to draw. The drawing itself is a canvas call and is not.
 */

describe('spineLabelPlan', () => {
  it('renders the label along the spine, not across it', () => {
    /**
     * §10b: spine text is "set in mono, rotated" — a spine is 17-24px wide and
     * 240px tall, so the text runs along its length. A plan that laid the text
     * across the spine would have ~20px to work with and could hold two glyphs.
     *
     * Fails against `spineLabelPlan` if width and height are not swapped
     * relative to the spine's own proportions.
     */
    const plan = spineLabelPlan({ text: 'ARTIST TITLE CAT-1', spineWidth: 20 });

    expect(plan.canvasWidth, 'the long axis carries the text').toBeGreaterThan(plan.canvasHeight);
    expect(plan.rotated, 'and the texture is turned onto the spine').toBe(true);
  });

  it('gives the glyphs enough device pixels to be read at real size', () => {
    /**
     * **The legibility bar, as a number.** A 20px-wide spine drawn at 1:1 gives
     * a 9px glyph about 9 device pixels — which is what the CSS wall had, and
     * it was legible because the browser hinted and antialiased it as text. A
     * texture gets no hinting, so it needs supersampling to match.
     *
     * Fails against a plan that textures at 1:1, which looks correct in code
     * and reads as mush on screen.
     */
    const plan = spineLabelPlan({ text: 'ARTIST TITLE CAT-1', spineWidth: 20 });

    expect(plan.pixelRatio, 'supersampled, because a texture is not hinted').toBeGreaterThanOrEqual(
      3,
    );
    expect(plan.canvasWidth).toBeGreaterThanOrEqual(SPINE_HEIGHT * 3);
  });

  it('scales the canvas to the SPINE it is for, not to a fixed size', () => {
    /**
     * Spines vary 17-24px (§10b's 1:12 spread, which gives the wall texture
     * rather than a barcode). A fixed texture size would stretch the text on
     * wide spines and squeeze it on narrow ones — the same glyph reading two
     * different weights across the wall.
     */
    const narrow = spineLabelPlan({ text: 'X', spineWidth: 17 });
    const wide = spineLabelPlan({ text: 'X', spineWidth: 24 });

    expect(wide.canvasHeight).toBeGreaterThan(narrow.canvasHeight);
    expect(narrow.canvasWidth, 'the long axis is the spine height, shared').toBe(wide.canvasWidth);
  });

  it('sizes the font from the spine width, so it fits across the spine', () => {
    /**
     * The constraint that decides legibility: a glyph must fit ACROSS a 17px
     * spine. Deriving the font size from the width rather than fixing it is
     * what keeps that true when the proportion changes — §10b states 1:12 as a
     * rule, and `MIN_SPINE_WIDTH` is already derived from `SPINE_HEIGHT` for
     * exactly this reason.
     */
    const narrow = spineLabelPlan({ text: 'X', spineWidth: 17 });
    const wide = spineLabelPlan({ text: 'X', spineWidth: 24 });

    expect(narrow.fontPx).toBeLessThan(wide.fontPx);

    /*
      **Compared in WALL pixels, not device pixels.** The first version of this
      assertion tested `fontPx <= 17` and failed against correct code, because
      `fontPx` is supersampled — 32 device pixels IS 10.6 wall pixels on a 17px
      spine. Two units in one comparison, which is this project's recurring
      defect appearing in a test rather than in the code under test.
    */
    expect(
      narrow.fontPx / narrow.pixelRatio,
      'a glyph fits across the narrowest spine',
    ).toBeLessThanOrEqual(17);
  });

  it('draws exactly the text it was given, truncation already applied', () => {
    /**
     * `spineText` owns truncation and its budget, and has its own tests. This
     * plan must not re-truncate: two places deciding what fits is the
     * two-systems-share-a-number smell, and the accessible name carries the
     * UNTRUNCATED title precisely because the visible string is not the record's
     * identity.
     */
    const text = 'Discharge  Hear Nothing  DIS-1';
    const plan = spineLabelPlan({ text, spineWidth: 20 });

    expect(plan.text).toBe(text);
  });

  it('handles an empty label without producing a zero-sized canvas', () => {
    /**
     * A record with no artist, no title and no catalogue number is not
     * reachable through the API, but a zero-width canvas throws in WebGL rather
     * than drawing nothing — a silent-failure shape this feature keeps meeting.
     */
    const plan = spineLabelPlan({ text: '', spineWidth: 20 });

    expect(plan.canvasWidth).toBeGreaterThan(0);
    expect(plan.canvasHeight).toBeGreaterThan(0);
  });

  it('is deterministic, so the same spine always textures identically', () => {
    const a = spineLabelPlan({ text: 'ARTIST', spineWidth: 20 });
    const b = spineLabelPlan({ text: 'ARTIST', spineWidth: 20 });

    expect(a).toEqual(b);
  });
});
