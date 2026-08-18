import { describe, expect, it } from 'vitest';
import { coverTextureUrl, squareFrustum } from './plane';

/**
 * The two testable parts of §10b's first `three.js` unit.
 *
 * **Most of this unit is not unit-testable and pretending otherwise would be
 * the decorative-coverage defect CLAUDE.md §2 names.** Whether a texture
 * actually reaches the GPU, whether its colours survive the transfer, whether
 * the plane is square on screen — those are answered by looking at pixels, and
 * WebGL's failures are silent, which is the whole reason this unit exists.
 *
 * What IS testable is the arithmetic that decides whether a square texture can
 * render square, and the mapping from a record to the image it should show.
 * Both can be wrong in ways that look plausible.
 */

describe('squareFrustum — a square texture must render square', () => {
  it('matches the canvas aspect, so the plane is not stretched', () => {
    /**
     * Fails against `squareFrustum`'s `left`/`right` terms. An orthographic
     * camera whose frustum is square while the canvas is not produces a plane
     * stretched along the wider axis — a cover that looks fine until you hold
     * a copy of the source beside it, which is exactly the failure mode frame 3
     * of this unit exists to catch.
     *
     * At 800x400 the frustum must be twice as wide as it is tall, so that one
     * world unit measures the same number of pixels on both axes.
     */
    const wide = squareFrustum(800, 400);

    expect(wide.right - wide.left).toBeCloseTo(2 * (wide.top - wide.bottom), 6);
  });

  it('is symmetric about the origin, so the plane sits centred', () => {
    /**
     * Fails against the frustum terms if any carries an offset. The plane is
     * built at the origin; a lopsided frustum moves it off-centre without
     * distorting it, which reads as a layout bug rather than a camera one and
     * would send the next reader to the wrong file.
     */
    const f = squareFrustum(1024, 768);

    expect(f.left).toBeCloseTo(-f.right, 6);
    expect(f.bottom).toBeCloseTo(-f.top, 6);
  });

  it('keeps a unit-sized plane fully visible at any aspect', () => {
    /**
     * Fails against the shorter-axis term. The plane is 1x1 world units, so the
     * frustum's SHORTER axis must be at least 1 or the sleeve is cropped by the
     * camera — and cropping a square texture is indistinguishable from a
     * badly-cropped photograph until you measure it.
     */
    for (const [w, h] of [
      [400, 800],
      [800, 400],
      [500, 500],
    ]) {
      const f = squareFrustum(w, h);
      const shorter = Math.min(f.right - f.left, f.top - f.bottom);

      expect(shorter, `${w}x${h} crops the plane`).toBeGreaterThanOrEqual(1);
    }
  });

  it('is defined for a zero-sized canvas rather than dividing by zero', () => {
    /**
     * Fails against the aspect division if it is unguarded. A canvas measured
     * before layout reports 0 — and `NaN` in a camera frustum renders NOTHING,
     * silently, which is the first of the three failure modes this unit is
     * written to distinguish. A blank canvas from a NaN frustum looks exactly
     * like a blank canvas from a texture that never loaded.
     */
    const f = squareFrustum(0, 0);

    for (const value of Object.values(f)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('is square when the canvas is square', () => {
    /**
     * Fails against either axis term. The degenerate case that proves the
     * mapping is a real one rather than a tuned approximation: at 1:1 the
     * frustum must be 1:1 too.
     */
    const f = squareFrustum(600, 600);

    expect(f.right - f.left).toBeCloseTo(f.top - f.bottom, 6);
  });
});

describe('coverTextureUrl — which image goes on the plane', () => {
  it('takes the cover', () => {
    /**
     * Fails against `coverTextureUrl`'s type filter. §10b: the front face is
     * the `cover` image. Any other type would put a photograph of the dead wax
     * on the front of the sleeve.
     */
    expect(
      coverTextureUrl([
        { imageType: 'cover', url: 'https://blob.example/cover.jpg' },
        { imageType: 'label', url: 'https://blob.example/label.jpg' },
      ]),
    ).toBe('https://blob.example/cover.jpg');
  });

  it('returns null when no cover exists, rather than any other image', () => {
    /**
     * Fails against the filter if it falls back to `images[0]`. §10b is
     * explicit that a record with no cover gets a plain sleeve — "an honest
     * absence rather than a placeholder" — and it is the ORDINARY case, not an
     * error state: most records arrive from Discogs with a front cover and
     * nothing else, and some arrive with nothing at all.
     *
     * Falling back to whatever image happened to be first would put a close-up
     * of a matrix runout on the front of the record, which is the app asserting
     * something false about a sleeve.
     */
    expect(
      coverTextureUrl([
        { imageType: 'matrix', url: 'https://blob.example/matrix.jpg' },
        { imageType: 'label', url: 'https://blob.example/label.jpg' },
      ]),
    ).toBeNull();

    expect(coverTextureUrl([])).toBeNull();
  });

  it('takes the FIRST cover when a record has more than one', () => {
    /**
     * Fails against the filter if it takes the last, or is order-dependent in a
     * way the caller cannot predict. Duplicate covers are legal — nothing stops
     * two uploads of the same type — and the plane must show a stable one
     * rather than whichever the database happened to return last.
     */
    expect(
      coverTextureUrl([
        { imageType: 'cover', url: 'https://blob.example/first.jpg' },
        { imageType: 'cover', url: 'https://blob.example/second.jpg' },
      ]),
    ).toBe('https://blob.example/first.jpg');
  });

  it('ignores a null image type rather than treating it as a cover', () => {
    /**
     * Fails against the comparison if it is loose. `images.image_type` is
     * nullable (§4.2), so an untyped row is real and reachable — and `null` is
     * not a cover. Treating it as one would put an unclassified photograph on
     * the front face of every record that has one.
     */
    expect(coverTextureUrl([{ imageType: null, url: 'https://blob.example/x.jpg' }])).toBeNull();
  });
});
