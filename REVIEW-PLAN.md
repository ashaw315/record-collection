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
**After step 14's §9.2 unit, BEFORE 13c (the snippet).**

**Timing changed deliberately.** This used to read "after step 14, before step
15". A29f split §9.2 and the snippet into two units, and the snippet is built ON
the boundary §9.2 extracts — the client, the shared rate limit, the JSON-parse
boundary. A correction found after 13c has to be applied in two places; found
now, in one. Run this review where a defect would multiply.

State at the time of writing: §9.1, `/suggestions`, E2E #8 and §9.2 are built
and committed (`f48bc99`). 13c is not.

The first time this app sends collection data to an external service and renders what comes back. Everything before was fetching; this is disclosing and then trusting.

Attack:
- What exactly leaves the machine. Field by field, not "a summary". Does it carry purchase prices, store names, journal entries, anything Adam wouldn't paste into a public forum?
- The JSON-parse boundary. §9.2 requires JSON-only output and a graceful parse failure. What happens on markdown fences, a truncated response, valid JSON of the wrong shape, an empty array, a suggestion naming an artist that already exists?
- Rate limiting and cost. 10/hour is specified — is it enforced server-side or trusted from the client? What does exhaustion look like?
- Whether the graph-derived candidates and the LLM's judgement can disagree in a way that misleads. The graph knows Adam's shelf; the LLM knows music. A suggestion presented as one voice when two disagree is the confidently-misleading shape.
- Whether an LLM suggestion can reach the want list without a human step.

#### The one thing no test can answer: does the prompt actually work?

**Every test of §9.2 injects a fake client.** That is correct — CLAUDE.md §2
forbids live external calls, and the guard covers `api.anthropic.com` (verified
against that host, not assumed). But it means the genre-accuracy requirement —
**the thing this feature exists for** — is verified only as PROMPT TEXT. A test
asserts the prompt contains the word "flatten"; nothing asserts a model obeys it.

CLAUDE.md §8 names this as the place the distinction matters most: "UK
first-wave punk, UK82, US hardcore, horror punk and psychobilly are different
scenes with different sounds. Do not flatten them to 'punk' anywhere — least of
all in the LLM suggestion prompt."

**The case as it stands cannot fail, and that is measured.** The dev database
holds 125 records, 191 artists, and six genres — AOR, Black Metal, Heavy Metal,
Punk, Rock, Rock & Roll — **every one of them with `parent_genre_id` NULL**.
There is no hierarchy, so:

- The prompt's "do not flatten a specific scene into a parent term" has nothing
  to flatten. "Punk" IS the punk genre.
- A29d's validation would ACCEPT a flattened answer, because `Punk` is in the
  vocabulary. The check that makes the response checkable is inert against this
  data.

So a live run today would prove nothing in either direction.

**Build the case that can fail, then run it:**

1. In the DEV database (Neon, `DATABASE_URL` in `.env.local` — not the local test
   database), create `Punk` as a parent with **UK82** and **US Hardcore** beneath
   it, via `/manage`'s hierarchy editor or directly.
2. Re-tag some existing punk records at the LEAVES rather than at `Punk`, so the
   collection genuinely reads as a UK82 collection or a US hardcore one. The
   summary sends each artist's genres, so this is what the model actually sees.
3. Run the real thing with a real `ANTHROPIC_API_KEY`, through the UI at
   `/suggestions`.

**What failure looks like:** suggestions whose `genre` is `Punk` when the
collection is tagged at the leaves, or reasons that describe a UK82 collection in
terms of "punk" generally. Either means the prompt has failed the requirement
CLAUDE.md §8 calls the most important one, and no amount of green tests would
have said so.

**What success looks like:** suggestions naming UK82 or US Hardcore specifically,
with reasons that stay inside the scene — and, ideally, at least one suggestion
whose genre is dropped by A29d's validation, which would prove that mechanism
fires on real output rather than only on fixtures.

**Record the actual responses**, not a verdict. This is the first evidence
anybody will have about whether the feature works, and a summary would discard
the material a prompt revision would need.

#### Two more things this review inherits

- **The prompt has never been run.** Nothing in the repo has made a live
  Anthropic call. Treat every claim about model behaviour as untested, including
  the ones in `client.ts`'s comments.
