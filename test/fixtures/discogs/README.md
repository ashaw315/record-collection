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

## What each file is for

| File | Why it exists |
|---|---|
| `release-discharge-hear-nothing.json` | The genre/style discriminator: `genres` and `styles` DISAGREE, so an implementation that reads `genres` and drops `styles` is caught (CLAUDE.md §8) |
| `master-discharge-hear-nothing.json` | A master, for the drill-down |
| `master-versions-discharge.json` | Versions under that master — several pressings differing by country, year and catalog number |
| `search-by-catno.json` | The structured search that actually pins down a pressing |
| `search-by-artist-only.json` | The bare-artist search, for the cardinality that makes `q` alone near-useless |
| `release-detailed.json` | Rich pressing detail: Matrix / Runout identifiers, a pressing plant, weight and colour in format descriptors |
| `release-no-matrix.json` | A release with NO matrix — §5.7 calls this "frequently missing", and it is the common real case |

## Re-capturing

Discogs data is user-submitted and changes. If a fixture is re-captured and a
test starts failing, that is information: either the normalizer relied on
something incidental, or the release was edited. Do not adjust a test to match a
new capture without establishing which.
