import { describe, expect, it } from 'vitest';
import { recordLadder } from '@/lib/colour/record-ladder';
import { ornamentFaces } from './ornament-tones';
import { archetypeFor } from './ornament';

/**
 * **§9.2's three faces are three LIGHTNESSES, and §5.1 forbids the shortcut.**
 *
 * §9.2: "The three faces of a solid are three lightnesses of the one tint
 * value, not three hues — which is §5.3's argument that a form reads as an
 * object because its tones are lightness steps."
 *
 * §5.1 closes the obvious implementation off by name: every colour mark sits
 * "at one of the three steps of §5.5 and **never at an opacity variant**".
 *
 * The build drew all three faces as `fill={tint}` with `opacity` 1, 0.72 and
 * 0.5. Composited over 0.925 paper those collapse toward the ground rather
 * than stepping down in lightness, which is the greyness §12 reports: measured
 * on the route, all three faces rendered the identical `rgb(217, 143, 138)`
 * because the browser reports the fill before compositing, and what reaches
 * the eye is three washes of paper rather than three sides of a solid.
 *
 * So the tones are computed, not faded — and the test asserts what the ruling
 * says rather than the numbers the implementation happens to produce.
 */
describe('§9.2: a solid’s three faces are three lightnesses of one tint', () => {
  /* A chromatic record, so hue is present and can be checked for constancy. */
  const ladder = recordLadder('#8b2f2f');

  it('has a ladder to work from', () => {
    expect(ladder, 'the fixture colour produces a ladder').not.toBeNull();
  });

  it('gives the three faces three DIFFERENT lightnesses, top lightest', () => {
    const faces = ornamentFaces(ladder!);
    const ls = [faces.top.L, faces.left.L, faces.right.L];

    expect(new Set(ls).size, `three distinct lightnesses, got ${ls.join(', ')}`).toBe(3);
    expect(faces.top.L, 'the top is the lightest').toBeGreaterThan(faces.left.L);
    expect(faces.left.L, 'the right face is the darkest').toBeGreaterThan(faces.right.L);
  });

  it('keeps one hue and one chroma across all three — lightnesses, not hues', () => {
    const faces = ornamentFaces(ladder!);
    expect(new Set([faces.top.h, faces.left.h, faces.right.h]).size, 'one hue').toBe(1);
    expect(new Set([faces.top.C, faces.left.C, faces.right.C]).size, 'one chroma').toBe(1);
  });

  it('starts from the TINT step, because ornament is ground and never base (§9.2)', () => {
    const faces = ornamentFaces(ladder!);
    expect(faces.top.L, 'the lit face is the tint itself').toBeCloseTo(ladder!.tintL, 5);
    expect(faces.top.h, 'and the tint’s hue').toBeCloseTo(ladder!.tintHue, 5);
  });

  it('emits opaque colours, never an opacity variant (§5.1)', () => {
    const faces = ornamentFaces(ladder!);
    for (const [name, face] of Object.entries(faces)) {
      expect(face.fill, `${name} is a hex colour`).toMatch(/^#[0-9a-f]{6}$/);
      expect(face, `${name} carries no opacity`).not.toHaveProperty('opacity');
    }
  });

  /*
    A near-grey cover is §5.2's declared state — six of sixteen real covers —
    and the rule still has to hold there, because that is where a flat solid
    would be least legible as an object.
  */
  it('still steps on a near-grey record, where the object reading is at most risk', () => {
    const grey = recordLadder('#7a7a78');
    const faces = ornamentFaces(grey!);
    expect(faces.top.L).toBeGreaterThan(faces.left.L);
    expect(faces.left.L).toBeGreaterThan(faces.right.L);
  });
});

/**
 * **The matrix is the one place the ladder must not reach (§5, §12).**
 *
 * §5 captions the matrix/runout drawing record-INDEPENDENT, so §12 excepts it
 * by name: "the matrix still excepted, which §5 rules record-independent". A
 * fix stated as "the solids stop being grey" would have coloured exactly the
 * one solid that must not be.
 *
 * It is a separate component — `MatrixSolid` in `RecordPage8a` — with its
 * three greys written literally, and it takes no tint. This asserts the
 * separation holds rather than trusting that nothing wired them together:
 * the region's ornament map has no entry for the matrix, so no tinted solid
 * can be drawn there.
 */
describe('§5: the matrix is record-independent and the ladder does not reach it', () => {
  it('has no ornament archetype, so the region never draws a tinted solid there', () => {
    for (const name of ['matrix', 'matrix-runout']) {
      expect(archetypeFor(name), `${name} carries no tinted solid`).toBeNull();
    }
  });

  it('still maps the four sections that DO carry one, so the check is not vacuous', () => {
    for (const name of ['pressing-detail', 'snippet', 'market', 'price-history']) {
      expect(archetypeFor(name), `${name} carries a solid`).not.toBeNull();
    }
  });
});
