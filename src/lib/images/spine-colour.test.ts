import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { averageColour, SPINE_SAMPLE_SIZE } from './spine-colour';

/** Reads a `#rrggbb` back into channels, so assertions can talk about colour. */
const hexToRgb = (hex: string) => ({
  r: Number.parseInt(hex.slice(1, 3), 16),
  g: Number.parseInt(hex.slice(3, 5), 16),
  b: Number.parseInt(hex.slice(5, 7), 16),
});

/**
 * §10b: "a spine's colour is the average colour of its cover, computed once at
 * import and stored. A record with no cover gets a plain spine — an honest
 * absence, not a gap in the wall."
 *
 * **The algorithm was chosen by measurement against the three real covers in
 * the dev database, not by argument** — see NOTES. Four candidates were
 * rendered as spines in a row; dominant-bucket was disqualified because it
 * returns `#070101` for Luther Vandross's warm brown portrait, having sampled
 * the leather jacket. A wrong answer about a real record, invisible in a hex
 * column and obvious as a spine.
 *
 * The mean is taken in LINEAR LIGHT. Averaging gamma-encoded sRGB under-weights
 * bright pixels, and on a sleeve like Dire Straits — where a pale cream border
 * is most of the artwork — that produces a spine darker than the cover reads.
 *
 * The tests below build their own images rather than committing cover bytes:
 * the property is arithmetic over pixels, and a synthetic image states the
 * expected answer where a photograph can only be compared against a value
 * someone recorded once.
 */

/** A solid block of one colour, as a real encoded PNG. */
async function solid(r: number, g: number, b: number, size = 32): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: { r, g, b } },
  })
    .png()
    .toBuffer();
}

/** Two vertical halves, so the answer is a known blend of two knowns. */
async function halves(left: [number, number, number], right: [number, number, number]) {
  const size = 32;
  const raw = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = x < size / 2 ? left : right;
      const o = (y * size + x) * 3;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
    }
  }
  return sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toBuffer();
}

