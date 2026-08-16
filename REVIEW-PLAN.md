# Review plan

Four reviews have run: steps 1–3, the records query layer, step 7 security, and steps 8–12. Between them they found a forgeable ownership badge, a rate limiter that didn't limit, a merge feature broken on two of three tables, a graph filter returning blank for any parent genre, and a cache lying about its contents for a week at a time.

They keep earning their place. This is the plan for the rest.

---

## Principles that have held so far

**Run a review where a defect would multiply, or after novel work.** The API template before it was copied to six resources. Records before the UI sat on it. Not after every unit — the yield curve falls off sharply and the cost is real.

**A fresh session, never the implementing one.** An agent reviewing its own work defends its choices. A cold reader with no memory of the reasoning is a genuinely different instrument.

**Verify before fixing.** Twice a review's central claim was wrong, and twice the implementing session's independent check changed what got fixed. Findings arrive as hypotheses.

**"Read the actual files."** Several of the worst defects in this project were comments asserting things the code did not do. A review that reads prose inherits the error.

---

## Remaining reviews

### R5 — Suggestions and the LLM boundary
**After step 14, before step 15.**

The first time this app sends collection data to an external service and renders what comes back. Everything before was fetching; this is disclosing and then trusting.

Attack:
- What exactly leaves the machine. Field by field, not "a summary". Does it carry purchase prices, store names, journal entries, anything Adam wouldn't paste into a public forum?
- The JSON-parse boundary. §9.2 requires JSON-only output and a graceful parse failure. What happens on markdown fences, a truncated response, valid JSON of the wrong shape, an empty array, a suggestion naming an artist that already exists?
- Rate limiting and cost. 10/hour is specified — is it enforced server-side or trusted from the client? What does exhaustion look like?
- Whether the graph-derived candidates and the LLM's judgement can disagree in a way that misleads. The graph knows Adam's shelf; the LLM knows music. A suggestion presented as one voice when two disagree is the confidently-misleading shape.
- Whether an LLM suggestion can reach the want list without a human step.

### R6 — Deploy readiness
**Before step 16, and again after the first deploy.**

Everything so far has run on one laptop against a database nobody else can reach.

Attack:
- Every secret's path from `.env.local` to Vercel. Which are required at boot, which fail at point of use, and does each fail legibly? Three now fail only when used — Blob, MusicBrainz contact, Anthropic.
- The Neon WebSocket driver under real serverless conditions: cold starts, connection limits, function suspension mid-transaction. Local `pg` has never exercised any of it.
- The cron: authentication, idempotence, what happens on partial completion, and whether a failed run is visible to anyone.
- Whether anything in the repo assumes a filesystem, a long-lived process, or localhost.
- The deferred NOTES items that were explicitly parked for this step, item by item.

### R7 — The whole codebase, cold
**After step 16 ships and the app has been used for a few weeks.**

This is the fluff audit. Not defect-hunting — that's what R1–R6 were for — but asking whether the thing is the size it needs to be.

Attack:
- **Read every file and rank it.** Load-bearing, useful, or ceremony. Name the ceremony specifically.
- **The test suite as an artifact.** It will be ~2,500 tests for an app one person uses. Which prove something that could plausibly break? Which restate a constant? What is the runtime buying?
- **Abstractions with one caller.** Where would a reader be better off with the inline version?
- **Screens nobody visits.** Real usage data exists by now. Which parts of this were built because the spec said so rather than because they answer a question?
- **The spec against the app.** SPEC.md has been amended dozens of times. Which sections describe something that no longer exists, or that exists differently?

Ask directly: *if this had to be rebuilt in a week, what would you leave out?*

### R8 — Domain correctness
**Once the collection is large enough to be real — say a hundred records.**

Every review so far has checked the code against the spec. This one checks the app against the world.

Attack, using Adam's actual collection:
- Does the ownership badge get pressings right on records where it matters — the ones with lookalike reissues, shared catalogue numbers, known bootlegs?
- Is `WIDE_RATIO` right? It has failed to validate twice against a case where the answer was known.
- Does the shelf order produce something Adam would actually file that way?
- Do the suggestions suggest things worth owning?
- Does the graph tell him anything he didn't know?

