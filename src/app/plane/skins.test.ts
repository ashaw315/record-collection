import { describe, expect, it } from 'vitest';
import { DEFAULT_SPINE_COLOUR } from '../shelf/spine';
import { centredSquareUv, hasGatefold, resolveSkins, type SkinSources } from './skins';

/**
 * Which image goes on which surface of §10b's object, and what a surface shows
 * when its image does not exist.
 *
 * **The fallbacks are the common case, not the edge case.** Production has
 * three `cover` rows, zero `back`, and no inner leaves at all, so every record
 * testable today shows a fallback back. These tests treat that as the primary
 * path because it is what the object actually looks like, and will be for a
 * long time.
 */

const plain: SkinSources = {
  coverUrl: null,
  backUrl: null,
  gatefoldLeftUrl: null,
  gatefoldRightUrl: null,
  spineColour: null,
};

describe('resolveSkins — which image goes on which face', () => {
  it('puts the cover on the front and the back photograph on the back', () => {
    /**
     * Fails against `resolveSkins`'s `front`/`back` assignments. §10b: the
     * front is the `cover` image and the back is the `back` photograph. Swapping
     * them is invisible on a record whose two faces are both photographed and
     * obvious on every other one — the kind of wrong that survives a demo.
     */
    const skins = resolveSkins({
      ...plain,
      coverUrl: 'https://blob.example/cover.jpg',
      backUrl: 'https://blob.example/back.jpg',
    });

    expect(skins.front).toEqual({ kind: 'texture', url: 'https://blob.example/cover.jpg' });
    expect(skins.back).toEqual({ kind: 'texture', url: 'https://blob.example/back.jpg' });
  });

  it('falls back to a plain sleeve in the record’s own spine colour', () => {
    /**
     * Fails against the fallback branches. §10b: "a plain sleeve in the
     * record's stored spine colour … it does not invent a back that was never
     * photographed, it reuses a colour already computed from the record's own
     * cover."
     *
     * The colour is REUSED rather than recomputed. A second averaging pass
     * could disagree with the wall's spine for the same record, and two
     * different colours for one sleeve is worse than either.
     */
    const skins = resolveSkins({ ...plain, spineColour: '#363129' });

    // The FRONT is exactly a plain sleeve and nothing else — `toEqual`, so an
    // imprint appearing there in future fails here rather than silently
    // stamping a catalogue number on a blank cover.
    expect(skins.front).toEqual({ kind: 'plain', colour: '#363129' });
    // The BACK is the same colour and additionally carries the imprint, which
    // the test below pins; this one is about the COLOUR being the record's own.
    expect(skins.back).toMatchObject({ kind: 'plain', colour: '#363129' });
  });

  it('uses the shelf’s default colour when the record has none, not a new one', () => {
    /**
     * Fails against the fallback if it introduces its own constant. `spine_colour`
     * is nullable and null is ORDINARY — it means no cover has been processed
     * (§4.2) — so this path runs constantly. A second default would put one
     * grey on the wall and a different grey on the object for the same record.
     */
    expect(resolveSkins(plain).front).toEqual({ kind: 'plain', colour: DEFAULT_SPINE_COLOUR });
  });

  it('carries the imprint only on a FALLBACK back, never over a photograph', () => {
    /**
     * Fails against the `imprint` flag. §10b: a fallback back carries "label and
     * catalogue number as a small imprint and nothing further" — but where a
     * photograph exists it is used, and printing text over someone's photograph
     * of a real sleeve would be the app defacing their data.
     */
    expect(resolveSkins({ ...plain, spineColour: '#363129' }).back).toMatchObject({
      kind: 'plain',
      imprint: true,
    });

    expect(resolveSkins({ ...plain, backUrl: 'https://blob.example/back.jpg' }).back).toEqual({
      kind: 'texture',
      url: 'https://blob.example/back.jpg',
    });
  });

  it('gives the front NO imprint, because a front is not a back', () => {
    /**
     * Fails against the front fallback if it copies the back's shape. §10b puts
     * the imprint on the back — it is what a real back sleeve prints. A plain
     * FRONT is a blank sleeve, and stamping a catalogue number on it would
     * invent a cover that no record has.
     */
    expect(resolveSkins(plain).front).not.toMatchObject({ imprint: true });
  });
});

