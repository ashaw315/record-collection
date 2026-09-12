/**
 * The record's stored colour, lightened until black type is legible on it —
 * §5 of the 7a build target.
 *
 * **One stored value, one derived variant.** The 72px year and its label sit ON
 * the filled module in black, so the fill must be light enough to carry black
 * text. That is not guaranteed by the stored value, which is the dominant
 * chromatic region of a cover and owes nothing to legibility.
 *
 * **The `ink` variant is gone (revised §5).** It darkened the same hue for the
 * 40px market figure set in the colour — and that figure is retired along with
 * the 8px path bar, because the cover now carries the colour: at six columns it
 * is 23.4% of the grid where the derived mark it replaced was 0.06%. Pale 40px
 * ink reads as dark text and a pale 8px bar reads as a hairline, so both failed
 * once the chroma measurement came in. The filled module survives at low chroma
 * because area substitutes for chroma — a pale tint at 412 × 226 still reads as
 * a deliberate field.
 *
 * So nothing is set in the colour any more, and the only obligation left is the
 * one this module was built for.
 *
 * **The contrast floor is enforced here rather than trusted.** A state shipped
 * in this repo at 1.29:1 behind a test asserting two token strings differed, so
 * the derivation loops until the ratio clears 4.5:1 and the tests measure the
 * ratio rather than the fact that a variant was produced.
 *
 * Pure and browser-independent: the conversions are the same ones `oklch()`
 * uses, so what the tests measure is what renders.
 */

/** Below this chroma a colour has no hue worth preserving — see `isNearGrey`. */
export const NEAR_GREY_CHROMA = 0.04;

/** WCAG's floor for normal text, which both marks carry. */
const CONTRAST_FLOOR = 4.5;

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

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (rgb === null) return 0;

  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

/**
 * WCAG contrast between two hex colours. Symmetric, 1:1 to 21:1.
 *
 * Exported because the tests measure with it: a derivation that claims to clear
 * the floor and is never measured against it is the proxy failure this module
 * exists to avoid.
 */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);

  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export type RecordColour = {
  /** Lightened: carries BLACK text on the filled module. */
  fill: string;
  /**
   * True when the stored colour has too little chroma to read as a colour.
   *
   * **Reported, and deliberately NOT acted on.** Revised §5: the marks are not
   * conditional on chroma, because a field shown only above a threshold makes
   * the composition differ between records for a reason the reader cannot see.
   * All records or none, decided once from the collection-wide measurement —
   * twelve of seventeen near-grey, six of which no derivation rescues.
   */
  isNearGrey: boolean;
  chroma: number;
  storedHue: number;
  fillHue: number;
  fillL: number;
};

/**
 * Walk lightness until the mark clears the floor.
 *
 * Lightness is moved and CHROMA IS HELD, so the hue survives the derivation —
 * §5 wants one colour in two variants, not two colours. The step is small
 * enough that the result is the nearest legible lightness rather than a jump to
 * the extreme.
 */
function resolve(base: Oklch, against: string, direction: 1 | -1): Oklch {
  let candidate = { ...base };

  for (let step = 0; step <= 100; step += 1) {
    const hex = oklchToHex(candidate);
    if (contrastRatio(hex, against) >= CONTRAST_FLOOR) return candidate;

    candidate = { ...candidate, L: Math.min(1, Math.max(0, candidate.L + direction * 0.01)) };
  }

  return candidate;
}

/**
 * The two marks a record's stored colour produces, or `null` when it has none.
 *
 * **`null` is an honest absence and must stay one.** §7: the record with no
 * cover has no stored colour, which removes all four colour marks. Defaulting
 * to a grey would make it indistinguishable from the twelve records whose
 * covers genuinely average to near-grey.
 */
export function deriveRecordColour(stored: string | null): RecordColour | null {
  if (stored === null) return null;

  const rgb = parseHex(stored);
  if (rgb === null) return null;

  const base = rgbToOklch(rgb);

  /* Lighten only: black type sits on this, and nothing is set in the colour. */
  const fill = resolve(base, '#000000', 1);

  return {
    fill: oklchToHex(fill),
    isNearGrey: base.C < NEAR_GREY_CHROMA,
    chroma: base.C,
    storedHue: base.h,
    fillHue: fill.h,
    fillL: fill.L,
  };
}
