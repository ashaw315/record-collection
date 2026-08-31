import { describe, expect, it } from 'vitest';
import { bakeResolution, BAKE_DOWNSAMPLE, bakeOpacity } from './wall-bake';

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