describe('hasGatefold — both leaves, or no hinge', () => {
  it('opens only when both leaves have been photographed', () => {
    /**
     * Fails against `hasGatefold` if it tests either leaf rather than both.
     * §10b as amended by A21c: "One is not enough: a hinge that opens onto
     * artwork on one side and a blank on the other invents exactly the thing
     * the user came to see."
     */
    expect(
      hasGatefold({
        ...plain,
        gatefoldLeftUrl: 'https://blob.example/l.jpg',
        gatefoldRightUrl: 'https://blob.example/r.jpg',
      }),
    ).toBe(true);
  });

  it('refuses on ONE leaf, either side — the discriminating fixture', () => {
    /**
     * **The case that separates the rule from its predecessor**, and the reason
     * it is asserted in both directions.
     *
     * A record with both leaves or with neither passes under a one-leaf rule
     * and a both-leaves rule alike; only the half-photographed record tells
     * them apart. Unit 14 recorded that the old single-`gatefold` enum could
     * not even express this case — it can now, so it must be here.
     *
     * Asserted for left-only AND right-only because a guard testing one
     * specific leaf would pass one of them and fail the other.
     */
    expect(hasGatefold({ ...plain, gatefoldLeftUrl: 'https://blob.example/l.jpg' })).toBe(false);
    expect(hasGatefold({ ...plain, gatefoldRightUrl: 'https://blob.example/r.jpg' })).toBe(false);
  });

  it('refuses when neither leaf exists', () => {
    // The ordinary case: production has no inner photographs at all.
    expect(hasGatefold(plain)).toBe(false);
  });
});

describe('centredSquareUv — a non-square source is cropped, not stretched', () => {
  it('leaves a square image untouched', () => {
    /**
     * Fails against `centredSquareUv` if it always transforms. A square source
     * needs no crop, and a repeat/offset applied anyway would shave pixels off
     * artwork that fitted perfectly.
     */
    expect(centredSquareUv(600, 600)).toEqual({ repeatX: 1, repeatY: 1, offsetX: 0, offsetY: 0 });
  });

  it('crops the LONGER axis and centres what remains', () => {
    /**
     * Fails against the repeat/offset arithmetic. A22: "A non-square image is
     * cropped to square from its centre when it is mapped onto the object …
     * The alternative — fitting the whole image and letterboxing the remainder
     * — puts a border on a record that has none."
     *
     * 591x599 is the real measurement from unit 15, so the width is the shorter
     * axis: the full width is kept and the height is trimmed to 591/599 of
     * itself, half the remainder taken off each end.
     */
    const uv = centredSquareUv(591, 599);

    expect(uv.repeatX).toBeCloseTo(1, 6);
    expect(uv.repeatY).toBeCloseTo(591 / 599, 6);
    expect(uv.offsetX).toBeCloseTo(0, 6);
    expect(uv.offsetY).toBeCloseTo((1 - 591 / 599) / 2, 6);
  });

  it('crops width when the image is wider than tall', () => {
    /**
     * Fails against the branch if it only handles one orientation. Asserted
     * separately because a version handling portrait correctly and landscape
     * not at all would pass the test above.
     */
    const uv = centredSquareUv(800, 400);

    expect(uv.repeatX).toBeCloseTo(0.5, 6);
    expect(uv.repeatY).toBeCloseTo(1, 6);
    expect(uv.offsetX).toBeCloseTo(0.25, 6);
    expect(uv.offsetY).toBeCloseTo(0, 6);
  });

  it('is defined for an unmeasured image rather than producing NaN', () => {
    /**
     * Fails against the division if unguarded. A texture read before its image
     * has decoded reports 0x0, and `NaN` in a UV repeat renders the surface
     * blank — silently, which is the failure shape unit 15 met twice.
     */
    for (const value of Object.values(centredSquareUv(0, 0))) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
