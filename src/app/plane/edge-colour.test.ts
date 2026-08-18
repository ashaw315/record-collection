import { describe, expect, it } from 'vitest';
import { DEFAULT_SPINE_COLOUR } from '../shelf/spine';
import { EDGE_MIN_SEPARATION, edgeColourFor, relativeLuminance } from './edge-colour';

/**
 * The fallback sleeve's edge, which unit 16 found reads as a plane rather than
 * an object.
 *
 * **This is the face every record shows today** — production has three covers
 * and zero backs — so the object reads least like an object in the common case.
 * An untextured surface gives light nothing to reveal, which is the original QA
 * complaint one layer down.
 *
 * The fix is tonal separation between edge and face when both are the same flat
 * colour. The hazard, stated in the unit: **a rule that separates at
 * mid-lightness and collapses at the extremes is the same defect in a new
 * place.** Darkening a near-black sleeve does nothing at all.
 */

/** The real extremes, measured from actual covers rather than invented. */
const GRAVE_NEW_WORLD = '#3b332b'; // near-black airbrush, ~18% lightness
const DIRE_STRAITS = '#d8cbb8'; // near-white sleeve, ~78% lightness

describe('edgeColourFor — the edge must separate from the face at every lightness', () => {
  it('separates from a near-BLACK face, where darkening would do nothing', () => {
    /**
     * **The extreme that a naive "darken by 20%" rule fails**, and the reason
     * this function exists rather than a CSS filter.
     *
     * Grave New World's sleeve is ~18% lightness. Multiplying it by 0.8 moves it
     * about 3 levels — invisible — and the edge collapses into the face exactly
     * where unit 16 photographed it collapsing. So a dark face must take a
     * LIGHTER edge.
     *
     * Fails against `edgeColourFor`'s direction choice.
     */
    const face = relativeLuminance(GRAVE_NEW_WORLD);
    const edge = relativeLuminance(edgeColourFor(GRAVE_NEW_WORLD));

    expect(edge, 'a dark sleeve needs a lighter edge, not a darker one').toBeGreaterThan(face);
    expect(Math.abs(edge - face)).toBeGreaterThanOrEqual(EDGE_MIN_SEPARATION);
  });

  it('separates from a near-WHITE face, where lightening would do nothing', () => {
    /**
     * The mirror extreme, asserted separately because a rule that always
     * lightens passes the test above and fails here — and a pale sleeve with a
     * paler edge is the same invisible seam in the other direction.
     *
     * Fails against `edgeColourFor` if the direction is fixed rather than chosen
     * from the face.
     */
    const face = relativeLuminance(DIRE_STRAITS);
    const edge = relativeLuminance(edgeColourFor(DIRE_STRAITS));

    expect(edge, 'a light sleeve needs a darker edge').toBeLessThan(face);
    expect(Math.abs(edge - face)).toBeGreaterThanOrEqual(EDGE_MIN_SEPARATION);
  });

  it('separates by at least the minimum across the WHOLE range', () => {
    /**
     * **The sweep, and it is the test that matters.** Unit 16's defect was not
     * "the edge is wrong for this colour" — it was that the rule held in the
     * middle and failed at an end. Two spot checks at the extremes could both
     * pass while some band between them collapses, so this walks the range.
     *
     * Fails against any implementation with a dead zone — a fixed multiplier, a
     * fixed offset, or a threshold that flips direction without guaranteeing
     * magnitude either side of it.
     */
    for (let level = 0; level <= 255; level += 5) {
      const hex = `#${level.toString(16).padStart(2, '0').repeat(3)}`;
      const separation = Math.abs(
        relativeLuminance(edgeColourFor(hex)) - relativeLuminance(hex),
      );

      expect(separation, `${hex} separates by only ${separation.toFixed(3)}`).toBeGreaterThanOrEqual(
        EDGE_MIN_SEPARATION,
      );
    }
  });

  it('keeps the edge a plausible sleeve edge, not a stripe', () => {
    /**
     * Fails against the separation constant if it grows. The edge is card seen
     * side-on: it should read as the same object in different light, not as a
     * contrasting band painted along the side. §10b's spines already learned
     * this — "thickness reads through lightness, not hue".
     *
     * Asserted as a ceiling on the constant itself so the next person raising it
     * to fix some other case has to argue with this line.
     */
    expect(EDGE_MIN_SEPARATION).toBeGreaterThan(0.04);
    expect(EDGE_MIN_SEPARATION).toBeLessThan(0.2);
  });

  it('returns a hex colour three.js can parse', () => {
    /**
     * Fails against the formatting. A malformed colour string is not an error in
     * three.js — it warns and renders black — so a subtly wrong format produces
     * a black edge on every record, which looks like a deliberate design choice
     * rather than a bug. That is the silent-failure shape this feature keeps
     * meeting.
     */
    expect(edgeColourFor(GRAVE_NEW_WORLD)).toMatch(/^#[0-9a-f]{6}$/);
    expect(edgeColourFor(DIRE_STRAITS)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('falls back rather than throwing on a malformed stored colour', () => {
    /**
     * Fails against the guard. `spine_colour` is TEXT with no CHECK (§4.2), so a
     * hand-edited row can hold anything — and the same reasoning `textColourOn`
     * records applies: a renderer that throws on one bad row renders nothing at
     * all, losing the whole object to one record.
     */
    expect(() => edgeColourFor('not-a-colour')).not.toThrow();
    expect(edgeColourFor('not-a-colour')).toBe(edgeColourFor(DEFAULT_SPINE_COLOUR));
    expect(edgeColourFor(null)).toBe(edgeColourFor(DEFAULT_SPINE_COLOUR));
  });
});

describe('relativeLuminance', () => {
  it('ranks blue below yellow, which a max-channel rule inverts', () => {
    /**
     * Fails against the coefficients if they are equal weights. This is the same
     * reasoning `textColourOn` records: pure blue has a high channel value and
     * is dark to the eye, pure yellow the reverse. The edge rule inherits it
     * because it is choosing a DIRECTION from perceived brightness, and getting
     * that backwards would lighten an already-light sleeve.
     */
    expect(relativeLuminance('#0000ff')).toBeLessThan(relativeLuminance('#ffff00'));
  });

  it('spans 0 to 1 for black and white', () => {
    // Fails against the normalisation if it returns 0-255.
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 6);
  });
});