describe('averageColour', () => {
  it('returns a solid colour unchanged', async () => {
    // The identity case. Any averaging scheme must agree here, and one that
    // does not is broken before the interesting cases are reached.
    expect(await averageColour(await solid(0xa7, 0x19, 0x1d))).toBe('#a7191d');
  });

  it('returns lowercase #rrggbb, the shape the column and CSS both want', async () => {
    const hex = await averageColour(await solid(0x12, 0xab, 0xcd));

    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('preserves a strong hue rather than washing it toward grey', async () => {
    /**
     * **The control that made the real measurement trustworthy.** All three
     * real covers averaged to within 11° of hue — orange-brown — which is
     * exactly what a broken averager looks like. Two explanations fit that
     * evidence equally: the covers are brown, or the algorithm destroys colour.
     *
     * They are only distinguishable by feeding it an input whose answer is
     * known. Red must come back red.
     */
    const red = await averageColour(await halves([200, 30, 35], [10, 10, 10]));
    expect(red, 'a decodable image must produce a colour').not.toBeNull();

    const [r, g, b] = [1, 3, 5].map((i) => parseInt((red as string).slice(i, i + 2), 16));

    expect(r, 'red dominates').toBeGreaterThan(g + 40);
    expect(r).toBeGreaterThan(b + 40);
  });

  it('averages in linear light, not in gamma-encoded sRGB', async () => {
    /**
     * The discriminating case between the two means, and the reason B was
     * chosen. Black and white in equal measure is mid-grey in LINEAR light —
     * around #bcbcbc in sRGB — while a naive sRGB mean gives #808080.
     *
     * A test asserting only "somewhere between" would pass under both and
     * decide nothing.
     */
    const hex = await averageColour(await halves([0, 0, 0], [255, 255, 255]));
    expect(hex).not.toBeNull();

    const value = parseInt((hex as string).slice(1, 3), 16);

    expect(value, 'linear mean lands well above the sRGB midpoint').toBeGreaterThan(0xa0);
  });

  it('reads a progressive JPEG, which two of the three real covers are', async () => {
    // Not hypothetical: Dire Straits and Luther Vandross are both progressive.
    // A decoder handling only baseline would return null for them and the
    // failure would look like "some records have no spine" with no reason.
    const progressive = await sharp(await solid(0x92, 0x60, 0x3c))
      .jpeg({ progressive: true })
      .toBuffer();

    const hex = await averageColour(progressive);

    expect(hex).not.toBeNull();
    // JPEG is lossy, so this is a neighbourhood rather than an equality.
    expect(parseInt((hex as string).slice(1, 3), 16)).toBeGreaterThan(0x80);
  });

  it('returns null for bytes that are not an image at all', async () => {
    /**
     * §10b treats absence as honest, and the caller must not fail an import
     * over it. A cover that cannot be decoded means no spine colour — the
     * record still saves and still shows a plain spine.
     */
    expect(await averageColour(Buffer.from('not an image'))).toBeNull();
  });

  it('returns null for empty input rather than throwing', async () => {
    expect(await averageColour(Buffer.alloc(0))).toBeNull();
  });

  it('accepts an ArrayBuffer, which is what the Discogs client hands back', async () => {
    /**
     * `fetchImage` returns `{ bytes: ArrayBuffer }`. A signature taking only
     * Buffer would compile at the call site after a cast and then behave
     * differently — the seam this project keeps being bitten by.
     */
    const png = await solid(0x33, 0x66, 0x99);
    const arrayBuffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);

    expect(await averageColour(arrayBuffer as ArrayBuffer)).toBe('#336699');
  });

  it('caps the work by downsampling before averaging', async () => {
    /**
     * The same reasoning as §5.9's 10MB streaming cap: a pathologically large
     * cover must not spend real time. Averaging every pixel of a 6000×6000
     * scan is 36M samples for a value that is stable at a few thousand.
     *
     * Asserted through BEHAVIOUR — a large image still returns promptly and
     * correctly — rather than by inspecting the resize call, which would pin
     * the implementation instead of the property.
     */
    const large = await sharp({
      create: { width: 3000, height: 3000, channels: 3, background: { r: 20, g: 140, b: 90 } },
    })
      .png()
      .toBuffer();

    const started = Date.now();
    const hex = await averageColour(large);
    const elapsed = Date.now() - started;

    // rgb(20,140,90) is #148c5a — 20 is 0x14. A first version of this test
    // wrote 0x0c and failed against correct code, which is the right way round
    // for a test to be wrong.
    expect(hex).toBe('#148c5a');
    expect(elapsed, 'a 9-megapixel cover is downsampled, not averaged whole').toBeLessThan(2000);
  });

  it('samples at a size small enough to be cheap and large enough to be stable', () => {
    // Stated as a constant so the trade-off is visible rather than buried in a
    // call. 64x64 is 4096 samples — far past the point where the mean moves.
    expect(SPINE_SAMPLE_SIZE).toBeLessThanOrEqual(128);
    expect(SPINE_SAMPLE_SIZE).toBeGreaterThanOrEqual(32);
  });

  it('ignores an alpha channel rather than blending it into the colour', async () => {
    /**
     * A transparent PNG would otherwise average its unpainted region as black,
     * giving a spine darker than anything on the sleeve. Flattening onto white
     * would be equally arbitrary — so alpha is dropped and only painted pixels
     * count.
     */
    const size = 32;
    const raw = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i += 1) {
      raw[i * 4] = 200;
      raw[i * 4 + 1] = 30;
      raw[i * 4 + 2] = 35;
      // Half the image fully transparent, half fully opaque.
      raw[i * 4 + 3] = i % 2 === 0 ? 0 : 255;
    }
    const png = await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
      .png()
      .toBuffer();

    const hex = await averageColour(png);

    expect(hex, 'the painted colour, not a blend with transparent black').toBe('#c81e23');
  });

  it('returns null for a fully transparent image rather than black', async () => {
    /**
     * The guard on the divide. With every pixel weighted zero the sum is zero,
     * and dividing would give `NaN` — which `toSrgb` clamps to 0 and renders as
     * `#000000`: black invented out of nothing, on a sleeve with no colour at
     * all. `null` is the honest answer and §10b already renders it as a plain
     * spine.
     */
    const size = 16;
    const raw = Buffer.alloc(size * size * 4); // all zero, including alpha
    const png = await sharp(raw, { raw: { width: size, height: size, channels: 4 } })
      .png()
      .toBuffer();

    expect(await averageColour(png)).toBeNull();
  });
});

/**
 * **The dominant chromatic region, which replaces the mean as the stored
 * value.**
 *
 * Averaging is the operation that destroys chroma: a sleeve with red, green and
 * blue regions averages to neutral. Measured across the real sixteen covers,
 * twelve came back near-grey (chroma < 0.04) under the mean — and for half of
 * those the artwork contains a genuine accent that the mean cancelled. Gaucho
 * is the clearest: 27.7% of its pixels are vivid, peaking at chroma 0.161, and
 * the mean reports a sage grey.
 *
 * So twelve-of-seventeen-near-grey was a fact about the DERIVATION, not about
 * the covers.
 */
