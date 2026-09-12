import { describe, expect, it } from 'vitest';
import { contrastRatio, deriveRecordColour, NEAR_GREY_CHROMA } from './record-colour';

/**
 * The record's stored colour, derived into the two variants §5 requires.
 *
 * **The assertions are against the CONTRAST FLOOR, not against the derivation
 * having run.** This repo has shipped a state at 1.29:1 behind a test that
 * checked two token strings differed — the proxy-one-layer-below failure
 * CLAUDE.md §2 tabulates. So every test here computes a real ratio and checks
 * it clears 4.5:1; none of them assert "a variant was produced".
 *
 * §5's two obligations, which the stored value does not guarantee:
 *   - the 72px year and its label sit ON the filled module in BLACK, so the
 *     fill must be light enough to clear 4.5:1 against black;
 *   - the 40px market figure is ink ON WHITE, so the same hue must be dark
 *     enough to clear 4.5:1 against white.
 * One stored value, two derived variants, pulling in opposite directions.
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

describe('the figure is ink on white', () => {
  it('clears 4.5:1 against white for every colour in the collection', () => {
    for (const stored of REAL_COLLECTION) {
      const { ink } = derive(stored);
      expect(contrastRatio(ink, '#ffffff'), `${stored} → ink ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('darkens a near-white stored colour enough to be read on white', () => {
    const { ink } = derive('#ffffff');
    expect(contrastRatio(ink, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('the two variants are the same hue, pulled apart', () => {
  /**
   * **The point of deriving rather than picking.** If fill and ink were
   * independently chosen the page would carry two colours; §5 says one stored
   * value and two variants, so the hue has to survive both derivations.
   */
  it('keeps fill and ink within a few degrees of the stored hue', () => {
    for (const stored of REAL_COLLECTION) {
      const { fillHue, inkHue, storedHue, chroma } = derive(stored);

      /* A near-grey has no meaningful hue to preserve — see the next block. */
      if (chroma < NEAR_GREY_CHROMA) continue;

      expect(Math.abs(fillHue - storedHue), `fill hue for ${stored}`).toBeLessThan(6);
      expect(Math.abs(inkHue - storedHue), `ink hue for ${stored}`).toBeLessThan(6);
    }
  });

  it('never makes the fill darker than the ink', () => {
    /*
      Not strictly greater: a colour in the middle of the range can already
      clear 4.5:1 against BOTH black and white, and then neither variant moves
      and the two are equal. `#94698a` is exactly that case — L=0.576, legible
      either way. Asserting strict inequality would have forced a pointless
      adjustment on the one colour that needs none.
    */
    for (const stored of REAL_COLLECTION) {
      const { fillL, inkL } = derive(stored);
      expect(fillL, `${stored}`).toBeGreaterThanOrEqual(inkL);
    }
  });

  it('moves nothing for a colour already legible on both grounds', () => {
    const both = derive('#94698a');

    expect(contrastRatio(both.fill, '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(both.ink, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(both.fill, 'no adjustment was needed in either direction').toBe(both.ink);
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

  it('still meets both contrast obligations for a pure grey', () => {
    // Reporting it must not mean skipping it: the marks still have to be legible.
    const { fill, ink } = derive('#9b9b9a');

    expect(contrastRatio(fill, '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(ink, '#ffffff')).toBeGreaterThanOrEqual(4.5);
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
