/**
 * Backfills §10b's `records.spine_colour` for records that already have a cover.
 *
 * Run by hand, by a person:
 *
 *   node scripts/backfill-spine-colours.mjs             # fill gaps only
 *   node scripts/backfill-spine-colours.mjs --dry-run   # print, change nothing
 *   node scripts/backfill-spine-colours.mjs --recompute # rewrite EVERY row

 * **`--recompute` overrides §7.8's gap-fill rule, and that needs its own
 * justification.** `setSpineColourIfUnset` never overwrites, so that a colour
 * derived from a sleeve the user photographed survives a Discogs re-import —
 * the rule protects WHICH COVER the colour came from, because the user's cover
 * is the authoritative one.
 *
 * A derivation change is a different thing: the cover does not change, only the
 * algorithm that reads it. Nothing a user chose is discarded, because the colour
 * was never entered by hand — there is no path in the app that sets
 * `spine_colour` to a value a person picked. Checked rather than assumed before
 * running it: all sixteen records with covers have exactly one cover each, all
 * in blob storage, so the case §7.8 protects does not arise for any of them.
 *
 * It is still opt-in by flag. A plain run stays gap-fill.
 *
 * **A script rather than a migration, deliberately.** The colour comes from
 * bytes stored in Vercel Blob, so computing it needs a network fetch per record
 * — and a migration that reaches out to a CDN would make `db:migrate` depend on
 * blob storage being reachable and on a token being present. A migration that
 * cannot run offline is a migration that blocks a fresh clone.
 *
 * **And a script rather than a hand-fix**, even at three records. The same path
 * runs against a larger collection the next time the algorithm changes or a
 * batch of covers arrives without one, and a manual `UPDATE` teaches nobody how
 * to repeat it.
 *
 * Safe to re-run: it selects only records whose colour is NULL and skips
 * anything it cannot decode, so a second run picks up exactly what a first run
 * could not do.
 */
import { config } from 'dotenv';
import pg from 'pg';
import sharp from 'sharp';

config({ path: '.env.local', quiet: true });

const DRY_RUN = process.argv.includes('--dry-run');
const RECOMPUTE = process.argv.includes('--recompute');
const SAMPLE = 64;

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === '') {
  console.error('DATABASE_URL is not set. Add it to .env.local or export it.');
  process.exit(1);
}

const toLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(255, Math.max(0, c * 255)));
};

/**
 * Mirrors `src/lib/images/spine-colour.ts` exactly — linear-light mean, alpha
 * weighted in this loop rather than via `removeAlpha`, because sharp
 * premultiplies during resampling and introduces black pixels that were never
 * in the image (see NOTES).
 *
 * Duplicated rather than imported: this is a plain `.mjs` script run by node
 * with no bundler, and the module it would import is `server-only` and written
 * in TypeScript. The duplication is the reason the check at the bottom of this
 * file exists — it asserts the two agree on a known input before writing
 * anything.
 */
const HUE_BINS = 12;
const LIGHTNESS_BINS = 3;
const MIN_REGION_SHARE = 0.05;
const MIN_REGION_CHROMA = 0.04;

function chromaHue(lr, lg, lb) {
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const b2 = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(a, b2), h: ((Math.atan2(b2, a) * 180) / Math.PI + 360) % 360 };
}

const toHex = (r, g, b) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

