import 'server-only';
import sharp from 'sharp';

/**
 * §10b's spine colour: the average colour of a cover, as `#rrggbb`.
 *
 * **Chosen by measurement, not argument.** Four candidates were run against the
 * three real covers in the dev database and rendered as spines in a row (see
 * NOTES). Dominant-colour-by-bucket was disqualified: it returns `#070101` for
 * Luther Vandross's warm brown portrait, having sampled the leather jacket —
 * a wrong answer about a real record, invisible in a table of hex values and
 * obvious the moment it is a spine.
 *
 * **Never throws.** A cover that cannot be decoded returns `null`, which §10b
 * already has a meaning for: a plain spine, "an honest absence, not a gap in
 * the wall". An import must not fail because an image was unreadable — the
 * record is what the user entered, the colour is a garnish.
 */

/**
 * The square the cover is reduced to before averaging.
 *
 * 64×64 is 4,096 samples, far past the point where a mean stops moving, and it
 * caps the work regardless of what arrives: a 6000×6000 scan would otherwise be
 * 36M samples for a value that is stable at a few thousand. Same reasoning as
 * §5.9's 10MB streaming cap on uploads — bound the work at the boundary rather
 * than trusting the input to be reasonable.
 *
 * `fit: 'fill'` deliberately: this is a colour average, so aspect ratio does not
 * matter and preserving it would silently sample some covers more heavily along
 * one axis.
 */
export const SPINE_SAMPLE_SIZE = 64;

/** sRGB -> linear light. */
function toLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Linear light -> sRGB. */
function toSrgb(value: number): number {
  const c = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, c * 255)));
}

function hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The average colour of an encoded image, or `null` if it cannot be read.
 *
 * Takes `ArrayBuffer` as well as `Buffer` because that is what the Discogs
 * client's `fetchImage` returns — a signature accepting only `Buffer` would
 * compile at the call site after a cast and then behave differently, which is
 * the seam class this project keeps meeting.
 */
export async function averageColour(input: ArrayBuffer | Buffer): Promise<string | null> {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.byteLength === 0) return null;

  try {
    /**
     * **The alpha channel is KEPT here and weighted in the loop below**, rather
     * than dropped with `removeAlpha`.
     *
     * That is not the obvious pipeline, and the obvious one is wrong. Measured
     * on a half-transparent red square: `.removeAlpha().resize(...)` still
     * emits pixels of `0,0,0` that were never in the image, because sharp
     * premultiplies during resampling and a transparent neighbour contributes
     * nothing but drags the interpolation toward zero. Reordering does not fix
     * it and `kernel: 'nearest'` does not either — both were tried.
     *
     * Weighting by alpha in our own loop is exact: a fully transparent pixel
     * contributes nothing at all, a half-transparent one contributes half, and
     * no synthetic colour is introduced. Flattening onto white or black would
     * both invent a background the sleeve does not have.
     */
    const { data, info } = await sharp(bytes)
      .resize(SPINE_SAMPLE_SIZE, SPINE_SAMPLE_SIZE, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels < 3 || data.length < 3) return null;

    /**
     * **The mean is taken in LINEAR LIGHT, then converted back.**
     *
     * Averaging gamma-encoded sRGB under-weights bright pixels: black and white
     * in equal measure gives #808080 rather than the ~#bcbcbc a viewer reads as
     * the midpoint. Measured on the real covers, the linear mean is lighter on
     * every one — and on Dire Straits, where a pale cream border is most of the
     * sleeve, it is the difference between a spine that matches the artwork and
     * one that does not.
     */
    let r = 0;
    let g = 0;
    let b = 0;
    let weight = 0;

    const hasAlpha = info.channels === 4;

    for (let i = 0; i + info.channels - 1 < data.length; i += info.channels) {
      // 0 for fully transparent, 1 for opaque — so unpainted pixels contribute
      // nothing rather than contributing black.
      const alpha = hasAlpha ? data[i + 3] / 255 : 1;
      if (alpha === 0) continue;

      r += toLinear(data[i]) * alpha;
      g += toLinear(data[i + 1]) * alpha;
      b += toLinear(data[i + 2]) * alpha;
      weight += alpha;
    }

    /**
     * A fully transparent image has no colour to report, which is `null` — the
     * same absence as no cover at all. Guarding the divide as well: a zero
     * weight here would produce `NaN` and then `#000000`, black invented out of
     * nothing.
     */
    if (weight === 0) return null;

    return hex(toSrgb(r / weight), toSrgb(g / weight), toSrgb(b / weight));
  } catch {
    /**
     * Swallowed deliberately, and this is the only place it is. §10b's absence
     * is a real state, so an unreadable cover is not an error condition — it is
     * a record with no spine colour. The caller decides whether to log; nothing
     * here should fail an import.
     */
    return null;
  }
}