- **`dropped` reaching the UI is tested; the copy is not.** A29d requires the
  count to be visible. Whether "2 suggestions were discarded for naming genres
  outside your collection" reads as an app defect or a model defect to somebody
  who did not build it is a judgement, not an assertion.

### R6 — Deploy readiness
**Before step 16, and again after the first deploy.**

Everything so far has run on one laptop against a database nobody else can reach.

Attack:
- Every secret's path from `.env.local` to Vercel. Which are required at boot, which fail at point of use, and does each fail legibly? Three now fail only when used — Blob, MusicBrainz contact, Anthropic. **`isAnthropicConfigured` now rejects placeholders as well as absence** (R5's F1, after a `-put-your-key-here` value passed every check and spent a rate-limit slot); ask the same of the other two.
- **The Discogs User-Agent, which is hard-coded and points at a URL that 404s.** §6 requires a descriptive User-Agent — "Discogs rejects requests without one" — and the client sends `RecordCollection/0.1 +https://github.com/adamshaw/record-collection` from a literal in `client.ts`, not from the environment. Two things to settle, and the second is the production one. **The contact URL is wrong**: the remote is `ashaw315/record-collection` and the `adamshaw` path returns 404, so the header names nobody, which is exactly what §6's "somewhere to look" is for. And **it is a literal where every other credential is environment-derived** — `DISCOGS_USER_AGENT` does not exist in `src/lib/env/schema.ts` and nothing reads it. Locally that is survivable, because a wrong-but-present User-Agent is still accepted; in production under real use it is not the same thing. Discogs rate-limits unidentified and anonymous traffic harder, and a header that cannot be changed without a deploy is one you cannot fix when they ask you to. Decide whether it becomes an env var validated at boot alongside `DISCOGS_TOKEN`, or stays a literal with the URL corrected — but do not leave it pointing at a 404.
- **Which databases can actually be migrated, and by what command.** Three drifted during R5 alone: dev (three behind), the Neon test branch (five behind, and it has NO supported migrate command — `drizzle.config.ts` resolves `DATABASE_URL` and `TEST_DATABASE_URL` only), and the ledger-versus-schema divergence that makes `drizzle-kit migrate` print success and apply nothing, permanently. **Production is the serious version**: the throwaway branch was repaired by recreating it, which production cannot be. Establish whether production has the same drift, what command is meant to migrate it, whether that command exists, and what check would notice within one deploy.
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

**R4 test-quality pass — 2026-08-16. First overturned finding.**

The audit named `e2e/tags-auth.spec.ts` as ceremony: 18 tests × 2 projects = 36 executions for "one middleware matcher", already owned by the unit suite. Mutation testing reversed it.

Exempting a single resource — adding `/api/pressings` to `PUBLIC_PATHS`, which is what a real auth regression looks like — produced:

- `src/lib/auth/routes.test.ts`: **53/53 passed.** The unit suite does not catch a one-resource exemption, because it asserts the *rule* (`routeAuthMode` defaults to `session`) and the exemption changes the *data* the rule reads.
- `e2e/tags-auth.spec.ts`: **2 failed**, on exactly the exempted resource, over real HTTP through real middleware.

So the loop is the only thing covering per-route protection, and the case for deleting it rested on a claim that is false. It stays.

Two things worth carrying:

**This is the first time verification saved a test rather than changed a fix.** The rule "a finding is a hypothesis" had been earning its place by narrowing fixes; here it prevented the removal of the only check standing between a single-line auth mistake and a silently public endpoint.

**The file's own docblock was wrong about itself.** It says `/api/tags` "covers the class rather than only this path, because the five that follow are covered by the same middleware matcher and the same routeAuthMode default" — and then loops over six more resources anyway. The prose argued for deleting the loop sitting directly beneath it, which is the pattern this remediation kept meeting, now pointed at a test instead of at code. The loop was right and the sentence explaining it away was wrong.

*Also in this pass:* 18 per-endpoint auth stanzas removed from integration files (mutation-verified redundant — making every path public is caught 36 times by the unit suite alone). One kept in `influences.test.ts`, which covers three distinct path shapes including the two-param route.

**Scorecard: 4 findings, 2 confirmed, 2 overturned.** Worth tracking as a ratio rather than a count.

