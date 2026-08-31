import { describe, expect, it } from 'vitest';
import { WALL_DIM_FLOOR, wallDim } from './wall-dim';

/**
 * How dark the wall goes behind a pulled record.
 *
 * **The dim moved from a DOM scrim into the scene, and that is a correction
 * rather than a preference.** Measured: a `black/70` overlay cost the cover
 * 0.30x its brightness — exactly `1 - 0.7` — because the scrim sat above the
 * canvas in z-order and dimmed the record along with the wall. The panels
 * looked full-strength because they are siblings ABOVE the scrim; the record
 * looked washed because the canvas is below it.
 *
 * §10b: a cover is a claim about a record's artwork. Rendering it at 44% of the
 * sleeve's brightness is the app being wrong about the record, which is the
 * same class as inventing a spine colour.
 *
 * So the wall dims and the record does not — which is only expressible in the
 * scene, where they are separate objects.
 *
 * **Unit 11's ordering must survive the move**: the backdrop arrives AS the
 * record travels, partway at 15%, not before. That is what makes the rise read
 * as arriving rather than a modal opening, and a step function cannot express
 * it.
 */

describe('wallDim', () => {
  it('leaves the wall undimmed with nothing pulled', () => {
    expect(wallDim(0)).toBe(1);
  });

  it('is only PARTWAY at 15%, not already dark', () => {
    /**
     * **Unit 11's finding, as an assertion.** At 15% the backdrop was partway
     * and the controls were still at opacity 0 — the record arrives, it does
     * not appear behind a curtain that dropped on click.
     *
     * Fails against a step function, which is what the DOM scrim was: it went
     * to full opacity immediately and let a CSS transition smooth it. Moving
     * into the scene removes that transition, so the curve has to be real.
     */
    const at15 = wallDim(0.15);

    expect(at15, 'the wall has begun to dim').toBeLessThan(1);
    expect(at15, 'but is nowhere near dark').toBeGreaterThan(0.85);

    /*
      **Tracking the record, not running ahead of it.** A cubic ease-out — the
      obvious choice, and what the rise itself uses — is 39% dimmed at 15%
      progress and 88% by halfway. The wall would be dark before the record
      arrived, which is the modal opening unit 11's ordering exists to prevent.
      This pins the relationship rather than the number.
    */
    const dimmedFraction = (1 - at15) / (1 - WALL_DIM_FLOOR);
    expect(dimmedFraction, 'the dim is no further along than the record').toBeCloseTo(0.15, 2);
  });

  it('reaches its floor only when the record has arrived', () => {
    expect(wallDim(1)).toBeCloseTo(WALL_DIM_FLOOR, 5);
  });

  it('darkens monotonically, with no lurch', () => {
    /**
     * Swept rather than checked at the ends. A curve that hung and then dropped
     * would read as the modal opening this is written to avoid — the same shape
     * the return's cubic ease-in produced, where 88% of the motion happened in
     * the second half.
     */
    const steps = Array.from({ length: 40 }, (_, i) => wallDim(i / 39));

    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i], `step ${i} brightened`).toBeLessThanOrEqual(steps[i - 1] + 1e-9);
      expect(
        steps[i - 1] - steps[i],
        `step ${i} lurched`,
      ).toBeLessThan(0.12);
    }
  });

  it('never dims the wall to nothing', () => {
    /**
     * The wall stays legible behind the record — it is the thing the record
     * came out of, and a black rectangle behind a cover loses the slot the
     * whole rewrite was for.
     */
    /*
      **The bound was `> 0.1` and the floor is now 0.1 exactly.** The RULE it
      defends is unchanged — the wall must not become a black rectangle — but
      the threshold was written around a floor of 0.28 and excluded the value
      chosen by looking, by one step. `>= 0.08` keeps the rule and stops the
      test asserting a number rather than the property.
    */
    expect(WALL_DIM_FLOOR).toBeGreaterThanOrEqual(0.08);
    expect(WALL_DIM_FLOOR, 'but it is genuinely dimmed').toBeLessThan(0.5);
  });

  it('clamps outside 0..1 rather than overshooting', () => {
    expect(wallDim(-1)).toBe(1);
    expect(wallDim(2)).toBeCloseTo(WALL_DIM_FLOOR, 5);
  });
});
