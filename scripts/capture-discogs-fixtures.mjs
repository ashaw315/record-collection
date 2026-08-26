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
 *
 * ---
 *
 * EVERY CAPTURE IS VERIFIED AFTER WRITING, and the script exits non-zero if any
 * check fails. The first run of this script produced FIVE wrong fixtures out of
 * seven — guessed release ids that turned out to be Fleetwood Mac, Rick Astley
 * and assorted house records — and every file looked plausible because the
 * filename asserted what the contents did not contain. A capture that silently
 * produces the wrong data is the same absence-as-success shape as the rest of
 * this step: it costs a round at best, and a decorative test at worst.
 *
 * A fixture is captured FOR A PROPERTY. If it does not have that property it is
 * not merely imperfect, it is useless for its purpose — so the property is
 * asserted here, next to the capture, rather than discovered later in a test
 * that then quietly passes for the wrong reason.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
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

/** Discogs allows 60/min; one second between calls is polite and well inside. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
  const response = await fetch(`https://api.discogs.com${path}`, {
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

/** Strips the token from anything written to disk. Belt and braces. */
function scrub(value) {
  return JSON.parse(JSON.stringify(value).split(TOKEN).join('REDACTED-TOKEN'));
}

const matrixIdentifiers = (payload) =>
  (payload.identifiers ?? []).filter((i) => /matrix|runout/i.test(i.type ?? ''));

/**
 * The columns a `/lookup` search result DISPLAYS. A collision is defined
 * against these and not against "the payloads differ somewhere" — two releases
 * always differ somewhere (ids, thumbnails, community counts), and none of that
 * reaches the user's eye or discriminates a pressing.
 */
const DISPLAYED_COLUMNS = ['country', 'released', 'catno', 'format', 'label'];

/** The release payload reduced to what a search row would show. */
function displayedColumns(payload) {
  const format = payload.formats?.[0];

  return {
    country: payload.country ?? null,
    released: String(payload.year ?? payload.released ?? ''),
    catno: payload.labels?.[0]?.catno ?? null,
    label: payload.labels?.[0]?.name ?? null,
    format: [format?.name, ...(format?.descriptions ?? [])].filter(Boolean).join(', '),
  };
}

/**
 * A collision member must be the release we asked for AND carry the evidence
 * the feature displays. Checked per-release; whether the pair actually
 * COLLIDES needs both, so it is checked after the loop.
 */
function verifyCollisionMember(payload, expectedId) {
  if (payload.id !== expectedId) {
    return `expected release ${expectedId}, got ${payload.id}`;
  }
  if (!/discharge/i.test(payload.artists_sort ?? '')) {
    return `expected a Discharge release, got artist "${payload.artists_sort}"`;
  }
  if (matrixIdentifiers(payload).length === 0) {
    return 'needs a Matrix / Runout — this fixture exists to be READ against the deadwax';
  }
  return null;
}

/**
 * Each capture states the property it exists for, as an assertion.
 *
 * The ids below are NOT guesses. They were read out of the two search fixtures
 * from the first run, which were the only ones that came back correct —
 * master 50683 and release 381756 (UK, 1982, Clay, CLAY LP 3) both appear
 * there. Guessing ids is what produced the five wrong files.
 */
