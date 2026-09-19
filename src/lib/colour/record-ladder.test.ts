import { PAPER } from './paper';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './record-colour';
import { CHROMA_CEILING, LIGHTNESS_MAX, LIGHTNESS_MIN, recordLadder } from './record-ladder';

/**
 * 8a §5.2 and §5.5 — one derived value, one ladder, three steps.
 *
 * **The steps name the KIND of mark, not just a value.** Base carries or frames
 * the record's own material; tint is ground; shade is only ever a right-hand
 * face. A reader who notices the strong marks always touch the record and the
 * pale ones are always behind something has read the system correctly.
 */

/** Every stored colour in the real collection, measured 2026-09-12. */
const REAL = [
  '#7e8285', '#adad85', '#816f4c', '#d8cbb8', '#afae51', '#363129',
  '#473e35', '#89adc0', '#a25829', '#bc4889', '#6e636a', '#755f34',
  '#44946b', '#9b9b9a', '#7bb1c5', '#31788a',
] as const;

const step = (hex: string) => {
  const ladder = recordLadder(hex);
  if (ladder === null) throw new Error(`expected a ladder for ${hex}`);
  return ladder;
};

describe('the clamp (§5.2)', () => {
  /**
   * **The lightness floor is set by the 11px LABEL, not by the 72.** At L 0.62
   * ink clears roughly 4.9:1 and the floor for 11px type is 4.5, so the label
   * is the binding constraint — the headline-scale 3:1 allowance is never
   * reached for.
   */
  it('lifts every base into the lightness band', () => {
    for (const stored of REAL) {
      const { baseL } = step(stored);
      expect(baseL, `${stored}`).toBeGreaterThanOrEqual(LIGHTNESS_MIN - 1e-9);
      expect(baseL, `${stored}`).toBeLessThanOrEqual(LIGHTNESS_MAX + 1e-9);
    }
  });

  it('carries ink at 4.5:1 or better on every base, which is what the floor is for', () => {
    for (const stored of REAL) {
      const { base } = step(stored);
      expect(contrastRatio(base, '#000000'), `${stored} → ${base}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * **Chroma is ceilinged and NOT floored — the reversal.** A floor would lift a
   * near-grey to 0.045 at the sampled hue, asserting a hue the sampler
   * explicitly declined to identify, on six of sixteen records. An invented hue
   * is worse than no hue, because nothing downstream can tell it from a real
   * one.
   */
  it('brings a saturated cover down to the ceiling', () => {
    expect(step('#bc4889').baseC).toBeCloseTo(CHROMA_CEILING, 3);
    expect(step('#44946b').baseC).toBeCloseTo(CHROMA_CEILING, 3);
  });

  it('leaves a near-grey near-grey rather than inventing a hue', () => {
    // #9b9b9a samples at chroma 0.001 and ships at 0.001: a grey at the right
    // value, which is what that cover is.
    expect(step('#9b9b9a').baseC).toBeLessThan(0.02);
    expect(step('#363129').baseC).toBeLessThan(0.03);
  });

  it('never raises chroma on any real cover', () => {
    for (const stored of REAL) {
      const { sampledC, baseC } = step(stored);
      expect(baseC, `${stored}`).toBeLessThanOrEqual(sampledC + 1e-9);
    }
  });

  it('keeps the sampled hue through the clamp', () => {
    for (const stored of REAL) {
      const { sampledC, sampledHue, baseHue } = step(stored);
      /* A near-grey has no meaningful hue to preserve. */
      if (sampledC < 0.02) continue;
      expect(Math.abs(baseHue - sampledHue), `${stored}`).toBeLessThan(2);
    }
  });
});

describe('the ladder (§5.5)', () => {
  it('is exactly three steps — tint, base, shade', () => {
    const ladder = step('#44946b');

    expect(Object.keys(ladder)).toContain('tint');
    expect(Object.keys(ladder)).toContain('base');
    expect(Object.keys(ladder)).toContain('shade');
    /* No fourth step: a fourth makes lightness look like it encodes something. */
    expect(ladder).not.toHaveProperty('tint2');
    expect(ladder).not.toHaveProperty('midtone');
  });

  it('orders them tint lighter than base lighter than shade', () => {
    for (const stored of REAL) {
      const { tintL, baseL, shadeL } = step(stored);
      expect(tintL, `${stored} tint`).toBeGreaterThan(baseL);
      expect(baseL, `${stored} base`).toBeGreaterThan(shadeL);
    }
  });

  it('moves tint 34% toward paper and shade 26% toward ink', () => {
    const { baseL, tintL, shadeL } = step('#44946b');

    /* Lightness steps, not hue steps — which is what keeps a near-grey ladder
       reading as one object rather than as three greys. */
    /* Toward PAPER — the ground the app paints (§11.5) — not toward white. */
    expect(tintL).toBeCloseTo(baseL + (PAPER.L - baseL) * 0.34, 4);
    expect(shadeL).toBeCloseTo(baseL * (1 - 0.26), 4);
  });

  /**
   * §5.2: "tint and shade derive from base, so a near-grey base gives near-grey
   * steps... the construction still reads as an object because its three tones
   * are lightness steps and not hue steps."
   */
  it('gives a near-grey base three distinct near-grey steps', () => {
    const { tint, base, shade, tintL, shadeL } = step('#9b9b9a');

    expect(tint).not.toBe(base);
    expect(base).not.toBe(shade);
    /* Distinct enough to read as an object: the span is a real lightness range. */
    expect(tintL - shadeL).toBeGreaterThan(0.2);
  });

  it('keeps one hue across all three steps', () => {
    for (const stored of REAL) {
      const { sampledC, baseHue, tintHue, shadeHue } = step(stored);
      if (sampledC < 0.02) continue;

      expect(Math.abs(tintHue - baseHue), `${stored} tint hue`).toBeLessThan(2);
      expect(Math.abs(shadeHue - baseHue), `${stored} shade hue`).toBeLessThan(2);
    }
  });
});

describe('the record with no cover (§5.3)', () => {
  /**
   * No derivation, and the fallback is INK for all seven marks — filled, not
   * outlined, not omitted. Dropping them would let a missing image change the
   * composition's structure, which is the wallpaper rule inverted.
   */
  it('returns null so the caller falls back to ink', () => {
    expect(recordLadder(null)).toBeNull();
  });

  it('returns null for a malformed stored value rather than throwing', () => {
    expect(recordLadder('not-a-colour')).toBeNull();
  });
});
