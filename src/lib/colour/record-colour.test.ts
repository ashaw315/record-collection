import { describe, expect, it } from 'vitest';
import { contrastRatio, deriveRecordColour, NEAR_GREY_CHROMA } from './record-colour';

/**
 * The record's stored colour, lightened until black type is legible on it.
 *
 * **The assertions are against the CONTRAST FLOOR, not against the derivation
 * having run.** This repo has shipped a state at 1.29:1 behind a test that
 * checked two token strings differed — the proxy-one-layer-below failure
 * CLAUDE.md §2 tabulates. So every test here computes a real ratio and checks
 * it clears 4.5:1; none of them assert "a variant was produced".
 *
 * **One obligation, which the stored value does not guarantee:** the 72px year
 * and its label sit ON the filled module in BLACK, so the fill must be light
 * enough to clear 4.5:1 against black.
 *
 * The `ink` variant these tests used to cover is retired with revised §5 — the
 * 40px figure set in the colour is gone, along with the 8px path bar, because
 * the cover now carries the colour. Nothing is set in the colour any more.
 */

/** Every stored colour in the real collection, measured 2026-09-12. */
const REAL_COLLECTION = [
  '#7e8285', '#787e6f', '#63695e', '#d8cbb8', '#93a99d', '#363129',
  '#473e35', '#80868a', '#92603d', '#94698a', '#6e636a', '#745e34',
  '#64866e', '#9b9b9a', '#5b707b', '#3b5259',
] as const;

/**
 * Narrows the nullable return. Every colour in these tests is a valid hex, so a
 * null is a defect in the test's own fixture — asserted rather than silenced
 * with a non-null assertion, which CLAUDE.md §6 forbids.
 */
const derive = (stored: string) => {
  const colour = deriveRecordColour(stored);
  if (colour === null) throw new Error(`expected a derived colour for ${stored}`);
  return colour;
};

describe('the fill carries black text', () => {
  it('clears 4.5:1 against black for every colour in the collection', () => {
    for (const stored of REAL_COLLECTION) {
      const { fill } = derive(stored);
      expect(contrastRatio(fill, '#000000'), `${stored} → fill ${fill}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  /**
   * The extremes, named rather than trusted to the sample. A very dark stored
   * colour is the one that must be lightened furthest, and a very light one
   * must not be lightened past white.
   */
  it('lightens even a near-black stored colour enough to carry black text', () => {
    const { fill } = derive('#000000');
    expect(contrastRatio(fill, '#000000')).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves an already-light colour usable rather than blowing it out', () => {
    const { fill } = derive('#ffffff');
    expect(contrastRatio(fill, '#000000')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the fill is the stored hue, lightened', () => {
  /**
   * **The point of deriving rather than picking.** A fill chosen independently
   * would put a second colour on the page; §5 says one stored value and one
   * derived variant, so the hue has to survive the lightening.
   */
  it('keeps the fill within a few degrees of the stored hue', () => {
    for (const stored of REAL_COLLECTION) {
      const { fillHue, storedHue, chroma } = derive(stored);

      /* A near-grey has no meaningful hue to preserve — see the next block. */
      if (chroma < NEAR_GREY_CHROMA) continue;

      expect(Math.abs(fillHue - storedHue), `fill hue for ${stored}`).toBeLessThan(6);
    }
  });

  it('never darkens a colour to reach the floor', () => {
    // Lightening is the only direction: the fill carries black type, so a
    // darker fill is always further from legible, never closer.
    for (const stored of REAL_COLLECTION) {
      const { fill } = derive(stored);
      expect(
        contrastRatio(fill, '#000000'),
        `${stored} → ${fill}`,
      ).toBeGreaterThanOrEqual(contrastRatio(stored, '#000000'));
    }
  });

  it('leaves a colour that already clears the floor alone', () => {
    // #d8cbb8 is light enough as stored, so the derivation returns it unchanged
    // rather than lightening it further for no reason.
    expect(derive('#d8cbb8').fill).toBe('#d8cbb8');
  });
});

/**
 * **The near-grey case is the MAJORITY, not a hypothetical.** §5 mentions it
 * once — "a record whose cover yields a near-grey will produce a large pale
 * rectangle doing nothing". Measured against the real collection: 12 of 17
 * stored colours have chroma below 0.04, and four are below 0.02.
 *
 * So the module reports it rather than silently producing a grey rectangle.
 * What the SCREEN does about it is a design decision and is not made here.
 */
describe('near-grey is reported, not hidden', () => {
  it('flags the colours the collection actually stores as near-grey', () => {
    const grey = REAL_COLLECTION.filter((hex) => derive(hex).isNearGrey);

    expect(grey.length, 'twelve of the sixteen stored colours').toBe(12);
  });

  it('does not flag the colours that carry real chroma', () => {
    for (const stored of ['#92603d', '#94698a', '#745e34', '#64886e']) {
      expect(derive(stored).isNearGrey, stored).toBe(false);
    }
  });

  it('still meets the contrast obligation for a pure grey', () => {
    /*
      Reporting it must not mean skipping it. Revised §5 is explicit that the
      marks are NOT conditional on chroma — a field shown only above a threshold
      makes the composition differ between records for a reason the reader cannot
      see. So a near-grey record still gets a legible filled module.
    */
    expect(contrastRatio(derive('#9b9b9a').fill, '#000000')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the absent case', () => {
  /**
   * §7: one record has no cover, so no stored colour — which removes all four
   * colour marks. `null` is an honest absence and must not become a default
   * grey, which would be indistinguishable from a real near-grey record.
   */
  it('returns null rather than inventing a colour', () => {
    expect(deriveRecordColour(null)).toBeNull();
  });

  it('returns null for a malformed stored value rather than throwing', () => {
    // The column is free text; a bad value is a data problem, not a crash.
    expect(deriveRecordColour('not-a-colour')).toBeNull();
    expect(deriveRecordColour('#xyz')).toBeNull();
  });
});

describe('the contrast function itself', () => {
  /**
   * The measuring instrument, checked against known values — otherwise every
   * assertion above rests on an unverified ratio.
   */
  it('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#7e8285', '#7e8285')).toBeCloseTo(1, 5);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#64866e', '#ffffff')).toBeCloseTo(
      contrastRatio('#ffffff', '#64866e'),
      10,
    );
  });
});