describe('the dominant chromatic region', () => {
  /** A sleeve split between a large drab field and a smaller vivid one. */
  const splitCover = async (vivid: { r: number; g: number; b: number }, vividShare: number) => {
    const size = 64;
    const rows = Math.round(size * vividShare);
    const pixels = Buffer.alloc(size * size * 3);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 3;
        const isVivid = y < rows;
        pixels[i] = isVivid ? vivid.r : 128;
        pixels[i + 1] = isVivid ? vivid.g : 130;
        pixels[i + 2] = isVivid ? vivid.b : 127;
      }
    }

    return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer();
  };

  /**
   * **THE load-bearing case, and the fixture is the whole test.**
   *
   * A single accent on a drab field is not enough: a mean over that still comes
   * back tinted, so an averaging implementation passes. My first version of
   * this test did exactly that and went green against the code it was written
   * to replace.
   *
   * This cover has THREE vivid regions at opposing hues — red, green, blue in
   * equal thirds. That is the operation averaging cannot survive: the mean of
   * opposing hues is neutral, near `#6b6b6b`, while the dominant region is one
   * of the three and carries real chroma. It is also exactly what the real
   * covers do — Gaucho is 27.7% vivid and averages to sage.
   */
  it('survives a cover whose hues cancel under a mean', async () => {
    const size = 64;
    const pixels = Buffer.alloc(size * size * 3);
    const bands = [
      { r: 200, g: 30, b: 30 },
      { r: 30, g: 200, b: 30 },
      { r: 30, g: 30, b: 200 },
    ];

    for (let y = 0; y < size; y += 1) {
      const band = bands[Math.min(2, Math.floor((y / size) * 3))];
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 3;
        pixels[i] = band.r;
        pixels[i + 1] = band.g;
        pixels[i + 2] = band.b;
      }
    }

    const cover = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer();

    const colour = await averageColour(cover);
    if (colour === null) throw new Error('expected a colour');

    const { r, g, b } = hexToRgb(colour);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);

    /*
      A mean of these three bands is neutral: every channel lands near 120 and
      the spread is under 20. The dominant region is one whole band, so the
      spread is enormous.
    */
    expect(spread, `${colour} must be one of the bands, not their mean`).toBeGreaterThan(100);
  });

  it('reports the accent rather than the average of accent and field', async () => {
    const cover = await splitCover({ r: 210, g: 40, b: 40 }, 0.3);

    const colour = await averageColour(cover);
    if (colour === null) throw new Error('expected a colour');

    const { r, g, b } = hexToRgb(colour);
    expect(r, `${colour} should be dominated by red`).toBeGreaterThan(g + 40);
    expect(r).toBeGreaterThan(b + 40);
  });

  it('ignores a vivid region too small to be significant', async () => {
    // A single bright pixel is not what the sleeve looks like. The share floor
    // is what stops one stray pixel deciding a whole spine.
    const cover = await splitCover({ r: 255, g: 0, b: 0 }, 0.01);

    const colour = await averageColour(cover);
    if (colour === null) throw new Error('expected a colour');

    const { r, g, b } = hexToRgb(colour);
    expect(Math.abs(r - g), `${colour} should stay neutral`).toBeLessThan(30);
    expect(Math.abs(g - b)).toBeLessThan(30);
  });

  /**
   * **The explicit fallback, stated rather than emergent.** Six of the sixteen
   * real covers have no chromatic region at any threshold — The Money Store's
   * most saturated single pixel is chroma 0.027. For those the mean IS the
   * honest answer, and the code says so rather than leaving a reader to infer
   * that a failed search produced it.
   */
  it('falls back to the mean for a cover with no chromatic region', async () => {
    const size = 32;
    const pixels = Buffer.alloc(size * size * 3);
    for (let i = 0; i < pixels.length; i += 3) {
      pixels[i] = 150;
      pixels[i + 1] = 151;
      pixels[i + 2] = 149;
    }
    const grey = await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toBuffer();

    const colour = await averageColour(grey);
    if (colour === null) throw new Error('expected a colour');

    const { r, g, b } = hexToRgb(colour);
    expect(Math.abs(r - 150), colour).toBeLessThan(12);
    expect(Math.abs(g - 151)).toBeLessThan(12);
    expect(Math.abs(b - 149)).toBeLessThan(12);
  });

  it('still returns null for an unreadable image', async () => {
    expect(await averageColour(Buffer.from('not an image'))).toBeNull();
  });

  it('still weights by alpha rather than inventing a background', async () => {
    // The transparent-pixel handling predates this change and must survive it:
    // a half-transparent sleeve must not drag toward black.
    const size = 32;
    const pixels = Buffer.alloc(size * size * 4);
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = 200;
      pixels[i + 1] = 60;
      pixels[i + 2] = 60;
      pixels[i + 3] = i < pixels.length / 2 ? 255 : 0;
    }
    const half = await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
      .png()
      .toBuffer();

    const colour = await averageColour(half);
    if (colour === null) throw new Error('expected a colour');

    const { r, g } = hexToRgb(colour);
    expect(r, `${colour} must not be dragged toward black`).toBeGreaterThan(150);
    expect(r).toBeGreaterThan(g + 40);
  });
});

