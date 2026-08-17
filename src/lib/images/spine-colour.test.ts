import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { averageColour, SPINE_SAMPLE_SIZE } from './spine-colour';

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
