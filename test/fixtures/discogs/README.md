# Discogs fixtures

Captured from the live API by `scripts/capture-discogs-fixtures.mjs`, run **by
hand, by a person**. Never by a test, and never automatically.

CLAUDE.md §2: "Always mock Discogs and the Anthropic API. Never allow a test to
make a live external call — not even 'just once to check.'" These files are how
that rule is kept: the capture is a deliberate human act, and the suite reads
only what is committed here.

## Why captured rather than written by hand

A hand-written fixture encodes what we *expect* the API to return. That is the
assumption most likely to be wrong, and normalization tested against it verifies
our imagination rather than Discogs' behaviour.

## Every capture is verified

The script asserts, after writing, that each fixture actually has the property
it was captured for — and writes nothing when it does not. The first run
produced FIVE wrong files out of seven, from guessed release ids that turned out
to be Fleetwood Mac, Rick Astley and assorted house records. Every one looked
plausible, because the filename asserted what the contents did not contain.

A fixture without its property is worse than no fixture: it looks authoritative,
and the test built on it passes for the wrong reason.

**Do not guess release ids.** The ids in use were read out of the search
fixtures, which are the API's own answers. If a new fixture is needed, search
for it and take the id from the result.

## What each file is for

| File | Why it exists |
|---|---|
| `release-discharge-hear-nothing.json` | The genre/style discriminator: `genres` and `styles` DISAGREE, so an implementation that reads `genres` and drops `styles` is caught (CLAUDE.md §8) |
| `master-discharge-hear-nothing.json` | A master, for the drill-down |
| `master-versions-discharge.json` | Versions under that master — several pressings differing by country, year and catalog number |
| `search-by-catno.json` | The structured search that actually pins down a pressing |
| `search-by-artist-only.json` | The bare-artist search, for the cardinality that makes `q` alone near-useless |
| `release-detailed.json` | Rich pressing detail: Matrix / Runout identifiers, a pressing plant, weight and colour in format descriptors |
| `release-no-year.json` | A release Discogs records NO year for — `year: 0` and no `released` field at all. The only committed payload with that shape, and the reason it is here: the entire suite otherwise exercises releases that carry their own year, so the master-year fallback was untestable and a defect in it invisible. Captured from the real US Carpenters LP (`SP-3502`, master 84975) |
| `release-no-matrix.json` | A release with NO matrix — §5.7 calls this "frequently missing", and it is the common real case. The script SEARCHES for a qualifying release rather than naming one: a low release id is not a sparse entry, it is a heavily-edited one, which is how the first attempt came back with two Matrix / Runout identifiers |
| `master-versions-hot-tuna.json` | **The evidence that indistinguishable versions are real**, not an invented hazard. Three US/1970/`LSP-4353` versions on RCA Victor agree on every column the versions endpoint returns, so the table cannot separate them — and a fourth differs *only* by `Repress`, which is the near-miss that makes the comparison key's descriptor handling testable. `identical-versions.test.ts` loads it through `normalizeVersion`. It was orphaned for a while, and that had a cost: the test's docblock claimed five identical versions "measured against the live API" while the committed capture showed three, and nothing could contradict it |

## Re-capturing

Discogs data is user-submitted and changes. If a fixture is re-captured and a
test starts failing, that is information: either the normalizer relied on
something incidental, or the release was edited. Do not adjust a test to match a
new capture without establishing which.