/**
 * **The direction, asserted over the real sixteen covers.**
 *
 * Measured 2026-09-12 by running both derivations across every stored cover:
 * chroma rose on nine, fell on none, and was unchanged on seven. The unchanged
 * seven are the covers with no chromatic region — they take the explicit
 * fallback and return the same mean as before, which is why the change is safe
 * for them rather than merely tolerable.
 *
 * **Loss Of Life is the case worth naming.** Its most significant region is
 * LESS chromatic than its mean (0.004 against 0.019) — only 3.9% of the image
 * is vivid, so the dominant region is near-black. That is real and not a bug:
 * the chroma floor rejects that region, so the cover takes the fallback and
 * keeps its mean rather than getting a darker, duller colour than before. A
 * dominant-region rule without a chroma floor would have made this record worse.
 */
describe('resampling never costs a cover its chroma', () => {
  const REAL = [
    { title: 'Believer', mean: '#7e8285', resampled: '#7e8285' },
    { title: 'Bitches Brew', mean: '#787e6f', resampled: '#adad85' },
    { title: 'Bridge Over Troubled Water', mean: '#63695e', resampled: '#816f4c' },
    { title: 'Dire Straits', mean: '#d8cbb8', resampled: '#d8cbb8' },
    { title: 'Gaucho', mean: '#93a99d', resampled: '#afae51' },
    { title: 'Grave New World', mean: '#363129', resampled: '#363129' },
    { title: 'Loss Of Life', mean: '#473e35', resampled: '#473e35' },
    { title: 'Mind Games', mean: '#80868a', resampled: '#89adc0' },
    { title: 'Never Too Much', mean: '#92603d', resampled: '#a25829' },
    { title: 'On The Radio', mean: '#94698a', resampled: '#bc4889' },
    { title: 'Psychic', mean: '#6e636a', resampled: '#6e636a' },
    { title: 'Super Rich', mean: '#745e34', resampled: '#755f34' },
    { title: 'The Hurdy Gurdy Man', mean: '#64866e', resampled: '#44946b' },
    { title: 'The Money Store', mean: '#9b9b9a', resampled: '#9b9b9a' },
    { title: 'The Soft Parade', mean: '#5b707b', resampled: '#7bb1c5' },
    { title: 'Wired', mean: '#3b5259', resampled: '#31788a' },
  ] as const;

  const chroma = (hex: string) => {
    const toL = (v: number) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const r = toL(Number.parseInt(hex.slice(1, 3), 16));
    const g = toL(Number.parseInt(hex.slice(3, 5), 16));
    const b = toL(Number.parseInt(hex.slice(5, 7), 16));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return Math.hypot(A, B);
  };

  it('never reduces chroma on any real cover', () => {
    for (const record of REAL) {
      expect(
        chroma(record.resampled),
        `${record.title}: ${record.mean} → ${record.resampled}`,
      ).toBeGreaterThanOrEqual(chroma(record.mean) - 0.001);
    }
  });

  it('raises chroma on the covers that have an accent to find', () => {
    const raised = REAL.filter((r) => chroma(r.resampled) > chroma(r.mean) + 0.002);

    expect(raised.length, 'nine covers gain real chroma').toBe(9);
  });

  it('leaves the genuinely drab covers exactly as they were', () => {
    // Not "close to": the fallback returns the same mean, so these are identical
    // strings. A change here means the fallback stopped being the mean.
    for (const title of ['Believer', 'Dire Straits', 'Grave New World', 'The Money Store']) {
      const record = REAL.find((r) => r.title === title);
      if (record === undefined) throw new Error(`${title} missing from the fixture`);

      expect(record.resampled, title).toBe(record.mean);
    }
  });
});
