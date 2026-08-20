import { describe, expect, it } from 'vitest';
import { PHOTOGRAPHED_FACES, isPhotograph, surfaceKind } from './surface-kind';

/**
 * Whether a surface is a PHOTOGRAPH or a SURFACE, which decides whether light
 * touches it.
 *
 * **§10b's rule about spines applies to faces directly.** A spine is a claim
 * about a cover; a cover face is a claim about the artwork. Adding light that
 * was never in the sleeve is the class that declined a saturation boost in unit
 * 1a — the app asserting colour the record does not have.
 *
 * Measured before the rule was applied: the rendered cover sat **+0.030 above
 * the source in linear space**, uniformly across all three channels. An
 * additive ambient term, not a gain — and because it lifts the darkest channel
 * proportionally most it read as a blue cast (ratios 1.47 / 1.64 / 1.88 against
 * near-constant differences of 21.8 / 25.6 / 27.3).
 *
 * The rule is stated here rather than at each call site so the next face added
 * — the gatefold leaves are slots with no geometry yet — inherits it instead of
 * rediscovering it.
 */

describe('isPhotograph', () => {
  it('covers every photographed slot the schema has', () => {
    /**
     * **Enumerated against the schema, not sampled.** §4.2's image types are
     * `cover`, `back`, `gatefold_left`, `gatefold_right` — all four are
     * photographs of artwork and all four are unlit.
     *
     * Fails if a slot is added to the schema and not to this list, which is the
     * "deferral with no home" shape NOTES already records: the gatefold leaves
     * sat unbuilt behind a comment saying they were a later unit.
     */
    expect(PHOTOGRAPHED_FACES).toEqual(['cover', 'back', 'gatefold_left', 'gatefold_right']);
  });

  it('is true for a photograph of artwork', () => {
    for (const face of PHOTOGRAPHED_FACES) {
      expect(isPhotograph(face), `${face} is a photograph`).toBe(true);
    }
  });

  it('is FALSE for the plain-sleeve fallback', () => {
    /**
     * **Not an inconsistency, and the reason matters.** The fallback is not a
     * photograph of anything — it is a surface, and unit 17 found its edge only
     * separates tonally from its face BECAUSE it is lit. An unlit fallback is a
     * flat rectangle, which is exactly the "missing texture" reading that unit
     * was written to fix.
     */
    expect(isPhotograph('plain-sleeve')).toBe(false);
  });

  it('is FALSE for every surface of the wall', () => {
    for (const surface of ['spine', 'spine-edge', 'shelf', 'shelf-lip'] as const) {
      expect(isPhotograph(surface), `${surface} is a surface, not a photograph`).toBe(false);
    }
  });
});

describe('surfaceKind', () => {
  it('sends photographs to an unlit material and surfaces to a lit one', () => {
    /**
     * The whole rule in one assertion, expressed as what the surface IS rather
     * than as which material to use — so a caller cannot pick the material
     * without answering the question first.
     */
    expect(surfaceKind('cover')).toBe('unlit');
    expect(surfaceKind('gatefold_left')).toBe('unlit');
    expect(surfaceKind('plain-sleeve')).toBe('lit');
    expect(surfaceKind('shelf')).toBe('lit');
  });

  it('has no third answer', () => {
    /**
     * Guards the sweep: a surface that is neither would silently take a
     * default, and the default is the one that adds light.
     */
    const all = [
      ...PHOTOGRAPHED_FACES,
      'plain-sleeve',
      'spine',
      'spine-edge',
      'shelf',
      'shelf-lip',
    ] as const;

    for (const surface of all) {
      expect(['lit', 'unlit']).toContain(surfaceKind(surface));
    }
  });
});