const captures = [
  {
    name: 'marketplace-stats-381756',
    /**
     * §10a layer 1. `curr_abbr=USD` is REQUESTED, not incidental — measured
     * 2026-08-12: this endpoint honours the parameter (EUR 41.14 / USD 47.28 /
     * GBP 34.99 for one release) while `price_suggestions` IGNORES it and
     * returns USD regardless. USD is the only value that makes the two layers
     * agree, and converting between them would invent a number nobody quoted.
     */
    path: '/marketplace/stats/381756?curr_abbr=USD',
    verify(payload) {
      if (typeof payload.num_for_sale !== 'number') {
        return 'needs num_for_sale — layer 1 is scarcity AND floor';
      }
      if (payload.lowest_price === null || payload.lowest_price === undefined) {
        return 'needs a lowest_price; a release with none cannot exercise the floor';
      }
      if (payload.lowest_price.currency !== 'USD') {
        return `curr_abbr was ignored: got ${payload.lowest_price.currency}, wanted USD`;
      }
      return null;
    },
  },
  {
    name: 'price-suggestions-381756',
    /**
     * §10a layer 2, the condition ladder.
     *
     * Requires completed Discogs SELLER SETTINGS on the token's account —
     * without them this is `404 You must fill out your seller settings first`,
     * measured rather than assumed. If it 404s the app shows layer 1 alone and
     * says the range is unavailable; it never interpolates one.
     */
    path: '/marketplace/price_suggestions/381756',
    verify(payload) {
      const grades = Object.keys(payload ?? {});

      // The whole point of layer 2 is a RANGE across conditions. A payload with
      // one grade would let an implementation that reads a single figure pass,
      // which is the flattening §10a forbids.
      if (grades.length < 2) {
        return `needs multiple condition grades, got ${grades.length}`;
      }
      if (!grades.some((g) => /Near Mint/i.test(g)) || !grades.some((g) => /^Good/i.test(g))) {
        return 'needs both a high and a low grade so the spread is real';
      }

      const values = grades.map((g) => payload[g]?.value);
      if (values.some((v) => typeof v !== 'number')) {
        return 'every grade needs a numeric value';
      }
      if (new Set(values).size === 1) {
        return 'all grades priced identically — the ladder cannot be discriminated';
      }
      if (grades.some((g) => payload[g]?.currency !== 'USD')) {
        return 'expected USD throughout; mixed currencies would need per-figure labels';
      }
      return null;
    },
  },
  {
    name: 'release-discharge-hear-nothing',
    path: '/releases/381756',
    /**
     * THE genre/style discriminator, and the reason this release rather than
     * any release whose fields happen to differ. CLAUDE.md §8 forbids
     * flattening genres, and this collection is punk-centred: Discogs
     * catalogues this as a broad `genre` with the specific scene in `styles`,
     * so an implementation that reads `genres` and drops `styles` renders a
     * UK82 hardcore record as its parent genre. A fixture where the two agree
     * cannot catch that.
     */
    verify(payload) {
      const genres = payload.genres ?? [];
      const styles = payload.styles ?? [];

      if (genres.length === 0 || styles.length === 0) {
        return 'needs both genres and styles present';
      }
      if (JSON.stringify(genres) === JSON.stringify(styles)) {
        return 'genres and styles agree, so flattening cannot be detected';
      }
      if (!/discharge/i.test(payload.artists_sort ?? '')) {
        return `expected a Discharge release, got artist "${payload.artists_sort}"`;
      }
      return null;
    },
  },
  {
    name: 'master-discharge-hear-nothing',
    path: '/masters/50683',
    /**
     * `/masters` does NOT carry `artists_sort` — that is a `/releases` field.
     * The first version of this predicate assumed the two responses shared a
     * shape and failed with `got "undefined"`, which is the assumption this
     * whole fixture approach exists to avoid, made in the verifier instead of
     * in the test.
     *
     * So the artist is looked for wherever Discogs might plausibly put it, and
     * the failure message reports what was actually present rather than the
     * absence of one guessed field. The id itself is known good: the versions
     * capture for master 50683 succeeded, and release 381756 in that payload
     * carries `master_id: 50683`.
     */
    verify(payload) {
      const candidates = [
        payload.artists_sort,
        ...(payload.artists ?? []).map((artist) => artist.name),
      ].filter((value) => typeof value === 'string' && value !== '');

      if (candidates.some((value) => /discharge/i.test(value))) return null;

      return candidates.length === 0
        ? `no artist field found; top-level keys were [${Object.keys(payload).join(', ')}]`
        : `expected a Discharge master, found artists [${candidates.join(', ')}]`;
    },
  },
  {
    name: 'master-versions-discharge',
    path: '/masters/50683/versions?per_page=25&page=1',
    /**
     * The drill-down (§5.7) only means anything if the versions genuinely
     * differ — that is the whole point of the comparison table. Distinct
     * countries AND distinct years, or the fixture cannot discriminate a
     * normalizer that returns the same row repeatedly.
     */
    verify(payload) {
      const versions = payload.versions ?? [];
      if (versions.length < 2) return `needs 2+ versions, got ${versions.length}`;

      const countries = new Set(versions.map((v) => v.country).filter(Boolean));
      const years = new Set(versions.map((v) => v.released).filter(Boolean));

      if (countries.size < 2) return `versions must differ by country, got ${[...countries]}`;
      if (years.size < 2) return `versions must differ by year, got ${years.size} distinct`;
      return null;
    },
  },
  {
    name: 'search-by-catno',
    path: '/database/search?artist=Discharge&catno=CLAY+LP+3&type=release',
    verify: (payload) =>
      (payload.results ?? []).length > 0 ? null : 'a catalog-number search must return results',
  },
  {
    name: 'search-by-artist-only',
    path: '/database/search?artist=Discharge&type=release',
    /**
     * The cardinality that justifies §5.7's structured params: a bare artist
     * query returns far more than a person can scan. If this ever comes back
     * small the argument for the structured form has changed.
     */
    verify: (payload) =>
      (payload.pagination?.items ?? 0) > 100
        ? null
        : `expected a large result count, got ${payload.pagination?.items}`,
  },
  {
    name: 'release-detailed',
    path: '/releases/381756',
    // Rich pressing detail: a Matrix / Runout identifier is what unit 6 reads.
    verify: (payload) =>
      matrixIdentifiers(payload).length > 0
        ? null
        : 'needs at least one Matrix / Runout identifier',
  },
  /**
   * THE COLLISION PAIR (SPEC §12 step 14c). Two releases that a search result
   * CANNOT tell apart, so verification-by-display has something real to
   * distinguish.
   *
   * **Where these ids came from, since the README forbids guessing them.** They
   * were read out of `master-versions-discharge.json` — Discogs' own answer for
   * master 50683 — not invented. Both are UK / 1984 / `CLAY LP 3` / Vinyl /
   * `LP, Album, Repress` / Clay Records, byte-identical on every column the
   * versions endpoint returns and every column the search results DISPLAY. A
   * third row, 12681954, differs only by a `Mispress` descriptor and is
   * deliberately NOT used: it is separable at the list level, so it would let a
   * broken implementation look like it worked.
   *
   * **Why Discharge rather than the Rumours group**, which collides equally
   * well: the measurement behind step 14c found search-level qualifier coverage
   * of **0% on Discharge and 2% on Misfits** against 24% overall. This is the
   * case where the list-level fix has nothing left to give, and it is the genre
   * this collection is actually made of (CLAUDE.md §8 — the scenes are not
   * interchangeable). A fixture from a genre where the qualifier usually works
   * would demonstrate the feature on the easy case.
   *
   * The pair is captured as TWO fixtures because a collision fixture with one
   * member cannot demonstrate a collision — there is nothing to be identical
   * to. The verifier below enforces exactly that, and the cross-check after the
   * loop enforces that they really do collide and really do separate.
   */
  {
    name: 'release-collision-clay-lp-3-a',
    path: '/releases/4878030',
    verify: (payload) => verifyCollisionMember(payload, 4878030),
  },
  {
    name: 'release-collision-clay-lp-3-b',
    path: '/releases/10405725',
    verify: (payload) => verifyCollisionMember(payload, 10405725),
  },
  {
    name: 'release-no-matrix',
    /**
     * §5.7: matrix data is "frequently missing or partial", and the normalizer
     * must return null rather than inventing one.
     *
     * NO ID YET — deliberately left unset. The first attempt guessed release
     * 1000 on the reasoning that a low id means a sparse old entry; that is
     * backwards, since low ids are the most-edited entries on the site, and it
     * came back with two Matrix / Runout identifiers. Rather than guess again,
     * this is resolved by SEARCHING for a candidate and checking it, below.
     */
    path: null,
    verify: (payload) =>
      matrixIdentifiers(payload).length === 0
        ? null
        : `release ${payload.id} has ${matrixIdentifiers(payload).length} Matrix / Runout identifiers`,
  },
];