This one cannot be run by an agent alone. It needs Adam's judgement about his own records, and the agent's job is to make each question testable.

---

## Standing checks, not reviews

Cheap enough to run at any boundary:

- **Dead code sweep.** Modules whose only consumers are their tests; endpoints no UI hits; config no code reads. This project has shipped three.
- **Comment audit.** For each comment asserting a behaviour, does a test constrain it? Three defects here were correct prose beside wrong code, and the prose is what stopped anyone looking.
- **`--retries=0` run.** The config cannot distinguish "passes" from "passes on the second try".
- **Spec drift.** Does SPEC.md still describe the app?

---

## Triage: what gets fixed, and when

A review returns findings, not instructions. Every finding lands in one of four buckets, and the bucket is decided before any code is written.

**Fix now, before anything else.** Silent data corruption, or anything that makes the app confidently wrong. The tests are: does it write or destroy data without an error, and would the user believe a false thing? The forgeable ownership badge, the merge broken on two of three tables, and the cache claiming a ladder it never fetched were all this.

**Fix in this remediation.** A real defect the user would notice and be annoyed by, but which announces itself. Illegible errors, wrong values in fields, a control that does nothing. Ordered by blast radius, not by severity.

**Defer with a named trigger.** Real, not urgent, and cheaper later or dependent on something not yet built. A deferral without a trigger is a decision to never do it — write the condition down. *"Revisit if the flake rate climbs"*, *"do this with step 16's cron"*, *"decide once the collection has a hundred records."*

**Decline, with the reasoning.** Some findings are correct and not worth acting on. Churn has a cost, and a refactor of working code mid-remediation is how a regression hides. Record why, so it isn't re-proposed as an obvious gap.

Two rules that override the buckets:

**Verify before fixing, always.** Twice a review's central claim was wrong. A finding is a hypothesis until the implementing session reproduces it, and the reproduction sometimes changes the fix — the merge test claim was narrower than reported, and the fix that followed was different from the one the review implied.

**Never fix a working screen mid-remediation.** `LookupClient` at 561 lines is a real finding. It gets its own quiet moment with nothing else in flight.

---

## Keeping this document honest

Add a dated entry below after each review: what it found, what was fixed, what was deferred and on what trigger, and — most usefully — **what the review missed that the remediation found.**

That last one is the measure of whether the review prompts are working. Steps 8–12 found five confirmed defects; remediating them surfaced four more the review hadn't seen: a cache's floor direction, an E2E spec encoding a bug as its contract, a fixture blind by construction rather than by assertion, and a docblock contradicted by the payload it described. A review that produces findings during its own remediation is doing better than one that doesn't.

### Log

**R1 — steps 1–3.** 2 critical, 3 high, 3 medium. Fixed: the `?host=` guard bypass, migration journal untracked, Edge env validation, JWT claims. The critical pair were both invisible to the suite.

**R2 — records query layer.** 6 defects, all real, 2 broader than stated. PATCH atomicity was the severe one — a 500 with committed scalars and replaced genres.

**R3 — step 7 security.** 10 issues. Tier-1 forgery via an unvalidated integer; the rate limiter bypassed entirely under concurrency (200 in flight against a 60/min bucket). Both reachable in normal use.

**R4 — steps 8–12.** 5 confirmed defects, plus dead code, duplication, and a test-suite audit. Remediation found 4 more. Deferred with triggers: the test-quality pass (now), mobile contention (investigate at `--retries=0`), `LookupClient` (when nothing else is in flight).

**R4 remediation — 2026-08-16.** Seven units, each verified before fixing.

