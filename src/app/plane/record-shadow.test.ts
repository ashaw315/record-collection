import { describe, expect, it } from 'vitest';
import { raw } from './frames';
import {
  SHADOW_STRENGTHS,
  SHADOW_STRENGTH_DEFAULT,
  shadowOpacity,
  shadowPlaneZ,
  shadowSpread,
} from './record-shadow';
import { riseTravel } from './motion-sample';
import { shelfSurfaceSpan } from './wall-framing';

/**
 * The shadow exists because the record read as PASTED ON the wall rather than
 * standing in front of it — and because the wall had no surface for a shadow to
 * land on at all.
 */
describe('the shadow tracks the record rather than running its own clock', () => {
  /**
   * **The constraint Adam named**: *"it is driven by the same progress value
   * everything else uses, not by a separate clock."* Fails against a
   * `shadowOpacity` that ignores `progress`, or clamps it away.
   */
  it('is absent at rest and full at the settle', () => {
    expect(shadowOpacity({ progress: 0, strength: 0.5 })).toBe(0);
    expect(shadowOpacity({ progress: 1, strength: 0.5 })).toBe(0.5);
  });

  /**
   * **Linear, like `wallDim`**, and asserted as a DIVERGENCE from the eased
   * travel for the same reason the dim's is: someone seeing it out of step with
   * position would otherwise "fix" it by easing, reintroducing the front-loading
   * that puts the backdrop ahead of the object.
   *
   * t = 0.5 is excluded because an ease-in-out crosses any linear column at its
   * midpoint by construction — the same exclusion, with the same reason, as the
   * dim's test.
   */
  it('advances with raw progress, not with the eased travel', () => {
    for (const t of [0.15, 0.3, 0.7]) {
      const opacity = shadowOpacity({ progress: t, strength: 1 });
      expect(opacity, `linear at t=${t}`).toBeCloseTo(t, 6);
      expect(
        Math.abs(opacity - riseTravel(t)),
        `shadow must not track the eased travel at t=${t}`,
      ).toBeGreaterThan(0.1);
    }
  });

  /** Out-of-range progress must not produce a negative or >1 shadow. */
  it('clamps rather than extrapolating', () => {
    expect(shadowOpacity({ progress: -1, strength: 1 })).toBe(0);
    expect(shadowOpacity({ progress: 2, strength: 1 })).toBe(1);
  });

  /**
   * **It softens as the record comes forward**, which is what a real shadow
   * does and what makes it read as distance rather than as a dark shape.
   * Fails against a constant spread.
   */
  it('spreads as the record leaves the wall', () => {
    expect(shadowSpread({ progress: 0 })).toBe(1);
    expect(shadowSpread({ progress: 1 })).toBeGreaterThan(shadowSpread({ progress: 0 }));
    /* Monotonic, so it never tightens mid-travel. */
    const samples = [0, 0.25, 0.5, 0.75, 1].map((p) => shadowSpread({ progress: p }));
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
  });
});

describe('the range reaches past what looks right', () => {
  /**
   * **The shelf's finding applied here**: a shadow too subtle is
   * indistinguishable from an absent one, so the ceiling must be reachable from
   * the harness rather than chosen for the developer.
   *
   * Fails against a range whose top is a cautious 0.5.
   */
  it('offers a strength at full darkness', () => {
    expect(Math.max(...Object.values(SHADOW_STRENGTHS))).toBe(1);
  });

  it('offers an off setting, so absent and subtle can be told apart', () => {
    expect(SHADOW_STRENGTHS.off).toBe(0);
    expect(shadowOpacity({ progress: 1, strength: SHADOW_STRENGTHS.off })).toBe(0);
  });

  /** The steps must be distinct, or the harness cannot show a range. */
  it('separates its steps', () => {
    const values = Object.values(SHADOW_STRENGTHS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('defaults to a strength that is in the range', () => {
    expect(SHADOW_STRENGTHS[SHADOW_STRENGTH_DEFAULT]).toBeGreaterThan(0);
  });
});

describe('the shadow lands behind everything', () => {
  /**
   * **The plane must not intercept the shelf.** At the shelf's back edge it is
   * behind the board, the lip and every spine; anywhere forward of that and it
   * would catch shadows in front of geometry that should occlude them.
   *
   * Fails against a plane placed at `z = 0` (the camera's framing plane), which
   * is the obvious wrong answer.
   */
  it('sits at the shelf back edge, behind all scene geometry', () => {
    const span = shelfSurfaceSpan();
    expect(raw(shadowPlaneZ())).toBe(raw(span.back));
    expect(raw(shadowPlaneZ())).toBeLessThan(raw(span.front));
    expect(raw(shadowPlaneZ())).toBeLessThan(0);
  });
});