/**
 * Finds a release Discogs genuinely has no runout data for, by checking
 * candidates until one qualifies — rather than guessing an id and hoping.
 *
 * Recent, small-label or digital-adjacent releases are the likely candidates:
 * dead-wax data is contributed by collectors handling the physical record, so
 * it is thinnest where few people own it.
 */
async function findReleaseWithoutMatrix(searchPayload) {
  const candidates = (searchPayload.results ?? [])
    .filter((r) => r.id)
    .slice(0, 12)
    .map((r) => r.id);

  for (const id of candidates) {
    process.stdout.write(`  checking release ${id} for absent matrix… `);
    try {
      const payload = await get(`/releases/${id}`);
      const count = matrixIdentifiers(payload).length;
      console.log(count === 0 ? 'NONE — using this one' : `has ${count}, skipping`);
      if (count === 0) return payload;
    } catch (error) {
      console.log(`failed (${error.message.slice(0, 60)})`);
    }
  }
  return null;
}

const failures = [];

/**
 * Optional fixture names, so a single failed capture can be retried without
 * re-fetching the ones already verified:
 *
 *   node scripts/capture-discogs-fixtures.mjs master-discharge-hear-nothing
 *
 * With no arguments every fixture is captured.
 */
const only = new Set(process.argv.slice(2));
const wanted = (name) => only.size === 0 || only.has(name);

function save(name, payload) {
  writeFileSync(`${OUT}/${name}.json`, `${JSON.stringify(scrub(payload), null, 2)}\n`);
}

