/**
 * Captures real Discogs payloads into test/fixtures/discogs/.
 *
 * RUN BY HAND, by a person, never by a test or by an agent. CLAUDE.md §2:
 * "Never allow a test to make a live external call — not even 'just once to
 * check.'" This script is the sanctioned exception because a human runs it
 * deliberately, and its OUTPUT is what the suite uses.
 *
 *   node scripts/capture-discogs-fixtures.mjs
 *
 * Reads DISCOGS_TOKEN from .env.local. The token is used only in the
 * Authorization header and is stripped from everything written to disk.
 *
 * Fixtures are captured rather than hand-written because a hand-written fixture
 * encodes what we EXPECT the API to return, which is the assumption most likely
 * to be wrong — and normalization tests built on it would verify our
 * imagination.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const TOKEN = process.env.DISCOGS_TOKEN;
if (!TOKEN) {
  console.error('DISCOGS_TOKEN is not set in .env.local');
  process.exit(1);
}

const USER_AGENT = 'RecordCollectionFixtureCapture/0.1 +https://github.com/local';
const OUT = 'test/fixtures/discogs';
mkdirSync(OUT, { recursive: true });

/**
 * Discogs' rate limit is 60/min; this makes ~7 calls. One second between them
 * is well inside it and keeps the script polite.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const url = `https://api.discogs.com${path}`;
  const response = await fetch(url, {
    headers: {
      authorization: `Discogs token=${TOKEN}`,
      'user-agent': USER_AGENT,
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`${path} -> ${response.status} ${await response.text()}`);
  }
  await sleep(1000);
  return response.json();
}

/**
 * Removes anything user-specific or credential-shaped before the payload is
 * committed. Discogs echoes a `resource_url` containing no secret, but search
 * responses can carry pagination URLs with the token embedded when it was sent
 * as a query param — we never do that, and this is belt and braces.
 */
function scrub(value) {
  const text = JSON.stringify(value).split(TOKEN).join('REDACTED-TOKEN');
  return JSON.parse(text);
}

function save(name, payload) {
  const file = `${OUT}/${name}.json`;
  writeFileSync(file, `${JSON.stringify(scrub(payload), null, 2)}\n`);
  console.log(`wrote ${file}`);
}

const captures = [
  /**
   * The genre/style discriminator, and the reason this specific release is
   * here: CLAUDE.md §8 forbids flattening genres. Discharge's "Hear Nothing
   * See Nothing Say Nothing" is catalogued on Discogs with genres ["Rock"] and
   * styles ["Hardcore", "Punk"] — so an implementation that reads `genres` and
   * ignores `styles` produces "Rock" for a UK82 hardcore record. A fixture
   * where the two agree cannot catch that.
   */
  ['release-discharge-hear-nothing', '/releases/1793553'],

  // A master with many versions — the drill-down case (§5.7), where several
  // pressings differ by country, year and catalog number.
  ['master-discharge-hear-nothing', '/masters/38722'],
  ['master-versions-discharge', '/masters/38722/versions?per_page=25&page=1'],

  // Structured search by catalog number: the query that actually pins down a
  // pressing, versus the bare artist search that returns thousands.
  ['search-by-catno', '/database/search?artist=Discharge&catno=CLAY+LP+3&type=release'],

  // The bare-artist case, for the cardinality the split was scoped around.
  ['search-by-artist-only', '/database/search?artist=Discharge&type=release'],

  // A release with rich pressing detail: identifiers incl. Matrix / Runout,
  // companies incl. a pressing plant, and format descriptors carrying weight
  // and colour.
  ['release-detailed', '/releases/249504'],

  /**
   * A release with NO matrix/runout in its identifiers. §5.7 calls this
   * "frequently missing or partial", and it is the common real case — the
   * normalizer must return null rather than crashing or inventing one.
   * If this capture turns out to HAVE a matrix, pick another id and say so.
   */
  ['release-no-matrix', '/releases/1000'],
];

for (const [name, path] of captures) {
  try {
    console.log(`fetching ${path}`);
    save(name, await get(path));
  } catch (error) {
    console.error(`FAILED ${name}: ${error.message}`);
  }
}

console.log('\nDone. Review the files before committing — they are real data.');