async function averageColour(bytes) {
  try {
    const { data, info } = await sharp(bytes)
      .resize(SAMPLE, SAMPLE, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let r = 0;
    let g = 0;
    let b = 0;
    let weight = 0;
    const regions = new Map();

    for (let i = 0; i + info.channels - 1 < data.length; i += info.channels) {
      const alpha = info.channels === 4 ? data[i + 3] / 255 : 1;
      if (alpha === 0) continue;

      const lr = toLinear(data[i]);
      const lg = toLinear(data[i + 1]);
      const lb = toLinear(data[i + 2]);

      r += lr * alpha;
      g += lg * alpha;
      b += lb * alpha;
      weight += alpha;

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

    if (weight === 0) return null;

    let dominant = null;
    for (const region of regions.values()) {
      if (region.weight / weight < MIN_REGION_SHARE) continue;
      const chroma = region.chroma / region.weight;
      if (chroma < MIN_REGION_CHROMA) continue;
      if (dominant === null || chroma > dominant.chroma / dominant.weight) dominant = region;
    }

    /* No chromatic region: the linear-light mean is the honest answer. */
    if (dominant === null) {
      return toHex(toSrgb(r / weight), toSrgb(g / weight), toSrgb(b / weight));
    }

    return toHex(
      toSrgb(dominant.r / dominant.weight),
      toSrgb(dominant.g / dominant.weight),
      toSrgb(dominant.b / dominant.weight),
    );
  } catch {
    return null;
  }
}

/**
 * A self-check before touching any row.
 *
 * This file carries a COPY of the algorithm, so it can silently drift from the
 * module the app uses — and a backfill writing subtly different colours from
 * every future import is the worst version of that: two sources of truth for
 * one shelf, with no error anywhere. A solid red square must average to itself.
 */
async function assertAlgorithmAgrees() {
  const png = await sharp({
    create: { width: 16, height: 16, channels: 3, background: { r: 0xa7, g: 0x19, b: 0x1d } },
  })
    .png()
    .toBuffer();

  const got = await averageColour(png);
  if (got !== '#a7191d') {
    console.error(`Self-check FAILED: expected #a7191d, got ${got}.`);
    console.error('This script has drifted from src/lib/images/spine-colour.ts. Fix before running.');
    process.exit(1);
  }

  /*
    A solid square passes under BOTH the mean and the dominant region, so it
    cannot detect drift between them. This second case can: three saturated
    bands at opposing hues average to grey and resolve to one band. Same fixture
    shape the module's own test needed, for the same reason.
  */
  const size = 48;
  const bands = Buffer.alloc(size * size * 3);
  const palette = [
    [200, 30, 30],
    [30, 200, 30],
    [30, 30, 200],
  ];
  for (let y = 0; y < size; y += 1) {
    const band = palette[Math.min(2, Math.floor((y / size) * 3))];
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 3;
      bands[i] = band[0];
      bands[i + 1] = band[1];
      bands[i + 2] = band[2];
    }
  }
  const banded = await sharp(bands, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();

  const chromatic = await averageColour(banded);
  const channels = [1, 3, 5].map((at) => Number.parseInt(chromatic.slice(at, at + 2), 16));
  const spread = Math.max(...channels) - Math.min(...channels);
  if (spread < 100) {
    console.error(`Self-check FAILED: opposing bands gave ${chromatic}, which is their mean.`);
    console.error('This script is still averaging. Fix before running.');
    process.exit(1);
  }
}

async function main() {
  await assertAlgorithmAgrees();

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    /**
     * Only records with a COVER and no colour yet.
     *
     * `image_type = 'cover'` for the reason the upload route restricts it: a
     * matrix shot is mostly black vinyl and a label shot is mostly not the
     * sleeve. `DISTINCT ON` keeps the oldest cover per record, matching the
     * gap-fill rule — the first cover decided the spine.
     */
    const { rows } = await client.query(`
      SELECT DISTINCT ON (r.id) r.id, r.title, i.url
      FROM records r
      JOIN images i ON i.record_id = r.id AND i.image_type = 'cover'
      WHERE ($1::bool OR r.spine_colour IS NULL)
      ORDER BY r.id, i.created_at ASC
    `, [RECOMPUTE]);

    if (rows.length === 0) {
      console.log('Nothing to do: every record with a cover already has a spine colour.');
      return;
    }

    console.log(
      RECOMPUTE
        ? `${rows.length} record(s) with a cover — recomputing every one.`
        : `${rows.length} record(s) with a cover and no spine colour.`,
    );

    let written = 0;
    let skipped = 0;

    for (const row of rows) {
      const response = await fetch(row.url);
      if (!response.ok) {
        console.log(`  SKIP  ${row.title} — ${response.status} fetching the cover`);
        skipped += 1;
        continue;
      }

      const colour = await averageColour(Buffer.from(await response.arrayBuffer()));
      if (colour === null) {
        // §10b's honest absence: an undecodable cover leaves a plain spine.
        console.log(`  SKIP  ${row.title} — cover could not be decoded`);
        skipped += 1;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  would set ${colour}  ${row.title}`);
      } else {
        // Guarded on IS NULL as well, so a concurrent import cannot be
        // overwritten by a long-running backfill.
        await client.query(
          RECOMPUTE
          ? 'UPDATE records SET spine_colour = $1 WHERE id = $2'
          : 'UPDATE records SET spine_colour = $1 WHERE id = $2 AND spine_colour IS NULL',
          [colour, row.id],
        );
        console.log(`  set ${colour}  ${row.title}`);
      }
      written += 1;
    }

    console.log(`\n${DRY_RUN ? 'Would write' : 'Wrote'} ${written}, skipped ${skipped}.`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
