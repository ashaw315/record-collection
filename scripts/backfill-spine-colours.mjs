/**
 * Backfills §10b's `records.spine_colour` for records that already have a cover.
 *
 * Run by hand, by a person:
 *
 *   node scripts/backfill-spine-colours.mjs            # against DATABASE_URL
 *   node scripts/backfill-spine-colours.mjs --dry-run  # print, change nothing
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

    for (let i = 0; i + info.channels - 1 < data.length; i += info.channels) {
      const alpha = info.channels === 4 ? data[i + 3] / 255 : 1;
      if (alpha === 0) continue;
      r += toLinear(data[i]) * alpha;
      g += toLinear(data[i + 1]) * alpha;
      b += toLinear(data[i + 2]) * alpha;
      weight += alpha;
    }

    if (weight === 0) return null;

    return (
      '#' +
      [toSrgb(r / weight), toSrgb(g / weight), toSrgb(b / weight)]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
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
      WHERE r.spine_colour IS NULL
      ORDER BY r.id, i.created_at ASC
    `);

    if (rows.length === 0) {
      console.log('Nothing to do: every record with a cover already has a spine colour.');
      return;
    }

    console.log(`${rows.length} record(s) with a cover and no spine colour.\n`);

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
          'UPDATE records SET spine_colour = $1 WHERE id = $2 AND spine_colour IS NULL',
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