| finding | verdict | evidence |
|---|---|---|
| ~19 auth stanzas are redundant | **confirmed** | breaking auth is caught 36× by the unit suite alone |
| `every-page-has-nav` asserts file text, not behaviour | **confirmed** | passes 11/11 against `{false && <AppHeader />}`; the E2E fails |
| `tags-auth.spec.ts` is 36 wasted executions | **OVERTURNED** | exempting one resource: unit suite 53/53 green, this spec fails |
| `neon-gate.test.ts:55` asserts a comment | **OVERTURNED** | renaming the gate away is caught only here; the behavioural sibling passes |

**An audit whose findings are all correct probably was not looking hard enough.** A reviewer that only reports what it can prove will miss the defects that need a hypothesis; one that reports hypotheses will be wrong sometimes, and the wrongness is the price of the reach. What makes the ratio safe is the standing rule — *verify before fixing* — which is now the difference between a sharp audit and a destructive one. Both overturns would have deleted the only test covering a real property.

The two overturns also produced a correction to a NOTES rule that had been written too bluntly. "The tell: a test whose assertion is `toMatch` on source code" is wrong as stated; the accurate form is **a file-text assertion is right exactly when the property is about a file, and wrong when it stands in for behaviour that can be observed** — because no behavioural test can notice that another test was deleted.

*A sixth sighting of the mobile contention, and narrowing the matrix did not fix it.* Baseline taken deliberately before the change (two clean `--retries=0` runs, 326 each); afterwards a run failed 1 and cleared on re-run, at reduced parallel load. That is positive evidence rather than the absence of it. Investigation stays open.

*The pattern this remediation named,* now a standing check: **when prose and code sit together and disagree, the prose is what stops anyone looking.** Three instances, each a correct sentence beside a wrong thing — a comment explaining a hazard class above coverage of one case; a comment stating §7.1 correctly above code that ignored it; a docblock naming a cause above an assertion naming a different one. The third is the sharpest, because the accurate comment knew more than the type system let the assertion express. A fourth was *avoided*: keeping `/api/graph` would have required a careful paragraph explaining why dead code should stay.

**R5 — suggestions and the LLM boundary. 2026-08-20.** The first review with a
manual half, and the half that could not be read is the one that mattered.

*Findings, in REVIEW-PLAN's buckets.*

**Fix in this remediation** (no "fix now" — nothing here corrupts data or writes
a false thing):

1. **F1 — every Anthropic failure is a bare 500.** *Confident: reproduced twice,
   once mocked and once live.* The route names three conditions legibly
   (unconfigured 503, rate-limited 429 + retryAt, unreadable 502) and the
   likeliest one falls through `withErrorHandling` to `500 INTERNAL_ERROR /
   "Internal server error"`. Hit for real: a placeholder key ending
   `-put-your-key-here` passed `isAnthropicConfigured()` (which only tests
   non-empty), claimed a slot, and produced a 500 the user cannot act on. The UI
   then says "Try again", which is wrong advice for a 401. Two sub-parts: the
   message should name the credential, and **an auth failure should not spend a
   slot** — unlike an unreadable response, nothing was billed.

   Same shape as `isBlobConfigured` guarding one of three call sites, one
   integration over.

2. **F2 — A29d's validation cannot catch a flattening to a PARENT genre.**
   *Confident in the mechanism; the remediation should still reproduce it.*
   `parseSuggestions` accepts `genre: 'Punk'` with `dropped: 0` when Punk is in
   the vocabulary. A29d says the constraint "is the mechanism that enforces the
   genre-accuracy requirement, since a model flattening UK82 into 'punk'
   produces a name the hierarchy does not contain" — true only while the parent
   is absent from the collection. Root cause one layer up: A29d also says "the
   prompt supplies the collection's genre HIERARCHY" and it does not.
   `buildPrompt` renders a flat comma list and `collection-summary.ts` never
   reads `parent_genre_id`, so the model is told not to flatten into a parent
   term without being told which terms are parents.

