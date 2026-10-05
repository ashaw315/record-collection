/**
 * The bounded-crop fixtures (Adam's ruling, 5 Oct): a cover photo is cropped
 * to its square where its shorter side is at least 95% of its longer, and
 * fitted beyond that. No record in the collection is outside the bound, so
 * the rule can only be seen on fixtures, tested from both sides of 95% as
 * step 76's breakpoints were.
 *
 * Each image is drawn so a crop is visible without text: a dark frame on
 * every edge, a grid every 50px, and a different colour in each corner
 * (red top left, green top right, blue bottom left, black bottom right). A
 * crop cuts the frame and the corner squares on two sides; a fit keeps all
 * four whole. Generated with Node's zlib alone, so the files can be made
 * again exactly: `node test/fixtures/covers/generate.mjs`.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BOUND = 0.95;

export const FIXTURES = [
  { file: 'cover-inside-1000x951.png', width: 1000, height: 951 },
  { file: 'cover-at-bound-1000x950.png', width: 1000, height: 950 },
  { file: 'cover-outside-1000x949.png', width: 1000, height: 949 },
  { file: 'cover-far-1200x900.png', width: 1200, height: 900 },
  /*
    Portrait, for a specific bug: the rule compares the shorter side with
    the longer, so code that compares width with height passes every
    landscape case and fails these. Believer, 581 x 600, the only real cover
    near the bound, is portrait.
  */
  { file: 'cover-inside-portrait-951x1000.png', width: 951, height: 1000 },
  { file: 'cover-outside-portrait-949x1000.png', width: 949, height: 1000 },
];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function pixel(x, y, w, h) {
  const FRAME = 20, CORNER = 120;
  if (x < CORNER && y < CORNER) return [200, 40, 40];
  if (x >= w - CORNER && y < CORNER) return [40, 150, 60];
  if (x < CORNER && y >= h - CORNER) return [40, 70, 190];
  if (x >= w - CORNER && y >= h - CORNER) return [20, 20, 20];
  if (x < FRAME || y < FRAME || x >= w - FRAME || y >= h - FRAME) return [43, 33, 24];
  if (x % 50 < 2 || y % 50 < 2) return [138, 111, 77];
  return [217, 203, 176];
}

function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x += 1) {
      const [r, g, b] = pixel(x, y, w, h);
      raw[row + 1 + x * 3] = r; raw[row + 2 + x * 3] = g; raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const manifest = FIXTURES.map((f) => {
  writeFileSync(join(HERE, f.file), png(f.width, f.height));
  const ratio = Math.min(f.width, f.height) / Math.max(f.width, f.height);
  return { ...f, ratio: Number(ratio.toFixed(4)), bound: BOUND, expected: ratio >= BOUND ? 'crop' : 'fit' };
});
writeFileSync(join(HERE, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
for (const m of manifest) console.log(`${m.file}: ${m.width}x${m.height}, ratio ${m.ratio}, ${m.expected}`);
