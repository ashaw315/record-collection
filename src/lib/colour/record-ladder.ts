/**
 * The record's one derived value, as 8a's three-step ladder (§5.2, §5.5).
 *
 * **One value, one ladder, three steps.** Tint at 34% toward paper, base, shade
 * at 26% toward ink. Every coloured pixel on the screen is one of those three.
 * There is no fourth step: three is the most a reader holds as distinct
 * positions, and a fourth makes lightness look like it encodes something.
 *
 * **The step says what KIND of thing the mark is, and that is the system.**
 *   - `base` carries or frames the record's own material — the release-year
 *     field, the bar down the sleeve's edge, the journal's 2px edge.
 *   - `tint` is ground — behind the construction, under the identity block.
 *   - `shade` is a face and never a shape: only ever the right-hand side of a
 *     coloured form.
 *
 * A reader who notices the strong marks always touch the record and the pale
 * ones are always behind something has read it correctly.
 *
 * **Chroma is ceilinged and deliberately NOT floored.** An earlier draft lifted
 * a near-grey to 0.045 at its sampled hue; that asserts a hue the sampler
 * explicitly declined to identify — `MIN_REGION_CHROMA` is a REJECTION
 * threshold, so a cover with no qualifying region returns its linear-light mean
 * precisely because there was no chromatic region to trust. Six of sixteen real
 * covers are in that state, and an invented hue is worse than no hue, because
 * nothing downstream can tell it from a real one.
 *
 * Those six ship as near-greys at the clamped lightness — a warm or cool grey at
 * the right value, which is what those covers are. The ladder is what makes it
 * survivable: three LIGHTNESS steps rather than hue steps, so the construction
 * still reads as an object. The page is keyed to nothing on those records and
 * §5.5's 12–18% colour budget goes to near-zero. Quiet, not faulty.
 */

/** §5.2: the floor is set by the 11px label clearing 4.5:1, not by the 72. */
export const LIGHTNESS_MIN = 0.62;
/** The ceiling stops the field dissolving into paper at oklch(0.925). */
export const LIGHTNESS_MAX = 0.74;
/** Above this, no record shouts. Ceiling only — see the module comment. */
export const CHROMA_CEILING = 0.09;

/** §5.5's steps, as fractions toward paper and toward ink. */
const TINT_TOWARD_PAPER = 0.34;
const SHADE_TOWARD_INK = 0.26;

type Rgb = { r: number; g: number; b: number };
type Oklch = { L: number; C: number; h: number };

const HEX = /^#([0-9a-f]{6})$/i;

function parseHex(hex: string): Rgb | null {
  const match = HEX.exec(hex.trim());
  if (match === null) return null;

  const n = Number.parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const toSrgb = (linear: number): number => {
  const c = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.min(255, Math.max(0, Math.round(c * 255)));
};

function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return { L, C: Math.hypot(a, bb), h: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

function oklchToHex({ L, C, h }: Oklch): string {
  const rad = (h * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const rgb = {
    r: toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };

  return `#${[rgb.r, rgb.g, rgb.b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

export type RecordLadder = {
  /** Ground: behind the construction, under the identity block, the arcs. */
  tint: string;
  /** Carries or frames the record's material: year field, sleeve bar, journal edge. */
  base: string;
  /** A right-hand face, never a shape. */
  shade: string;

  tintL: number;
  baseL: number;
  shadeL: number;
  tintHue: number;
  baseHue: number;
  shadeHue: number;
  baseC: number;
  /** What the cover actually sampled to, before the clamp. */
  sampledC: number;
  sampledHue: number;
};

/**
 * The three steps for a record's stored colour, or `null` when it has none.
 *
 * `null` means §5.3's fallback: all seven marks go INK — filled, not outlined,
 * not omitted. Dropping them would let a missing image change the composition's
 * structure, and a structure that differs between records for a reason the
 * reader cannot name is the wallpaper rule inverted.
 */
export function recordLadder(stored: string | null): RecordLadder | null {
  if (stored === null) return null;

  const rgb = parseHex(stored);
  if (rgb === null) return null;

  const sampled = rgbToOklch(rgb);

  const base: Oklch = {
    /* Lightness clamped ALWAYS: the label has to be legible on the one mark
       that carries type, and every other mark shares the value. */
    L: Math.min(LIGHTNESS_MAX, Math.max(LIGHTNESS_MIN, sampled.L)),
    /* Ceiling only. No floor — see the module comment. */
    C: Math.min(CHROMA_CEILING, sampled.C),
    h: sampled.h,
  };

  /*
    Tint and shade are LIGHTNESS steps off base at the same hue and chroma.
    That is what makes a near-grey ladder still read as one object: three tones
    of the same thing rather than three different greys.
  */
  const tint: Oklch = { ...base, L: base.L + (1 - base.L) * TINT_TOWARD_PAPER };
  const shade: Oklch = { ...base, L: base.L * (1 - SHADE_TOWARD_INK) };

  return {
    tint: oklchToHex(tint),
    base: oklchToHex(base),
    shade: oklchToHex(shade),
    tintL: tint.L,
    baseL: base.L,
    shadeL: shade.L,
    tintHue: tint.h,
    baseHue: base.h,
    shadeHue: shade.h,
    baseC: base.C,
    sampledC: sampled.C,
    sampledHue: sampled.h,
  };
}