3. **The owned-artist-vs-owned-record ambiguity is unenforceable by
   construction.** *Confident.* §9.2 says "do not recommend anything they
   already own" and does not define artist or record. The model read it as the
   record (#34, Dire Straits — *Brothers in Arms*, "The collector already owns
   Dire Straits"; 1 of 34). The decisive part is not the ambiguity but that
   **§9.2 sends artist names and not titles, so the record-level reading cannot
   be enforced from the payload at all.** Only the artist-level rule is
   checkable. That makes it a decision to take rather than a wording to tidy.

**Defer with a named trigger:**

4. **§9.2 has no count limit; 34 came back.** *Confident in the fact, undecided
   on whether it is wrong.* §5.8 gives §9.1 `limit` (default 10); §9.2 has only
   10/hour. Nothing caps the array and the prompt asks for no number.
   `client.ts` calls `max_tokens: 4000` "short by construction: §9.2 wants a
   handful of suggestions, not an essay" — contradicted by this run, which
   stopped on `end_turn` at 2994 output tokens. **Trigger: 13c, the snippet** —
   it shares this client and the same question ("how much output is right")
   arrives there too, so decide once for both. If a limit is wanted the honest
   place is the prompt, not a server-side slice that discards billed output.

5. **The `dropped` copy has never been seen by a human.** *Not confident this
   matters.* A29d requires the count visible; the string is
   "N suggestions were discarded for naming genres outside your collection".
   `dropped: 0` on the live run, so it did not render. Whether it reads as an
   app defect or a model defect is a judgement no test settles. **Trigger:
   the first real run that drops something.**

6. **The route's 503 notConfigured branch is never exercised.** *Confident,
   minor.* The integration test hardcodes `isAnthropicConfigured: () => true`.
   The function is tested four ways; the route's use of it is not. **Trigger:
   fold into F1's remediation** — that work touches these branches anyway.

7. **Dev migration divergence, and the unknown behind it.** *Confident in the
   mechanism, NOT in the cause.* Dev was four migrations behind with a ledger
   whose high-water row matches no journal entry. Drizzle recomputes the same
   batch every run, dies on `42701`, rolls back, **prints success and exits 0** —
   permanently, since a failed run changes neither ledger nor journal. Repaired
   by verifying the drifted migrations were complete, backfilling three ledger
   rows, then migrating. **What applied 0011–0013's schema without ledger rows is
   unknown** — `drizzle-kit push` and hand-applied DDL both fit. **Trigger: R6,
   before the first deploy**, which owns the same divergence against production
   where recovery is worse.

**Decline, with reasoning:**

8. **The two engines could be merged or cross-checked.** They are separate on
   screen by design (§10, and `page.tsx` argues it), §9.2 is labelled
   "Generated by Claude… not facts this app checked", and §9.2 is not given
   §9.1's candidates so they cannot contradict each other within one claim. The
   attack line came back clean; nothing to do.

9. **An LLM suggestion reaching the want list without a human step.** Cannot
   happen. Free-text prefill, artist must match an existing row or the form
   names it unmatched, user must press Save. No write path from the model.

*What the review confirmed clean:* what leaves the machine (read against the
four queries column by column, not the docblock — no uuids, prices, dates,
stores, notes, matrix or journal; want list correctly filtered to unacquired);
the server-side rate limit and its concurrency work; all five enumerated parse
cases with unreadable/empty/dropped kept distinct.

*What the review MISSED that the run found:* the model reasons FINER than the
hierarchy asks — DC vs Californian vs South Bay inside US Hardcore, Swedish
proto- vs Norwegian second wave inside Black Metal. Nothing in the reading
predicted the failure mode might be the opposite of flattening. Also missed: that
§9.2 sends no titles, which is what turns finding 3 from a wording question into
a design decision — visible in the code the whole time and only noticed when a
real suggestion named an owned artist.

*What ONLY the live run could have shown — the point of the manual half.*

- **§9.2 had never executed anywhere.** The run is the first evidence the model
  id, the `output_config.effort` shape, the token budget and the JSON discipline
  all work. `claude-opus-5` and `effort: 'high'` were untested constants pinned
  by a test asserting the string.
- **The prompt works, and the tests could not have said so.** 0 of 34 flattened
  to `Punk` when `Punk` was offered and would have validated. A test asserting
  the prompt contains "flatten" is compatible with a model that ignores it.
- **No markdown fences.** The parser's fence handling — with its own committed
  probe — was not needed once. Right to keep; now known to be the exceptional
  path rather than the norm.
- **F1 and F2 both CHANGED SHAPE against the real API**, which is the entry
  REVIEW-PLAN asks for. F1 was raised from a mocked 401 and looked like a
  robustness gap; live, it was **the actual reason the feature did not work**,
  triggered by a placeholder credential no shape check catches, and it cost a
  rate-limit slot for a call that was never billed. F2 was raised as "the
  backstop has a hole"; the run confirmed it **from the opposite direction** —
  the validation fired zero times, so the genre accuracy is real and comes
  ENTIRELY from prompt and model, with the backstop contributing nothing and
  still unable to catch the case it was built for. Reading found both; only the
  run established what they mean.
- **§9.1 works on real data** — Broken Bones "shares 4 members with Discharge",
  Demon 2, three Dire Straits side projects, each with its own clause and the two
  terms kept separate. First evidence of the shared-member term against a real
  collection.

*Scorecard: 9 findings, 7 confident, 2 held loosely (the `dropped` copy, and the
CAUSE of the migration divergence as distinct from its mechanism).* No finding
was overturned in this review — but nothing has been remediated yet, and the
standing rule says that is where overturns happen. **Both F1 and F2 should be
reproduced before they are fixed**, and F2's fix in particular has a wrong
version available: sending the hierarchy is not the same as removing `Punk` from
the vocabulary, and the second would break a collection that legitimately tags at
a parent.

*A caveat on the material.* The dev collection is largely synthetic — of the 21
re-tagged punk records only Discharge is a real band. That strengthens the genre
conclusion (independent of name recognition) and weakens any conclusion about
suggestion QUALITY. **R8 judges that, on Adam's real records.**

*The mobile contention reached its eighth sighting and its deferral was
RESOLVED.* R4 left this "investigation stays open" at six sightings, deferred to
step 16. R5's remediation measured the rate climbing past the trigger R4 wrote
for it: two full runs in three produced seven and five HARD failures — retries
exhausted, not flake — 100% `[mobile]`, zero on chromium, all failing at login
before any assertion, with the failure SET moving between runs.

**Decided: per-worker test-data isolation becomes step 15's FIRST unit**, moved
from step 16, and both NOTES and SPEC §12 updated so the plan and the notes
agree. The argument is indistinguishability — a real mobile regression and this
contention produce the same observation, "tests fail on mobile", and step 15 is
the one step where that is fatal because mobile is what it changes and mobile
E2E is how it is verified. No chromium cross-check is available there, since the
flaking project IS the subject.

Worth noting as a review-process point: this was not an R5 finding. It came from
running the full E2E suite four times over a remediation, which is what CLAUDE.md
§10 requires and what makes a rate visible at all. **A defect that only shows up
as a rate needs repeated runs to see, and single-run verification would have
reported every one of these as flake.**

---

---

## What a review cannot do

A reviewer reads code against a spec. It cannot tell you the spec is wrong about what you want from a record collection app.

Four defects in this project were found by Adam using the thing — unreachable pressing entry, the fabricated 230g weight, a tier-1 badge that could never fire, illegible error reporting. None were spec violations, so no reviewer would have flagged them.

**Manual QA after every step remains the highest-yield check available, and it is the one that keeps getting skipped.**
**R6 — deploy readiness. 2026-08-24.** Read-only, before step 16. Nothing fixed,
nothing deployed. 9 findings I hold confidently (all reproduced), 7 attack lines
that came back clean, 1 open question that has now expired.

*Buckets.*

**Fix now** — one, and only because it is the shape this project keeps shipping:
**a malformed `APP_PASSWORD_HASH` boots green and nobody can log in.**
`z.string().min(1)` accepts the 60→46 truncation `.env.example` itself warns
about; bcryptjs returns `false` rather than throwing; the login route is not
wrapped, so it answers 401 "Incorrect password" and logs nothing. It qualifies
because the user believes a false thing (their password is wrong) and there is
no signal anywhere that says otherwise. Contrast the all-variables-missing case,
which is loud 500s naming each one.

**Fix in this remediation** — the `cause`-chain log leak (reproduced: a bearer
token and a connection-string password both JSON-stringified into a log line);
`isTestContext()`'s `TEST_DATABASE_URL` line, which lets one stray env var refuse
every Discogs/MusicBrainz/Anthropic call in production with a message about
tests; Discogs' missing 401/403 branch, which calls a dead credential an outage
(R5's F1 shape, fixed for Anthropic and not here); the User-Agent URL, measured
404 against a 200 for the correct path; and `db:test:reset`, which exits 0 and
leaves 0 tables because the data dir is `tmpfs` and nothing re-migrates.

**Defer with a named trigger** — `maxDuration` and the two per-isolate rate
limiters. **Trigger: step 16 itself**, since both are `vercel.json`/route-config
work and neither can be validated from here. The LLM quota-slot leak on timeout
travels with them. `sslmode=require` → `verify-full`: **trigger, the next `pg`
major bump** — measured, both currently parse to full verification, so this is a
future risk on the migration path only, not a present weakness.

**Decline** — the `nanoid` high advisory (build-time only, via `postcss`, not in
the request path).

*What the review got WRONG, which is the entry worth having.* I drafted "the
fail-fast boot guarantee does not hold" from a production build that booted with
`env -i`, served `/login` 200, and returned 401 on login with no log. It holds.
`next start` loads `.env.local` from the project directory regardless of cwd, so
`env -i` never produced an empty environment; hiding the file gives the designed
behaviour exactly. Third review running where verify-before-fixing changed the
finding, and the wrong version would have sent step 16 rewriting a working boot
path.

*What the review MISSED until a subagent swept for it:* the serverless execution
model, which is the half of "deploy readiness" that reading for secrets does not
touch — per-isolate rate limiters that start full on every cold start, the
absence of any `maxDuration`, and the quota slot that a platform kill burns
without refund. The prompt named the Neon driver under serverless conditions and
I would have checked only that.

*What the prompt's premise got wrong.* "There is no supported command to migrate
the Neon branch" is false: `resolveDriver` returns `DATABASE_URL` whenever
`TEST_DATABASE_URL` is absent, so `npm run db:migrate` targets production and
was observed applying successfully over `pg`/TCP. And there is no drift left —
`drizzle-kit check` clean, `generate` reports nothing pending, and all 16
migration file hashes match ledger rows on both Neon branches. The R5 open
question "what applied 0011-0013 without ledger rows" is now **unanswerable**:
the distinguishing schema diff it proposed returns clean, and `~/.zsh_history`
stops at 2026-08-18 with no `drizzle-kit push` for this project. Recorded as
expired rather than open.

*What ONLY deploying can show,* handed forward rather than left implicit: Neon
WebSocket pool behaviour across freeze/thaw, real cold-start frequency (which
sets the true cost of the full-bucket problem), actual function durations against
the plan limit, whether Vercel's env storage expands `$` in a bcrypt hash, and
whether a linked Blob store auto-injects its token.

**R6 after-deploy pass — 2026-08-25.** The second half, run against the live
deployment. **3 findings, none blocking; 4 of R6's 5 handed-forward unknowns
answered; 1 still open.**

*Answered by deploying:* the Neon WebSocket driver works under real serverless
conditions (4 records priced in 1.4s cold, 0.83s warm, three CONCURRENT runs all
200 with no pool exhaustion); Vercel's env storage does NOT expand `$` in a
bcrypt hash (the app boots, and the schema demands 60 real bcrypt characters);
a linked Blob store does NOT auto-inject `BLOB_READ_WRITE_TOKEN`; function
durations sit far under the 60s ceiling. **Still open:** Neon pool behaviour
across freeze/thaw, which needs hours of genuine idleness — trigger, the first
morning Adam opens the app cold.

*Findings.* **A misconfigured `APP_URL` fails as 401, not 404**, because
middleware runs before routing — so a wrong path in the workflow reads as "the
secret is wrong". Recorded against the hour someone would otherwise lose.
**My own verification wrote 24 duplicate rows** into the real price history
(seven refresh runs × four records), flagged rather than cleaned, since deleting
from an append-only table is Adam's call. **Two `llm_requests` rows carry
`completed_at` NULL** and predate the column by five days — pre-existing, not a
failure of the completion write.

*Clean:* production migration state (`db:verify:state` → 17 of 17, exit 0,
against the live database — unit 3's assertion doing its job on the database it
was built for); the auth boundary across every protected route in production;
region `iad1` as configured; the Discogs User-Agent defaulting to a URL that
resolves.

*What it could not reach:* everything behind the password. Blob, MusicBrainz and
Anthropic all fail at point of use on authenticated routes, and R6's first
attack line — does each fail LEGIBLY — needs Adam using the app. **That is the
highest-value remaining check and it is manual**, which is the same conclusion
R5 reached about QA and the one this project keeps re-learning.

*The cron:* authentication holds both ways on the deployed endpoint; it is
APPEND-ONLY rather than idempotent (per §7.5) and seven runs produced seven
identical observations per record, which a weekly schedule makes into history
and repeated runs make into noise; a failed run is visible by email and the
route's own counts are in the workflow log.
