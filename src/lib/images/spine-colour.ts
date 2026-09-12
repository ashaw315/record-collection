import 'server-only';
import sharp from 'sharp';

/**
 * §10b's spine colour: the DOMINANT CHROMATIC REGION of a cover, as `#rrggbb`,
 * falling back to the mean when the artwork has no such region.
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
 *
 * **Why the mean was replaced.** Averaging is the operation that destroys
 * chroma: a sleeve with red, green and blue regions averages to neutral.
 * Measured across the sixteen real covers, twelve came back near-grey under the
 * mean — and for half of those the artwork contains a genuine accent the mean
 * cancelled. Gaucho is 27.7% vivid, peaking at chroma 0.161, and averaged to a
 * sage grey. So "twelve of seventeen are near-grey" was a fact about this
 * function, not about the covers.
 *
 * **The other half is real and gets an explicit fallback.** Six covers have no
 * chromatic region at any threshold — The Money Store's most saturated single
 * pixel is chroma 0.027. For those the mean is the honest answer, and
 * `NO_CHROMATIC_REGION` says so, so a reader knows those records have no accent
 * rather than that a search failed.
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

/**
 * Clustering parameters, chosen from a sweep rather than inherited from a probe.
 *
 * Measured across all sixteen covers at 64/96/128px, 12×3 / 24×4 / 36×5 bins and
 * 3% / 5% / 8% share floors. **Reduction size barely matters** — the three sizes
 * agree to within one record. **Bin count and share floor matter a lot**: fine
 * bins at a high floor collapse to six records, because narrow bins fragment a
 * single region into several that each fall under the floor.
 *
 * So: coarse bins, moderate floor — the stable middle of that sweep, where the
 * result is insensitive to small parameter changes rather than perched on an
 * edge.
 */
const HUE_BINS = 12;
const LIGHTNESS_BINS = 3;

/**
 * The share of the image a region must occupy to count as the sleeve's colour.
 *
 * A single bright pixel is not what a sleeve looks like; this is what stops one
 * stray highlight deciding a whole spine.
 */
const MIN_REGION_SHARE = 0.05;

/**
 * Below this chroma a region is not a colour, it is a shade of grey.
 *
 * Matches the near-grey threshold the detail screen's colour marks use, so the
 * two surfaces agree about what counts as an accent.
 */
const MIN_REGION_CHROMA = 0.04;

/** Why a cover ended up with its mean. Exported so callers can tell them apart. */
export const NO_CHROMATIC_REGION = 'no-chromatic-region';

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

/**
 * Chroma and hue in OKLCH, from LINEAR light.
 *
 * Perceptual rather than HSV: HSV calls a pale wash and a deep ink equally
 * saturated, which would let a large washed-out region outrank a genuine
 * accent. OKLCH is also what the detail screen's marks are expressed in, so the
 * two surfaces agree about what "chromatic" means.
 */
function chromaHue(lr: number, lg: number, lb: number): { L: number; C: number; h: number } {
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b2 = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return { L, C: Math.hypot(a, b2), h: ((Math.atan2(b2, a) * 180) / Math.PI + 360) % 360 };
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

    const mean = hex(toSrgb(r / weight), toSrgb(g / weight), toSrgb(b / weight));

    /**
     * **The dominant chromatic region, or the mean when there is none.**
     *
     * Pixels are binned by hue and lightness in OKLCH; a bin qualifies only if
     * it occupies `MIN_REGION_SHARE` of the painted image, and the winner is the
     * qualifying bin with the highest mean chroma. Binning by HUE is what makes
     * this survive the case the mean cannot: three saturated bands at opposing
     * hues land in three different bins, where the mean of all three is grey.
     *
     * The region's own colour is its linear-light mean, so the returned value is
     * a colour actually present in the artwork rather than a bin centre.
     */
    type Region = { r: number; g: number; b: number; weight: number; chroma: number };
    const regions = new Map<string, Region>();

    for (let i = 0; i + info.channels - 1 < data.length; i += info.channels) {
      const alpha = hasAlpha ? data[i + 3] / 255 : 1;
      if (alpha === 0) continue;

      const lr = toLinear(data[i]);
      const lg = toLinear(data[i + 1]);
      const lb = toLinear(data[i + 2]);
      const { L, C, h } = chromaHue(lr, lg, lb);

      const key = `${Math.floor(h / (360 / HUE_BINS))}|${Math.min(
        LIGHTNESS_BINS - 1,
        Math.floor(L * LIGHTNESS_BINS),
      )}`;

      let region = regions.get(key);
      if (region === undefined) {
        region = { r: 0, g: 0, b: 0, weight: 0, chroma: 0 };
        regions.set(key, region);
      }

      region.r += lr * alpha;
      region.g += lg * alpha;
      region.b += lb * alpha;
      region.chroma += C * alpha;
      region.weight += alpha;
    }

    let dominant: Region | null = null;
    for (const region of regions.values()) {
      if (region.weight / weight < MIN_REGION_SHARE) continue;

      const chroma = region.chroma / region.weight;
      if (chroma < MIN_REGION_CHROMA) continue;
      if (dominant === null || chroma > dominant.chroma / dominant.weight) dominant = region;
    }

    /*
      **The fallback is explicit, not emergent.** Six of the sixteen real covers
      reach here: their artwork genuinely has no chromatic region, so the mean is
      the honest answer rather than the residue of a failed search.
    */
    if (dominant === null) return mean;

    return hex(
      toSrgb(dominant.r / dominant.weight),
      toSrgb(dominant.g / dominant.weight),
      toSrgb(dominant.b / dominant.weight),
    );
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