*Found and fixed:* `mergeArtists` threw on `artist_memberships` and `artist_influences` — two of three composite-key tables, on exactly the duplicate the feature exists to resolve, with the endpoint dressing the raw Postgres error as a `409 MERGE_REFUSED` business answer. `buildGraph`'s `genreId` used flat equality where the collection list walks a subtree, so filtering by any parent genre returned an *empty* graph while `/?genreId=` returned the records; consolidated to one `genreSubtree`. The market cache wrote `layersFetched: ['floor','ladder']` unconditionally, so a rejected ladder read as present-and-empty for seven days. Six smaller items: blob orphans on record delete (silent, bulk, unrecoverable — the cascade destroys the URLs), the sparkline charting `asking` prices §7.6 excludes from value, `priceTypeMeaning` rendering `undefined`, an MBID collision escaping as a 500, `lifeSpan` declared by the picker and produced by nobody, `isBlobConfigured` guarding one of three call sites. Then four from the original review that were wrong data rather than cleanup: the journal date filing evening entries as tomorrow, `isNothingRecorded` passing unparseable values through as money, `formatMoney` rendering `$-12.50`, and an empty state promising a cron that does not exist.

*Deleted:* `GET /api/graph` and its tests, with SPEC §5.6 amended — the endpoint satisfied §5.6/§14 and was unreachable because §8.1 independently mandates the server component. Two requirements in tension; the spec line was the defect. Also the dead `?? 'used'` default, `artist-minor-threat.json`, and a docblock calling four shipped features "deliberately absent".

*Deferred, with triggers:* test-quality pass (next, at `--retries=0`); `LookupClient` + duplicated market rendering (when nothing else is in flight); mobile E2E contention (four sightings, all passing in isolation — investigate during the test pass).

*What the review missed that remediation found —* six, not four:
1. **The market cache's floor direction.** The review found the ladder half; asserting both directions found that a row claiming a floor it never fetched makes `cachedLowestPrice` return null, which `summariseSpread` filters out of the sample — layer 3's verdict corrupted through layer 1's cache.
2. **`e2e/images.spec.ts` encoded a defect as its contract.** It asserted `reason: 'failed'` while its own docblock named the missing `BLOB_READ_WRITE_TOKEN` as the cause. The right name did not exist yet, so the test could not have said anything else.
3. **A test blind by construction, not by assertion.** The review called `toHaveValue(/.+/)` vacuous; it is not — it correctly rejects the unchanged empty value. What it could not see is *which* parent. With one candidate parent on screen the right and wrong outcomes are the same observation, so no matcher separates them. The fix was a decoy in the fixture, not a stricter assertion.
4. **A docblock contradicted by the payload it described.** `identical-versions.test.ts` claimed five identical Hot Tuna versions "measured against the live API"; the committed capture has three. Nothing could contradict it because the fixture was orphaned. Pointing the test at it also produced a better test — the real data carries a `Repress` near-miss nobody would have constructed.
5. **The journal date is wrong in *both* directions.** The review found evening entries filing as tomorrow west of Greenwich. Fixing it — send the local date, since a journal date is a human fact — immediately breaks the server bound east of Greenwich, where the local date is a day *ahead* of UTC and the API rejects the user's genuine today. The resolution is slack, not conversion: the server cannot know the client's zone and must not guess, but it can say no zone is more than a day from UTC.
6. **The obvious rewrite of the empty state was the same defect again.** "Use the market panel above" is false whenever the record has no Discogs release id, because `MarketPanel` renders `null` without one.

*The pattern this remediation named,* now a standing check: **when prose and code sit together and disagree, the prose is what stops anyone looking.** Three instances, each a correct sentence beside a wrong thing — a comment explaining a hazard class above coverage of one case; a comment stating §7.1 correctly above code that ignored it; a docblock naming a cause above an assertion naming a different one. The third is the sharpest, because the accurate comment knew more than the type system let the assertion express. A fourth was *avoided*: keeping `/api/graph` would have required a careful paragraph explaining why dead code should stay.

---

## What a review cannot do

A reviewer reads code against a spec. It cannot tell you the spec is wrong about what you want from a record collection app.

Four defects in this project were found by Adam using the thing — unreachable pressing entry, the fabricated 230g weight, a tier-1 badge that could never fire, illegible error reporting. None were spec violations, so no reviewer would have flagged them.

**Manual QA after every step remains the highest-yield check available, and it is the one that keeps getting skipped.**