for (const capture of captures) {
  if (capture.path === null || !wanted(capture.name)) continue;

  console.log(`fetching ${capture.path}`);
  try {
    const payload = await get(capture.path);
    const problem = capture.verify(payload);

    if (problem === null) {
      save(capture.name, payload);
      console.log(`  ✓ ${capture.name}`);
    } else {
      // NOT written. A fixture without its property is worse than no fixture:
      // it looks authoritative and the test built on it passes for the wrong
      // reason.
      failures.push(`${capture.name}: ${problem}`);
      console.log(`  ✗ ${capture.name} — ${problem} (not written)`);
    }
  } catch (error) {
    failures.push(`${capture.name}: ${error.message}`);
    console.log(`  ✗ ${capture.name} — ${error.message}`);
  }
}

/**
 * THE CROSS-CHECK the pair exists for, and it cannot be done per-release.
 *
 * Each member verified alone only proves it is the right release. What makes
 * them a COLLISION FIXTURE is a relationship between them, so it is asserted
 * between them:
 *
 *   1. they are IDENTICAL on every displayed column — otherwise the list-level
 *      display already separates them and the feature is being demonstrated on
 *      a case that did not need it;
 *   2. they are DIFFERENT on identifiers-plus-companies — otherwise the feature
 *      cannot separate them either, and a test built on this pair would assert
 *      that two things look the same, which any broken implementation passes.
 *
 * Both directions matter. (1) alone admits a fixture the feature cannot help
 * with; (2) alone admits a fixture that never needed it.
 */
function verifyCollisionPair() {
  const read = (name) => {
    try {
      return JSON.parse(readFileSync(`${OUT}/${name}.json`, 'utf8'));
    } catch {
      return null;
    }
  };

  const a = read('release-collision-clay-lp-3-a');
  const b = read('release-collision-clay-lp-3-b');

  if (a === null || b === null) {
    return 'both members must be captured — a collision fixture with one member cannot collide';
  }

  const [colsA, colsB] = [displayedColumns(a), displayedColumns(b)];
  const differing = DISPLAYED_COLUMNS.filter(
    (column) => String(colsA[column]) !== String(colsB[column]),
  );

  if (differing.length > 0) {
    return `not a collision: releases differ on displayed column(s) [${differing.join(', ')}] — ${differing
      .map((c) => `${c}: ${JSON.stringify(colsA[c])} vs ${JSON.stringify(colsB[c])}`)
      .join('; ')}`;
  }

  // What the panel actually puts side by side.
  const evidence = (payload) =>
    JSON.stringify({
      identifiers: (payload.identifiers ?? []).map((i) => [i.type, i.value, i.description]),
      companies: (payload.companies ?? []).map((c) => [c.entity_type_name, c.name]),
    });

  if (evidence(a) === evidence(b)) {
    return 'identifiers AND companies are identical, so the feature cannot separate this pair either';
  }

  return null;
}

// The no-matrix fixture is SEARCHED for rather than guessed.
const noMatrix = captures.find((c) => c.name === 'release-no-matrix');
if (wanted(noMatrix.name)) {
console.log('\nlooking for a release with no Matrix / Runout data');
try {
  const pool = await get('/database/search?type=release&format=Vinyl&year=2023&per_page=25');
  const found = await findReleaseWithoutMatrix(pool);

  if (found === null) {
    failures.push('release-no-matrix: no candidate lacked matrix data — widen the search');
  } else {
    const problem = noMatrix.verify(found);
    if (problem === null) {
      save(noMatrix.name, found);
      console.log(`  ✓ release-no-matrix (release ${found.id})`);
    } else {
      failures.push(`release-no-matrix: ${problem}`);
    }
  }
} catch (error) {
  failures.push(`release-no-matrix: ${error.message}`);
}
}

/**
 * Run whenever both members were in scope — including a full run. Skipped when
 * only one was requested by name, since the other's file on disk may predate
 * whatever is being retried.
 */
if (wanted('release-collision-clay-lp-3-a') && wanted('release-collision-clay-lp-3-b')) {
  console.log('\ncross-checking the collision pair');
  const problem = verifyCollisionPair();
  if (problem === null) {
    console.log('  ✓ identical on displayed columns, separable on identifiers/companies');
  } else {
    failures.push(`collision-pair: ${problem}`);
    console.log(`  ✗ collision-pair — ${problem}`);
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} capture(s) FAILED verification:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('\nNothing was written for those. Fix the ids and re-run.');
  process.exit(1);
}

console.log('\nAll captures verified. Review the files before committing — they are real data.');
