import { describe, expect, it } from 'vitest';
import {
  bakeResolution,
  BAKE_DOWNSAMPLE,
  bakeOpacity,
  bakeMix,
  RETURN_CLEAR_FRACTION,
} from './wall-bake';

/**
 * **The wall is baked to a texture once when a record is pulled, and the blur
 * is the downsample.**
 *
 * The composer approach failed after six wrong diagnoses, and the reason was
 * structural rather than a bug: it FILTERS THE FRAME, so wall and record are the
 * same pixels by the time it runs, and every step needed the scene's existing
 * wall/record partition re-established through layer masks.
 *
 * This replaces the wall with a PICTURE OF ITSELF. The record stays an ordinary
 * mesh in front of a quad, sharp because it is a different object — the
 * partition is physical rather than something to keep correct.
 *
 * **One frame, not every frame**, and the premise is verified rather than
 * assumed: hover is deliberately disabled while a record is out ("a wall that
 * twitches behind the thing being read"), so the wall is genuinely static
 * during a pull.
 *
 * **The blur is bilinear filtering, not a shader.** Render at low resolution,
 * draw back at full size, and the GPU's own filtering does the softening. No
 * pass, no swap buffers, no output encoding — the machinery that fought the
 * scene for two hours is simply absent.
 */
describe('the baked wall texture', () => {
  it('renders at a fraction of the canvas, which is what blurs it', () => {
    expect(BAKE_DOWNSAMPLE).toBeGreaterThan(1);
    expect(BAKE_DOWNSAMPLE, 'but not so coarse the wall becomes blocks').toBeLessThan(24);
  });

  /**
   * **The harness sweeps well below the shipping value**, because Adam judged
   * 1/8 too strong — *"I can barely read the wall as records"* — and asked for
   * 1/3 and 1/2, which are far softer blurs than the range first built.
   */
  it('accepts a much gentler downsample than the default', () => {
    expect(bakeResolution({ width: 1280, height: 768, downsample: 2 })).toEqual({
      width: 640,
      height: 384,
    });
    expect(bakeResolution({ width: 1280, height: 768, downsample: 3 })).toEqual({
      width: 427,
      height: 256,
    });
  });

  it('scales the target with the canvas', () => {
    expect(bakeResolution({ width: 1280, height: 768 })).toEqual({
      width: Math.max(1, Math.round(1280 / BAKE_DOWNSAMPLE)),
      height: Math.max(1, Math.round(768 / BAKE_DOWNSAMPLE)),
    });
  });

  it('never asks for a zero-sized target', () => {
    const tiny = bakeResolution({ width: 4, height: 2 });
    expect(tiny.width).toBeGreaterThanOrEqual(1);
    expect(tiny.height).toBeGreaterThanOrEqual(1);
  });

  /**
   * **The dim animates while the texture stays fixed.**
   *
   * Adam: *"Bake the dim into the texture and the wall would snap to full
   * dimness at pull time, which is the front-loading problem wallDim was tuned
   * to avoid."* So the bake is taken UNDIMMED and the quad's own material
   * carries the dim, which keeps `wallDim`'s linear ramp intact.
   */
  it('is fully lit at rest and carries the dim through its material', () => {
    expect(bakeOpacity(0)).toBe(1);
    expect(bakeOpacity(1)).toBeLessThan(1);
    expect(bakeOpacity(0.5)).toBeGreaterThan(bakeOpacity(1));
    expect(bakeOpacity(0.5)).toBeLessThan(bakeOpacity(0));
  });

  it('ramps linearly, like the dim it sits beside', () => {
    const quarter = bakeOpacity(0) - bakeOpacity(0.25);
    const half = bakeOpacity(0) - bakeOpacity(0.5);
    expect(half / quarter).toBeCloseTo(2, 6);
  });
});


/**
 * **The blur EASES IN with the record, and clears faster on the way back.**
 *
 * Adam: *"On click the blur snaps to full instantly. It should ease in — the
 * wall going out of focus as the record comes forward, not before it."* That was
 * a defect rather than tuning: the quad either replaced the wall or did not, so
 * the blur was binary while only its brightness ramped.
 */
describe('the blur mixes in rather than snapping', () => {
  it('is absent at rest and full when the record is out', () => {
    expect(bakeMix({ progress: 0, returning: false })).toBe(0);
    expect(bakeMix({ progress: 1, returning: false })).toBe(1);
  });

  it('tracks the rise, so the wall softens AS the record comes forward', () => {
    // Linear on the way out: the blur arrives with the record, not before it —
    // the same reasoning `wallDim` records for rejecting a cubic ease-out.
    expect(bakeMix({ progress: 0.25, returning: false })).toBeCloseTo(0.25, 6);
    expect(bakeMix({ progress: 0.5, returning: false })).toBeCloseTo(0.5, 6);
  });

  /**
   * **The asymmetry, and it is the OPPOSITE of the one that was wrong for
   * durations.** There, equal was right: a record going back at speed read as
   * dropped. Here the claim is about ATTENTION rather than the object — the wall
   * coming back into focus is not what the reader is watching, so it can clear
   * early and leave the return uncluttered.
   *
   * Checked rather than trusted: the test states what "clears early" means, so
   * the value is a decision rather than a feeling.
   */
  it('clears early on the return rather than tracking the whole way', () => {
    expect(RETURN_CLEAR_FRACTION).toBeLessThan(1);
    expect(RETURN_CLEAR_FRACTION, 'but not instantly, which is the snap again').toBeGreaterThan(0.2);

    // Reading 1 -> 0, the blur is gone before the record is home.
    const atClear = bakeMix({ progress: 1 - RETURN_CLEAR_FRACTION, returning: true });
    expect(atClear).toBeCloseTo(0, 6);
  });

  it('is still full at the start of the return', () => {
    expect(bakeMix({ progress: 1, returning: true })).toBe(1);
  });

  it('never leaves the 0..1 range in either direction', () => {
    for (const returning of [false, true]) {
      for (let t = 0; t <= 1; t += 0.05) {
        const mix = bakeMix({ progress: t, returning });
        expect(mix).toBeGreaterThanOrEqual(0);
        expect(mix).toBeLessThanOrEqual(1);
      }
    }
  });
});
