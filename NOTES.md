# NOTES.md

Out-of-scope observations recorded during build steps, per CLAUDE.md §4.
Most of this file is observations that have NOT been acted on; the exceptions
are the entries marked CORRECTED or RESOLVED, which record something that was
believed and turned out to be false. Each entry names the step it was noticed
in.

---

## CURRENT POSITION — read this first

**Updated: 2026-08-10, end of step 7 and its security review.**

**Where we are.** **Step 7 is COMPLETE** (SPEC.md §12: "Discogs integration:
rate limiter, cache, structured search, master version drill-down, release
detail, import, and the `/lookup` screen incl. tiered ownership matching (§7.7).
E2E #3, #4, #11"), including a QA round from real use and a five-unit security
remediation.

**Step 8 is next**: image uploads. E2E #9.

**Last verified, and when.** 2026-08-10, all on the current tree:

| Check | State |
|---|---|
| `npm test` | **1714 passed, 1 skipped, 94 files** |
| `npx playwright test` (full, both projects) | **206 passed.** Green, with **1 local retry** — see the flake entry before trusting it |
| `npm run typecheck` / `lint` / `build` | clean |
| Neon transaction gate | **10 passed, 1 skipped** — the skip is the gate's own marker correctly NOT firing |
| Live Discogs calls during a full run | **zero** — checked by counting `discogs_cache` rows |

Run the Neon file as `npx vitest run test/integration/neon-transactions.test.ts`;
there is no `test:neon` script.

**Four caveats a green suite will not tell you.**

1. **The E2E flake was TWO things, and one of them was a real bug.** Measured
   2026-08-10, after the recorded rate ("~1 run in 5, one test") turned out to
   be "1-3 tests every run, six tests seen". Full detail in Resolved; the part
   needed to read a suite run:

   **`clicking the active chip clears it` was not flake.** It failed all three
   measured runs with a byte-identical error — the only test that did. It read
   as flake because a *different* spec failed alongside it each time, so the set
   moved even though it never did. **The moving-failure rule works on the set,
   not the run: a test that fails EVERY run is fixed, however much company it
   keeps.** The bug was the test asserting against an unfiltered collection
   while other specs' records pushed its row past the 50-per-page cut.

   **What remains is genuine harness flake, ~1 failure per run**, two
   mechanisms, both distinct from the above and neither in the app:
   - `apiRequestContext.post: read ECONNRESET` — the dev server dropping a
     setup POST under full-suite load.
   - typed text lost to the hydration window (diagnosed below), surfacing as
     `toHaveValue` / `toContainText` on a field that submitted empty.

   **`retries: 1` locally** covers those two, deliberately, with the trade
   recorded in `playwright.config.ts`. The reporter is `list` + `html` so a
   retry prints inline as `flaky` — **`flaky` in the output is not noise, it is
   the cost being paid**, and a spec that starts needing its retry every run is
   the next thing to investigate.

   **Verification standard this unit had to meet, worth reusing:** a single
   green full run proves nothing at a 1-per-run rate. Three consecutive runs
   were the evidence before AND after (1-3 failures each → 0, 1, 1 → green,
   green, 1 flaky).

2. **The 2 skipped E2E specs are the desktop-only view toggle**, skipped by
   design on the mobile project — not quarantined.

3. **Step 7 shipped six defects that tests could not see**, and every one was
   found by using the app or by an adversarial reviewer. The pattern is worth
   knowing before step 8: all six lived in a SEAM — between two layers that were
   each correct and each tested. See the seam rule under Open.

4. **The no-live-calls guard has a known limit**, deferred to step 14: it keys
   off the database target, which every current test context satisfies and a
   remote-database CI job would not.

**What step 8 inherits.**

- **A QA finding that belongs to step 8, not to step 7:** a Discogs import does
  NOT bring the cover image across. §5.7's normalized release carries `images`
  with types, the importer ignores them, and `images` is step 8's table. Build
  it there rather than as a separate fix.
- The `safeImageUrl` helper in `lib/discogs/fields.ts` already enforces
  https-only on Discogs image URLs — step 8's uploads need their own equivalent,
  and the same reasoning applies to anything rendered into the user's browser.
- §13 forbids any purchase path, which includes image hosts: a remote image is
  an outbound request to a host somebody else chose. `/lookup` sets
  `referrerPolicy="no-referrer"` and `loading="lazy"` for that reason.

**Entries that bear directly on step 8**: the seam rule (a layer test proves a
layer, never the join); the fixture rule at corpus scale; the absence-as-success
family, whose highest-stakes instance was found in this step; and the untrusted-
input work in §5.7's normalizers, since an uploaded file is untrusted in the
same way a Discogs payload is.

---

## Acceptance criteria for `records` and `want_list`

The seven reference resources these criteria were written for are **all done**
(tags, labels, stores, formats, genres, artists, pressings, plus influences).
Re-pointed at the two core tables, which is where they apply next.

**These are requirements, not observations.** Each was a real defect found in
the tags template during the step 4 remediation. But `records` is the first
resource the template was predicted not to stretch to, so the list is split:
what carries over unchanged, and what has NO PRECEDENT in anything built so far
and therefore needs designing rather than copying.

**STATUS as of 2026-08-06.** The `records` API is built and remediated, so these
are discharged FOR RECORDS: 1–8 all hold; 9 (transactional nested writes) holds
for POST and, after the remediation, for PATCH; 10 (real PATCH semantics) is
implemented and tested both ways; 11 (join sort) and 12 (ten-plus filters) are
built and adversarially reviewed; 13 (the static stats segment) is covered by
`e2e/records-routing.spec.ts` — route precedence needs a real request, not a
handler call.

**STATUS as of 2026-08-08: also discharged for `want_list`.** Step 6 applied
1–12 to the want-list endpoints, and 14 — which was always want_list-only — is
discharged below with what was proven. 13 does not apply (`want_list` has no
static sibling segment).

The prediction that the template would not stretch was correct: the review
found six defects in the records query layer, four of them in exactly the "no
precedent" items 9–12. Item 9 then cost three more units on `want_list`, in a
form the records work had not shown — see the masking entry under Open.

### Carries over unchanged

1. **Every handler wrapped in `withErrorHandling`.** Verified by removing the
   wrapper and watching a test fail, not by inspection.

2. **Every race test written in the same unit as the pre-check it guards.** For
   `records` that is at minimum the find-or-create on `pressings` reached
   through a nested write, and any uniqueness pre-check. Simulate the window by
   hooking the pre-check; do not race threads.

3. **Every blocking foreign key declared in `REFERRERS`,** from fresh
   `pg_constraint` output, blocking FKs only. Note `records` is mostly a
   REFERRER rather than a referent: `images`, `journal_entries` and
   `price_history` all cascade FROM it (§4.2), so `DELETE /api/records/:id`
   removes them rather than being refused. `want_list.acquired_record_id` is NO
   ACTION and DOES block — verify before assuming.

4. **`DELETE` translates 23503 into the 409 and re-reads the count.**

5. **Names through `cleanName`** where a resource has a unique name. `records`
   has NO unique constraint on `(artist_id, title)` — duplicates are legal and
   expected (§4) — so this applies to nested find-or-create targets, not to
   `records.title` itself. Do not add a duplicate check here.

6. **List queries use `orderFor`** for the id tiebreaker and explicit
   `NULLS LAST`. `records` has many nullable sortable columns
   (`purchase_date`, `purchase_price`, `release_year`), so assert nulls land
   last in BOTH directions.

7. **`sort` validated against a per-endpoint allowlist by identity match.**

8. **`?page` bounds and the branded `Offset` type.** Both endpoints are the
   ones most likely to be paged deeply.

### No precedent — design, do not copy

9. **Nested `genreIds` / `tagIds` written transactionally with the parent
   (§5.2).** Nothing built so far writes two tables in one request. The parent
   row and its junction rows must both land or neither: a record created with
   its genres silently dropped is worse than a rejected create, because it
   looks successful. This is also the first place CLAUDE.md §2's Neon-vs-pg
   transaction caveat bites — see the DEFERRED entry below, which now applies
   to step 5 and not only step 6.

10. **Real PATCH semantics.** Every resource so far uses a `strictObject` where
    each field is independently optional and absence means "leave alone". That
    shape cannot express nested arrays: for `genreIds`, absent must mean leave
    alone while `[]` must mean remove all, and the current pattern collapses
    those. Decide and test both explicitly.

11. **A sort on `artist` that needs a JOIN (§5.2).** Every existing sort maps a
    field name to a column on the same table via a `sortColumns` record, which
    is what keeps untrusted input out of the query builder. A join-based sort
    has no column on `records` to map to. Extend the allowlist mechanism rather
    than bypassing it — an allowlist entry that resolves to a joined column is
    fine; string interpolation is not.

12. **Ten-plus filters, including `q` fuzzy across two tables (§5.2).** The
    trigram indexes on `records(title)` and `artists(name)` exist for this.
    Filters compose, so test combinations rather than each in isolation: a
    filter that works alone and silently drops rows when combined with another
    is the likely defect.

13. **`GET /api/records/stats` is a static segment** that must not be swallowed
    by `[id]` (§5.2). Next resolves static before dynamic so this works, but
    `[id]` must still reject a non-UUID with 400 rather than attempting a
    lookup — assert `/api/records/stats` returns stats, not a 400.

14. **DISCHARGED (step 6, unit 4). `want_list` acquire (§5.3) is transactional
    and never deletes the want-list row** — it marks `is_acquired` and links
    `acquired_record_id` (§7.3).

    Proven, not asserted:
    - the forced mid-transaction failure §11 requires runs on **local pg AND
      the real Neon branch**. Removing the transaction fails exactly the 2
      atomicity tests on pg and the 2 acquire tests on Neon, and nothing else —
      the happy-path tests are correctly indifferent, which is why the failure
      tests were written against the query-layer PRIMITIVE rather than the
      endpoint;
    - replacing the mark with a delete — the "clean up after yourself"
      implementation that passes every other test — fails 5;
    - **two SIMULTANEOUS acquires on the WebSocket pool** leave exactly one
      record and one link. That case is the reason CLAUDE.md §2 demanded Neon
      rather than pg: the `is_acquired = false` guard on the UPDATE is the only
      thing preventing the second from orphaning the first, and removing it
      fails that test specifically.

    Neon suite: **9 passed, 1 skipped** (the skip is the loud gate marker
    correctly not firing).

## Open

- **STEP 16 (deploy): `sslmode=require` will change meaning in `pg` v9. Fix is
  one word, and it is not urgent.**

  Every server start logs a `pg` deprecation warning: `sslmode=require`
  currently behaves as `verify-full` (certificate AND hostname verified), and in
  `pg` v9 it will adopt libpq semantics — encryption without verifying the
  certificate. **Weaker, silently, on a version bump.**

  Not caused by our code: the string comes from Neon's dashboard and appears in
  `DATABASE_URL` and `NEON_TEST_DATABASE_URL` alike.

  **The fix, named so nobody has to re-derive it: replace `sslmode=require`
  with `sslmode=verify-full`.** That pins today's behaviour explicitly and the
  warning goes away. Do it in the deploy step, where the environment variables
  are being set anyway, rather than piecemeal across `.env` files that are not
  in the repo.

  Worth doing at step 16 rather than later: after a `pg` major bump the same
  string still WORKS, just less safely, so nothing fails to draw attention to
  it. A security property that degrades quietly is exactly the kind that
  outlives the person who knew about it.

- **§10a's placement was specified without the arithmetic, and measuring it
  changed the design. Third time in this feature.**

  §10a said market data appears on "`/lookup` result and version rows". Measured
  before building: a search returns **50 results**, search payloads carry **no
  price data at all** (only `community` have/want), and layers 1+2 cost **two
  calls per release**. Rendering them across a results page is up to 100 calls
  of a 60/minute budget — on a search the user may not act on.

  §10a already forbade exactly this for layer 3 ("never eagerly, never for a
  whole search page"); the arithmetic is worse for layers 1–2 because they are
  two calls rather than one. Amended to on-demand-per-release, with a
  single-result exception for the shop case: arriving by catalog number or
  barcode usually returns one release, and requiring a click to answer the
  question the search just asked is friction for nothing.

  **The pattern across all three (`format.text`, the condition range, this):
  a spec sentence describing an API's behaviour is a hypothesis until measured.**
  Each was written from what seemed natural. Each cost a round. The check is
  cheap — one script against the live endpoint before designing anything on top.

- **A filter that drops data is the mirror of one that invents it.**

  `ladderHighlights` picks the three grades a buyer meets (VG, VG+, NM) from
  Discogs' eight. A first version fell back to showing everything only when NO
  preferred grade matched — so a ladder of {NM, Good} rendered as **NM alone**,
  silently dropping a priced grade.

  §10a forbids interpolating a grade that was not priced. Losing one that WAS is
  the same misrepresentation from the other direction, and easier to miss: an
  invented number looks suspicious, a missing row looks like Discogs simply had
  nothing.

  Fixed by taking all three preferred grades or everything — never a partial
  filter. Caught by a test asserting two grades in, two grades out.

  **Same family as outage-vs-scarcity, found in the same unit.** Rendering "no
  market data" as "none for sale" turns a network failure into a claim about a
  record's rarity — and reads as a fact rather than a gap, exactly as a dropped
  ladder row does.

  **The generalisation: when data is missing, the UI must distinguish "this is
  absent" from "we do not know".** Both render as nothing on screen unless the
  copy is written to separate them, and the second silently becomes the first.
  A wrong value gets questioned; a confident absence does not.

  | Case | Absent | Unknown |
  |---|---|---|
  | condition ladder | Discogs priced no grades | seller settings missing (§10a says SAY so) |
  | for sale | zero copies listed — a fact about scarcity | fetch failed |
  | genre chips | record filed under nothing | import never attached them |

- **RULE: a captured fixture contains VOLATILE fields. Assert the property, not
  the reading.**

  Re-capturing for step 10 refreshed all seven Discogs fixtures and broke a test
  that had passed for three steps: `lowest_price` moved 43.96 → 55.59, because
  it is a live market figure. The code had not changed; the market had.

  `num_for_sale` was asserted as `11` in the same test and passed — **by
  coincidence**. It is equally volatile and would have broken on the next
  capture, in a step with no connection to marketplace data.

  | Field kind | Example | Assert |
  |---|---|---|
  | stable identity | `id`, `catno`, `country`, `title` | the exact value |
  | curated but slow | `genres`, `styles`, `formats` | the exact value |
  | **volatile** | **`lowest_price`, `num_for_sale`, `community.have/want`** | **the property** |

  **Stated generally: any fixture refreshed from a live API carries fields that
  change without anything being wrong.** The test that broke had passed for
  three steps and the code had not moved — the market had. The one beside it
  passed by coincidence and was equally volatile, which is the more dangerous
  half: a coincidence looks exactly like coverage until the day it does not.

  Rewritten, the test asserts the normalizer CARRIES the field —
  `expect(normalized.lowestPrice).toBe(raw.lowest_price)` plus a type check —
  which still fails when a mutation drops it (verified) and never fails because
  a record got more expensive.

  **The tell: an assertion whose expected value came from the API rather than
  from the behaviour.** If re-running the capture could change the number, the
  number is not the thing under test.

  **A second trap in the same refresh: the DIFF lies about identity fields.**
  `master-versions-discharge.json` appeared to swap `CLAY LP 3` for `CLAY CD 3`
  at the same array position — which would mean the fixture had lost the vinyl
  pressing the identical-rows tests depend on.

  It had not. Compared as SETS rather than by line: 25 versions before, 25
  after, zero dropped, zero added, still 8 `CLAY LP 3` UK versions. Discogs had
  reordered the array, and a line-oriented diff aligned unrelated entries.

  **Before concluding a captured array changed, compare it as a set.** A
  reordered list produces a diff that reads as wholesale replacement, and the
  natural reaction — reverting the fixture — would discard a legitimate refresh.
  `git diff` is the wrong instrument for an unordered payload.

- **MEASURED, for step 10 unit 1: `curr_abbr` works on `stats` and is IGNORED by
  `price_suggestions`.**

  | Endpoint | `curr_abbr` | Result |
  |---|---|---|
  | `marketplace/stats/:id` | honoured | EUR 41.14 / USD 47.28 / GBP 34.99, same release |
  | `marketplace/price_suggestions/:id` | **ignored** | USD whatever is requested |

  `price_suggestions` is pinned to USD — and not even to the account setting:
  the profile reads `curr_abbr: EUR` and the endpoint returns USD anyway.
  Measured, not assumed.

  **Consequence: layer 1 must REQUEST `curr_abbr=USD`.** It is the only value
  that makes the two layers agree, and it happens to be Adam's currency. Had he
  been in the UK, the two figures could not have been reconciled without a
  conversion we invented — which is why this was checked before designing the
  panel rather than after.

  Eight condition grades come back consistently (Mint → Poor), verified on two
  releases.

  **The resolution is FORTUNATE, not designed.** `price_suggestions` is pinned
  to USD regardless of the account setting, and layers 1 and 2 agree only
  because Adam is in New York. A UK user would see a GBP floor beside a USD
  ladder, and reconciling them would need a conversion we invented — a number
  nobody quoted, which is the confidently-wrong shape in money.

  **So the design must not depend on the two agreeing.** `normalizeMarket`
  carries the currency per figure rather than assuming one, and
  `formatMarketPrice` renders each with its own symbol. That costs nothing today
  and is the difference between "works here" and "works". If Discogs ever
  honours `curr_abbr` on `price_suggestions`, or the account moves, the panel
  keeps telling the truth.

- **BLOCKED, awaiting Adam: §10a's range-with-conditions needs Discogs seller
  settings.**

  Measured against the live API before starting step 10 (2026-08-12):

  | Endpoint | Result |
  |---|---|
  | `marketplace/price_suggestions/:id` | **404** — *"You must fill out your seller settings first"*, on two different releases |
  | `marketplace/stats/:id` | 200 — `num_for_sale: 11`, `lowest_price: 41.14 EUR` |
  | release payload (already cached) | the same two fields |

  The token authenticates (`oauth/identity` → 200), so this is an ACCOUNT STATE,
  not a bad path: per-condition pricing requires Discogs seller settings.

  §10a specifies "a range, never a single number" — *"VG £12–18, NM £40+"* — and
  names collapsing conditions into one figure as the §8 flattening error. **With
  seller settings unset, the range is not obtainable and building it as one
  number is the thing the section forbids.**

  Adam is filling in the seller settings. Two outcomes:
  - **works** → build §10a as written, `price_suggestions` supplies the range;
  - **does not** → build the honest subset ("11 for sale, from £41.14", no
    invented range, no condition claims) and §10a is amended to match.

  **The split is approved either way** — the three-placement architecture and the
  caching are identical; only the payload's richness changes.

  **Unit 1's normalizer is built against a CAPTURED fixture**, per the step 7
  practice: the shape must come from a measured payload, not from what the docs
  describe. That is the discipline whose absence produced this blocker in the
  first place, and the `format.text` error before it.

- **RULE: a negative claim about a file needs a search that could have found it.**

  Step 10 planning, 2026-08-12. I reported that §12's reorder "did not land" and
  that MusicBrainz "appears nowhere in SPEC.md". Both were false. The reorder was
  present and complete through step 16.

  The search was `grep -in "market|musicbrainz"` **inside a `sed` slice of §12**
  — and the slice ended at `^## 13\.`, while the reordered list runs to step 16,
  so the range closed before the entries. A second grep for "musicbrainz" across
  the whole file returned nothing because I had already convinced myself and read
  the empty output as confirmation.

  **"I searched and found nothing" is only evidence if the search would have
  found it.** Before reporting an absence, prove the method works: grep for
  something you KNOW is in the file, using the same command shape. Here,
  searching for "Market data" — the §10a heading I had just read — would have
  returned a hit inside §12 and ended it immediately.

  Same family as the wrong-anchor mutation trap and the `getByRole('row')`
  reproduction: **a null result from an instrument never shown to work is not a
  measurement.** Third instance, and the first where the instrument was a grep.

  **FOURTH INSTANCE, and the class is now worth stating on its own: `git diff`
  is an instrument, and it aligned unrelated array entries.**

  Re-capturing `master-versions-discharge.json` produced a diff reporting that
  `CLAY LP 3` had become `CLAY CD 3` at the same position — vinyl replaced by
  CD, which would mean the fixture had lost the pressing the identical-rows
  tests depend on. Compared as SETS: 25 versions before, 25 after, zero dropped,
  zero added, still 8 `CLAY LP 3` UK versions. Discogs had reordered the array
  and a line-oriented diff paired unrelated entries.

  **The natural response — reverting the fixture — would have discarded a
  legitimate refresh** on the strength of a change that never happened.

  **What unites all four: each produced a confident WRONG ANSWER rather than an
  error.** A tool that fails loudly is harmless; these returned plausible output
  and were believed.

  | Instrument | Reported | Actually |
  |---|---|---|
  | `str.index()` anchor | mutation applied, 0 failures | applied to a different query |
  | `getByRole('row')` | 8/8 reproduction of a defect | locator matched nothing |
  | `grep` in a `sed` slice | §12 reorder absent | present, outside the slice |
  | `git diff` on an array | catalog number changed | array reordered, content identical |

  **The check that would have caught every one: exercise the instrument against
  a case whose answer you already know.** Grep for something you know is
  present; make the reproduction pass once; confirm the mutation landed; compare
  the array as a set. One extra command each time.

- **RULE: make a reproduction GREEN once before trusting it red.**

  A reproduction that confirms your hypothesis needs the same scrutiny as one
  that refutes it — and gets less, because it agrees with you.

  Step 9's `manage` investigation. A forced-race probe failed **8 of 8**, which
  read as decisive proof of a hydration defect. It was measuring
  `getByRole('row')` against a tree that renders `listitem` — a locator matching
  nothing, failing perfectly every time. Four further timing measurements
  (500ms to 6s, all "0 rows") looked like proof the refresh never landed. Every
  one was the locator.

  **The check costs one run: exercise the assertion against known-good
  conditions and confirm it can PASS.** A red result from an assertion never
  observed green is not evidence — it cannot distinguish "the behaviour is
  broken" from "this never matched anything".

  Related: the same investigation's earlier probe printed `posts: 1` and a 201
  carrying the right name. That said plainly that the write worked, and it was
  read past because it did not fit the theory. **Read the parts of a probe that
  contradict you first.**

- **RULE: the symptom names a location, and the location is where everyone
  looks.**

  `manage.spec.ts` failed intermittently for four investigations across several
  steps. Every one examined the test, the component, and the `/manage` screen —
  because the failure said `manage`. The cause was `workers` in
  `playwright.config.ts`: ~6 workers against one dev server, saturating it.

  Nothing in the symptom pointed at the config. The test that fails first under
  contention is simply the one doing the most sequential round trips, and its
  name is then attached to a cause it has nothing to do with.

  **The tell: a failure that resists investigation AT the place it names.** After
  two failed attempts inside the named location, ask what is shared —
  the server, the database, the config, the fixtures — and vary that instead.
  The four-attempt cost here is the argument for asking earlier.

- **E2E RUNTIME crossed the 6-minute threshold: measure before optimising.**

  The agreed trigger was "revisit past 6m". Measured 2026-08-12 across
  consecutive full runs: **6.4m and 6.9m**, against ~4.0m when the suite held
  246 tests. The suite is now 270 tests in 13 files — **+10% tests for +60%
  wall clock**, which is disproportionate and the reason this is recorded rather
  than accepted.

  **Where the time goes** (total test-time, summed across workers, from one
  run's JSON):

  | File | Test-time |
  |---|---|
  | `record-form` | 366s |
  | `discogs-prefill` | 300s |
  | `record-detail` | 282s |
  | `lookup-flows` | 232s |
  | `collection-filters` | 209s |
  | `manage` | 187s |

  ~32 minutes of test-time over ~4 workers. **No single file dominates**, so
  there is no one hotspot to fix — the cost is spread, which points at
  per-test overhead rather than a slow feature.

  **The individual outliers are all `manage`**: 32.7s, 23.4s, 22.3s for the
  genre-move tests — the same file with the long-standing unexplained failure,
  and one of two files whose controlled inputs still lack `data-hydrated`. Those
  two facts may be the same fact.

  **Candidates, none measured yet:**

  1. **`login()` runs per test** — 270 logins, each a navigation, a hydration
     wait and a form round trip. A shared storage state (`storageState`) would
     make it once per worker. Biggest single lever if the overhead is real.
  2. The `manage` genre-move tests specifically, which are 3× the median.
  3. Worker count against available cores.

  **Do not optimise before measuring which.** The suite is green and the
  runtime is inconvenient rather than blocking; guessing here would trade a
  known cost for an unknown regression. Its own unit, with a before/after.

- **`data-hydrated` should be a DEFAULT for controlled forms, not a discovery.
  Four instances is a pattern; the fifth diagnosis is waste.**

  Measured 2026-08-12. Seventeen client components; six carry the marker. The
  vulnerable set is not "all client components" — it is those with a CONTROLLED
  input whose state is read on submit, because that is the only shape where a
  pre-hydration keystroke lands in the DOM and never in React.

  | Marked | Unmarked, with controlled inputs |
  |---|---|
  | `RecordForm`, `CollectionFilters`, `WantListForm`, `LookupClient`, login, `RecordJournal` | **`GenreTree`, `ResourceTable`, `InlineCreate`, `ImageGallery`** |

  **`manage.spec.ts` has a long-standing failure that no unit has diagnosed**,
  and `GenreTree` and `ResourceTable` both live on `/manage` with four and two
  controlled bindings. That is a lead, not a conclusion — the recorded
  diagnosis for it is a slow `router.refresh` + PATCH, which is a different
  mechanism. Worth testing before assuming either.

  **The cheaper shapes, in preference order:**

  1. **A shared `useHydrated()` hook returning a ref**, so a new form adds one
     line and cannot forget the effect's shape. Least ceremony, no build
     tooling.
  2. **An ESLint rule** requiring the marker in any `'use client'` file
     containing `value={` — mechanical, catches the case at write time, but
     needs a custom rule and will misfire on read-only bindings.
  3. **Status quo**: diagnose each one when a mobile test fails. Four
     diagnoses so far, each costing a probe and a false lead about saving.

  Not done here because it touches four components and the manage specs, which
  is its own unit with its own before/after. **Until then: any new controlled
  form gets the marker while it is being written.** Noticed: step 9, unit 2.

- **RULE: a Discogs field describing the CATALOGUE OBJECT belongs beside our
  field, never in it. Two instances; a third will come.**

  The distinction is release-versus-copy. Discogs describes a release — every
  copy ever pressed. Several of our fields describe THE COPY IN HAND, and they
  are not the same fact even when they share a name.

  | Field | What Discogs holds | What ours holds |
  |---|---|---|
  | `matrix_runout` | every runout its contributors submitted, across pressings | what is etched in YOUR dead wax |
  | `notes` | sleeve text, gatefold, publishing, copyright | where you found it, why you kept it |

  **Prefilling either is wrong in the same way**, and the harm is not merely
  clutter:

  - it writes a value describing no physical object into a field whose whole
    purpose is describing one;
  - a filled field reads as VERIFIED, which inverts §5.7's "check every field
    against the record in your hand";
  - it makes §7.8 unenforceable. "Never overwrite user-entered data with
    external data" requires knowing whose text it is, and a prefilled field
    that the user then edited is indistinguishable from one they wrote.

  **The treatment, established for matrix in step 7 and applied to notes in
  step 8:** render it as reference text beside an empty field, through `Row`'s
  `after` slot. Nothing is dropped — a Discharge first pressing's "Pay no more
  than £3.99" is genuinely useful in a shop — and nothing is claimed.

  **The test when a new field is added: does this describe the release, or the
  copy?** If the release, it goes beside. Note that §6's field mapping is the
  authority on what is imported AT ALL — it lists title, artist, label, catalog
  number, year, country, format, matrix and genres, and `notes` is deliberately
  absent. Two of us read "notes is dropped" as a defect without checking that.

- **RULE: a field seen on one Discogs endpoint's payload is not evidence about
  another's. Three instances makes it a property of the API, not an accident.**

  | Field | Search | Release | Master versions |
  |---|---|---|---|
  | genre / style | **singular** (`genre`, `style`) | plural (`genres`, `styles`) | absent |
  | the year | `year` | `year` | **`released`** |
  | format descriptors | array | array + `text` | **comma-joined string, no `text`** |

  Each was found the hard way and each is documented at its own call site. The
  class is worth stating once: **these endpoints describe the same objects with
  different field names, different types, and different completeness.**

  **The instance that cost the most** (step 8 close, 2026-08-11): `format.text`
  carries "Rockaway Pressing" and would have separated the two Hot Tuna
  releases that misled a user about which pressing they owned. It was observed
  on the RELEASE payload and reported — by me, and agreed by the developer — as
  "already in the versions payload". It is not there at all. The versions
  endpoint returns `id, label, country, title, major_formats, format, catno,
  released, status, resource_url, thumb, stats`.

  Caught only because the instruction was to measure it against the real rows
  before building. Building first would have produced a column `undefined` for
  every row — and one that LOOKED right in tests, since a hand-written fixture
  would have carried whatever shape the author assumed.

  **The check: before using a field, confirm it on the payload of the endpoint
  that will actually be called** — not on a sibling endpoint describing the same
  release. The overlap is large enough to make the assumption feel safe and the
  differences are exactly where it breaks. `test/fixtures/discogs/` has captured
  payloads for all three; read the fixture rather than reasoning from memory.

- **RULE: the comparison columns are FIXED, and for any given master the
  discriminating field may not be among them. That is a property of the design,
  not of one or two masters.**

  §5.7's version table shows year, country, format, catalog number and label —
  chosen because they discriminate MOST releases. They are not guaranteed to
  discriminate ANY particular one, and Discogs offers no field that always does.

  Two instances so far, and the second cost a user their pressing identity:

  | Master | What collapses | The real discriminator |
  |---|---|---|
  | Carpenters | four cards identical on every column | not established |
  | Hot Tuna 133514 | **three US 1970 versions byte-identical** | pressing plant — `RCA Records Pressing Plant, Rockaway` vs `…Hollywood` |

  **The plant is not obtainable here.** Measured against the live API: the
  versions endpoint returns `id, label, country, title, major_formats, format,
  catno, released, status, resource_url, thumb, stats` — no `text`, no
  companies. `format.text` (which carries "Rockaway Pressing") is on the RELEASE
  endpoint, so showing it costs one rate-limited call per row: 11 calls for a
  table of eleven, against 60/minute.

  **What shipped instead** (2026-08-11): rows identical on every displayed
  column collapse into one saying "N more look identical from here", expandable.
  Three identical rows LOOK LIKE AN ANSWER; one row that admits the limit is
  honest. Within a group, most-owned first — the only signal available, and a
  real one, though it does not identify which pressing is in the user's hands
  and the UI does not imply it does.

  **A group containing something the user OWNS never collapses.** §7.7's badge
  outranks the tidier table: hiding "you already have this" turns it into
  silence, and someone in a shop reads no badge as "buy it".

  **What is still open:** the collapse makes the limit visible; it does not
  resolve it. If identifying the exact pressing becomes important — step 11's
  shelf ordering, or a QA finding that expanding is too coarse — the options
  are fetch-on-expand for a single row, or surfacing `stats`-based hints. Both
  cost calls. Recorded rather than guessed at.

- **DECLINED, do not re-propose: a sold/gone record status.**

  Raised when the delete UI was built, scoped in detail, and **declined by Adam
  on 2026-08-11**. SPEC.md was briefly amended and has been reverted; §4.2 has
  no `status`, `sale_price` or `sale_date`, §7 has eight rules, and §7.7 has
  three tiers. Recorded here because it LOOKS like an obvious gap and will
  otherwise be proposed again.

  **The argument for it** was real: deleting a sold record discards purchase
  price, date and store — the same history argument §7.3 makes for keeping
  acquired want-list entries.

  **The argument against it won, and it is about cost, not correctness:**

  | Cost | Detail |
  |---|---|
  | schema | an enum plus two columns, and a migration |
  | §7.6 | estimated value must exclude sold records — a filter in the value chain |
  | every collection query | count, facets and pagination all silently wrong without a status filter |
  | §7.7 | a fourth badge tier, on an interface already amended once |
  | steps 10-11 | the graph and shelf order both read the collection |

  **Adam tracks what he owns, not what he has sold**, and the feature would be
  used a handful of times a year. Delete covers the real need.

  **Consequence for the delete confirmation: "cannot be undone" stays exactly as
  written.** It is accurate, and there is no alternative action to offer — a
  confirmation that hedged would be worse than one that states the fact.

- **DEBT: `login()` is copy-pasted into TWELVE spec files.**

  Every E2E spec carries its own identical `login()` — `goto('/login')`, wait
  for `data-hydrated`, type the password, click, assert the URL.

  **The cost is already measured, not hypothetical.** The login-hydration fix
  was one attribute on the page and one `waitFor` in the helper; it landed as
  twelve edits because there are twelve helpers. A shared helper would have made
  it one, and any future change to how login works pays the same tax again.

  **Deliberately NOT consolidated when found.** It touches every spec file, so
  the diff would span the whole suite — and a regression hidden inside a
  suite-wide mechanical change is exactly the thing this build's full-E2E gate
  exists to catch, made maximally hard to see. It belongs in its own unit with
  its own before/after run, not appended to a feature step.

  When it is done: one helper in `e2e/seed.ts` or a new `e2e/auth-helper.ts`,
  and the twelve copies deleted in a single commit that changes nothing else.
  Noticed: step 8 close, 2026-08-11.

- **RULE: a test asserting a feature is ABSENT is a dated claim, and nothing
  marks its expiry.**

  `toHaveCount(0)` on a heading, `not.toContain` on a field, "no section for the
  part that is not built yet" — each is true only until the step that builds it.
  The assertion does not know which step that is, and the unit that makes it
  false is usually not the unit that opened the file.

  **Stated as evidence rather than principle: both instances so far were caught
  by a FULL-SUITE run, not by the unit that invalidated them.**

  | Instance | Invalidated by | The unit's own spec file |
  |---|---|---|
  | `Matrix / runout` prefilled value | the matrix change | green |
  | `Images` heading absent | the gallery | green |

  Two for two. That is the argument for CLAUDE.md §10's full-E2E gate in one
  line — a contract change breaks the tests that encoded the old contract, and
  those live in files the unit never opened.

  **What to do about it, in order of preference:**

  1. Prefer asserting what IS true over what is not. "The gallery says 'no
     images yet'" survives the feature being built; "there is no Images
     heading" does not.
  2. When an absence assertion is genuinely the point — a section that must
     stay hidden when empty — say WHY it is absent, so the next reader can tell
     a rule from a placeholder. `record-detail.spec.ts` now distinguishes the
     two: Pressing stays hidden by design, Journal is pending step 9.
  3. Name the step in the comment when it IS a placeholder, so a grep before
     starting that step finds it.

  Established: step 8, unit 3.

- **RULE, two stores that must agree: choose the order whose failure mode is
  INVISIBLE AND CHEAP over the one that is VISIBLE AND PERMANENT.**

  When a write spans two stores — here Vercel Blob and Postgres — and either can
  fail independently, no order is transactional. The choice is not "which order
  is safe" but "which wreckage would I rather live with".

  For §5.9's images the two failure modes are not symmetric:

  | Wreckage | Cost |
  |---|---|
  | Blob with no row | invisible, pennies, nothing renders it |
  | Row with no blob | **a permanently broken image on the detail screen** |

  A row pointing at a dead blob is also indistinguishable from a real image
  until it fails to load, which puts it in the absence-as-success family — the
  screen asserts something it cannot deliver.

  So the orders are OPPOSITE and both fall toward the leaked blob:

  - **Upload: store the blob, THEN write the row.** A failed store writes no
    row.
  - **Delete: delete the row, THEN delete the blob** (best-effort, leak logged).
    A failed blob delete leaves an orphan nothing points at.

  Generalises beyond images: whenever a second store cannot be enrolled in the
  database transaction, order the operations so the survivable failure is the
  one that happens. State which failure you chose and why, rather than picking
  an order by habit. Established: step 8, units 1-2.

- **RULE: a test is only as discriminating as its fixture.** When several
  orderings, selections, or matches agree in the seed data, NO assertion can
  tell which one the code used. The test looks correct, passes, and constrains
  nothing.

  **Before writing an assertion about ordering, selection, or matching, check
  that the fixture makes the alternatives produce DIFFERENT output — and prove
  it by mutation.** Reading cannot catch this; the test reads as correct in
  exactly the case where it is worthless.

  Five instances, all in this build:

  | Fixture | Alternatives that agreed | Caught by |
  |---|---|---|
  | 2-row list seed | artist order == title order | mutation: artist expr → `records.title` passed 29/29 |
  | Same seed, 4 scalar sorts | title == date == price order | mutation: 3 fields → title failed 2, neither the test naming them |
  | 2-level genre tree | recursive CTE == single join | mutation: one-level walk |
  | Successive price fixtures | recency == enum declaration order | mutation, after 3 fixtures and 2 wrong hypotheses |
  | `from=X&to=X` year range | yearFrom bound == yearTo bound | mutation: either bound failed BOTH tests |

  The fix is always the same shape: add rows that INVERT the relationship. Two
  artists whose names sort opposite to their titles; four records giving each
  sortable field a different permutation; a three-level hierarchy so a
  grandparent filter must find a grandchild; a query sending only the bound
  under test.

  **The tell:** ask "if the code used the OTHER rule, would this fixture produce
  different output?" If the answer is no, or you cannot answer it, the fixture
  is the defect and the assertion is decorative regardless of how it is written.
  Noticed across steps 4–5; stated as a rule during the step 5 remediation.

  **THE STING, and the reason this class keeps recurring: a fixture drawn from
  TYPICAL data tests the typical path — which is the one least likely to be
  wrong.**

  Step 8 unit 4. `attachDiscogsCover` must pick the image whose `type` is
  `primary`, not merely the first. The fixture listed primary first, so "find
  the primary" and "take `images[0]`" agreed, and the mutation replacing one
  with the other **failed zero tests**.

  What makes it worse than an ordinary weak fixture: **real Discogs releases
  usually DO list the primary first.** So `images[0]` would have been correct in
  the common case and wrong exactly where it mattered — a release whose
  contributor ordered them differently, silently attaching a back cover or an
  inner sleeve as the record's front. The bug would have been invisible in
  testing, invisible in most use, and wrong in the case a person would notice.

  Reordering the fixture so `secondary` comes first makes the same mutation fail
  1 test. **When a fixture is built from what the source usually sends, it
  cannot discriminate rules that agree on the usual case — deliberately
  construct the atypical ordering.**

  **VISIBILITY VARIANT (third instance of the class): `textContent` cannot see
  visibility, so an assertion built on it is blind to the entire property it
  claims to test.**

  Hidden elements keep their text in the DOM. Tailwind hides with
  `display:none`; `textContent` — and therefore Playwright's `toContainText`
  and `toHaveText` — returns the text of a hidden node exactly as it returns a
  visible one.

  Measured: a spec asserting a label was readable at seven widths passed at all
  seven, INCLUDING the width where the label rendered nowhere on screen. It
  would have passed whatever the layout did.

  ```ts
  await expect(row).toContainText(label);              // blind to display:none
  expect(await visibleText(row)).toContain(label);      // innerText — sees it
  ```

  **Any assertion about what the user can SEE must read `innerText`**, or use a
  visibility-aware matcher (`toBeVisible`). `collection-widths.spec.ts` is the
  worked example.

  **THE CHECK THAT UNIFIES THIS WHOLE CLASS — apply it to every assertion:
  "would this produce a different result if the property it names were wrong?"**
  Three instances so far, all failing that check the same way:

  | Instance | Names | Actually constrains |
  |---|---|---|
  | `.toThrow()` with no message | that the RIGHT error was thrown | that *something* threw |
  | `toEqual` on an object shape | the fields that matter | every field, including irrelevant ones — and passes when the ones that matter are absent from both sides |
  | `toContainText` on layout | that the value is VISIBLE | that the value is in the markup |

  Each resembles verification while leaving the named property free to be
  wrong. Noticed: steps 5-7; stated as a class 2026-08-10.

  **CONCURRENCY VARIANT: a concurrency test that is not actually concurrent
  proves only what the sequential path already covers.** Same failure in a
  different costume — the test looks like it exercises the race and does not.

  The acquire guard (`WHERE is_acquired = false` on the UPDATE) exists for two
  callers reading `is_acquired = false` at the same time. Written sequentially:

  ```ts
  await acquire(item);          // succeeds
  await expect(acquire(item)).rejects.toThrow();   // "proves" the guard
  ```

  That passes with the guard REMOVED, because by the second call the first has
  committed and the endpoint pre-check refuses it anyway. It exercises the
  pre-check, not the guard.

  Starting both before awaiting either is the first step:

  ```ts
  const outcomes = await Promise.allSettled([acquire(item), acquire(item)]);
  expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  ```

  **CORRECTION (step 6 remediation, unit 3): that is NECESSARY AND NOT
  SUFFICIENT, and this entry said otherwise.** Two promises in flight still
  race in real time, so whether they collide is decided by scheduling — and a
  pre-check that completes before the second caller reads closes the window
  before the guarded code is reached.

  Measured on the acquire endpoint, same test, same code, opposite verdicts:

  | Run | Statuses | Defect |
  |---|---|---|
  | the test alone | `[201, 500]` | visible |
  | the whole file | `[201, 409]` | **hidden** |

  Under load the first request cleared its pre-check-to-commit window before the
  second one read, so the pre-check answered and the transaction guard never
  ran. The test passed against broken code in the configuration it would
  normally be run in.

  **What makes a concurrency test real is FORCING both callers past the point
  the guard defends**, not hoping they arrive together. Hook the pre-check and
  release only once both have cleared it:

  ```ts
  let arrived: () => void;
  const bothArrived = new Promise<void>((r) => { arrived = r; });
  let waiting = 0;
  vi.spyOn(queries, 'findWantListItemById').mockImplementation(async (id) => {
    const item = await real(id);
    if (++waiting === 2) arrived();   // both are past the check
    await bothArrived;                // neither proceeds until then
    return item;
  });
  ```

  Note this hooks EVERY call, which the mock-scope rule below warns against —
  correctly, for its case. The difference: there the mock must let a LATER call
  fall through; here the release condition is the second ARRIVAL, and exactly
  two callers exist. Both rules are really the same instruction — know how many
  times the code under test calls the thing you hooked.

  **The isolation asymmetry is worth its own alarm.** A test that finds the
  defect ALONE and hides it in a full run looks exactly like flake, and the
  standard response to flake is to quarantine or delete it. It is the opposite:
  the isolated run is the honest one. Before writing off a race test as flaky,
  check whether the passing configuration is the one where the race does not
  happen.

  **The tells, in order:** an `await` between the two operations that should
  collide; then, once that is fixed, a result that changes between an isolated
  run and a full one. The first means there is no window at all, the second
  means the window is real but not guaranteed. Noticed: step 6 unit 4;
  corrected and extended in the step 5+6 remediation, unit 3.

  **CROSS-SPEC VARIANT: a test can assume something about SHARED STATE that no
  other test is obliged to preserve.** The rule above is about one test's own
  fixture. This is the same defect between tests, and it only appears once
  specs share a database — which every E2E spec here does, running fully
  parallel across two browser projects.

  Three instances in one unit (step 5, unit 7d), all deterministic once
  pagination existed and all invisible when the spec ran alone:

  | Assumption | Broken by |
  |---|---|
  | "my record is on page 1" | another spec's 110-row fixture sorting ahead of it |
  | "my 110 rows don't matter" | every other spec reading page 1 |
  | "my search term is unique" | the other browser project seeding the same title |

  The last one is worth spelling out, because the obvious fix failed. Searching
  `'Hear Nothing'` matched the parallel project's copy; scoping it to
  `'Hear Nothing <suffix>'` then matched all THREE of the run's own records,
  because §5.2 makes `q` fuzzy across the ARTIST name too and the artist is
  `Discharge-<suffix>`. Two collisions at different scopes, and each obvious
  fix only closed one. Measuring each attempt is what found the second.

  **FOURTH INSTANCE, step 7, and the count is the point: ALL FOUR PRESENTED AS
  SOMETHING ELSE.** Not one of them looked like shared state at first sight.

  | What it looked like | What it was |
  |---|---|
  | a width-dependent layout bug at 390px | two shots seeding identical titles |
  | a broken unmatched-artist notice | a sibling test creating an artist the fuzzy match found |
  | a flaky prefill spec, three different failures in three runs | `beforeAll` seeding with `afterAll` cleanup, removing a row a parallel worker was using |
  | the no-live-call guard not firing | another spec seeding the release, so the cache answered and the guard was never reached |

  **The diagnostic value is in the count.** After four, the right first question
  for any E2E failure that is not obviously deterministic is "what else touches
  this row, this title, this id?" — before reading the code under test at all.
  Three of the four cost a full debugging round because that question came
  second.

  **The specific trap in the last two: a test can be broken by a fixture that
  makes it PASS a check it should fail.** The guard specs asserted "nothing has
  cached this release", and another spec cached it — so the assertion inverted
  rather than erroring. Seeding is not only an interference risk, it is a way to
  satisfy a precondition that was supposed to be absent.

  **The rules:**

  - scope every assertion to something no other spec can produce — an id you
    created, not a title, a term, or a position;
  - a spec that seeds bulk data deletes it in a `finally`, so a failure does
    not cascade into every later spec and bury the original cause;
  - prefer navigating to a filtered URL over clicking through an unfiltered
    page, which is a page-1 assumption in disguise.

  Expect this to recur: every remaining UI step adds specs to the same shared
  database. Noticed: step 5, unit 7d.

  **PRESENTATION VARIANT: a duplicate-fixture error can present as a
  width-dependent LAYOUT bug.** The cross-spec variant above is about assertions
  going wrong. This is about the failure pointing somewhere else entirely.

  The step 6 unit 5 screenshot harness captured `/want-list` at 1280 and 390.
  The 1280 shot passed; **390 failed, alone and in parallel, on
  `getByText(title)` timing out.** Everything about that says the row renders
  differently at narrow width — a wrapped element, a responsive branch, a
  `hidden md:block`. The row component was read looking for exactly that, and
  has no width-dependent behaviour at all.

  Both shots seeded the SAME titles. By the second run two rows matched, so the
  locator resolved to two elements and Playwright raised a strict-mode
  violation — which surfaces as a TIMEOUT on `toBeVisible`, not as "found 2".
  The message names the thing that was not visible, so it reads as absence.
  Fixed by suffixing each shot's fixtures with its own viewport name.

  **Why it belongs here rather than under the E2E entries:** nothing was wrong
  with the page, and nothing was wrong with the assertion. The fixture was
  duplicated, and the only surprising part is where the symptom appeared. A
  variable that differs between two runs (viewport) gets blamed for a failure
  caused by one that does not (the seed).

  **The tell:** a failure that correlates with a dimension the code does not
  read. Before investigating why 390 differs from 1280, confirm the two runs
  differ ONLY in width — here they also differed in how much data was already
  present, which is the same axis-confusion the "same family" rule warns about.

- **RULE, responsive layout: a summary line must hide at the WIDEST breakpoint
  of any column it substitutes for, never the narrowest.**

  A table that hides columns at narrow widths and reprints them in a summary
  line is only correct while the two are exact complements. In
  `CollectionList.tsx` they were not: the summary was `sm:hidden` (gone at 640)
  while the label column was `hidden md:table-cell` (arriving at 768), so
  **between 640 and 767 the label rendered nowhere**. Real, found in use, fixed
  2026-08-10.

  Deriving it each time is error-prone; the rule states it once. When adding or
  moving a hidden column, the summary line's breakpoint is part of that change.

  **Why this class of defect is worse than it looks:** the table draws absence
  as `—`, meaning "not recorded". A value dropped by the LAYOUT is
  indistinguishable from one the user never entered, so the screen is
  confidently misleading rather than obviously broken — CLAUDE.md §8 ranks that
  the worse of the two. Another instance of the absence-as-success family.

  **COROLLARY, from the testing side: 390 and 1280 both pass, so responsive
  defects live at the BOUNDARIES and only a sweep finds them.** The two
  habitual screenshot widths sit either side of the gap and see nothing. Sweep
  each breakpoint and one pixel below it — `collection-widths.spec.ts` uses
  375/639/640/700/767/768/1280 against Tailwind's sm=640 and md=768.

  Pair it with the visibility rule above: such a sweep MUST assert `innerText`,
  because a `textContent` assertion passes at every width including the broken
  one.
  Noticed: step 6, unit 5.

  **SECOND INSTANCE, and it is becoming a habit worth naming: A FIXTURE THAT
  MAKES A TEST PASS BY REMOVING WHAT IT TESTS.** Twice in two units, both caught
  while writing rather than by mutation.

  | Fixture convenience | What it silently removed |
  |---|---|
  | `mockMaster(year = 1971)` — a DEFAULT | passing `undefined` to model "master has no year" got 1971 instead, so the test failed against correct code |
  | suffixing an artist name to dodge `artists_name_unique` | the two records would have had DIFFERENT artists, and §7.7 matches on artist — the test would have passed while testing nothing |

  The second is the more dangerous, because it fails in the *passing*
  direction. A default that supplies a value makes a test fail loudly and gets
  fixed; a suffix that separates two rows makes the assertion trivially true
  and gets committed.

  **Both came from solving a test-mechanics problem — a required argument, a
  unique constraint — without asking what the workaround changed about the
  scenario.** The unique constraint wanted found-or-created, not a fresh name:
  the whole point was two records belonging to the SAME artist.

  **The check: after working around a constraint in a fixture, restate what the
  test is now testing.** If the restatement is narrower than the test's name,
  the workaround ate the scenario.

  **SUITE-SCALE VARIANT: the fixture rule applies to the whole CORPUS, not just
  to one test's data. If every committed fixture shares a property, no test can
  see what happens without it — however well written.**

  Step 7's prefill fabricated a pressing year from the master's album year, and
  no test caught it. Not because the tests were weak: because every captured
  Discogs payload in the repository carried its own `year`, so the master
  fallback never ran in any of them. The defect lived on a path the entire
  suite avoided.

  It surfaced only from a real lookup — the US Carpenters LP, `year: 0` and no
  `released` field at all, a shape I could not construct from imagination
  because every variation I invented recovered the year correctly.

  **The response was to make it a permanent fixture** (`release-no-year.json`),
  not to fix the code and move on. A payload that exercises a path nothing else
  reaches is worth more than a payload that duplicates coverage, and the
  argument for keeping it is the same one that justifies capturing fixtures at
  all: it encodes what the world does rather than what we imagined.

  **The check, at corpus scale: for each fixture, what property does it share
  with every other one?** Shared properties are unexercised branches. Here it
  was "carries a year"; the same question applies to "has a matrix", "has a
  catalog number", "is a release rather than a master". Noticed: step 7, and
  named by the security review.

  **CONCURRENCY-HARNESS VARIANT: a fake `sleep` that ADVANCES THE SHARED CLOCK
  turns a concurrency test into a spread-over-time test — and the correct fix
  then reads as broken.**

  The security review found the Discogs limiter bypassable: `waitMs()` then
  `take()` is check-then-act, so 200 concurrent requests ran 200 in flight
  against a 60/minute bucket. The fix — an atomic `reserve()` — was correct and
  the test still reported 200.

  The harness was the reason. Its `sleep` did `now += ms`, so every waiting
  caller's wake-up moved the clock forward and REFILLED the bucket for the next
  one. It was modelling 200 requests spread over several minutes, which is a
  scenario the limiter should allow, rather than 200 arriving at once.

  Established by probing rather than reasoning: `reserve()` against a stable
  clock returns 60 free then 1000/2000/3000ms staggered; against a jumping
  clock it returns one identical 1000ms to everyone.

  **A sleep that resolves WITHOUT moving time is the honest model of
  concurrency**: every caller arrives in the same instant, which is the whole
  premise. Advancing the clock inside `sleep` is right for a test about
  elapsed-time behaviour and wrong for one about simultaneity, and the same
  helper cannot serve both.

  **The tell:** a concurrency test whose result does not change when the
  implementation's atomicity does. Before trusting either outcome, check
  whether the harness lets the callers actually overlap. Noticed: step 7,
  security unit 2.

  **A RELATED LIMIT, worth knowing rather than working around: SOME PROPERTIES
  RESIST AN INJECTED CLOCK, because they are ABOUT the real timer.**

  Every other property of the Discogs client is testable on an injected clock —
  refill arithmetic, retry counts, deadline accounting — which is why the clock
  is injected at all. The request timeout is not: the abort fires from
  `setTimeout`, the very thing a fake clock replaces, so a fake clock can never
  make it fire.

  The resolution was to inject the CEILING rather than the clock:
  `maxElapsedMs: 50` in the test against 10s in production, with a real timer
  doing real work for 50ms. Not a workaround so much as recognising which knob
  the property is actually attached to.

  **The general form: when a property cannot be tested on the standard
  substitute, ask what it is a property OF.** Usually the answer names a
  different injection point. Knowing which properties resist the house
  technique is more useful than the individual workaround, because the next one
  will resist it too.

  **PASSIVE-PATH VARIANT: when every test exercises the DELIBERATE path, the
  passive path is unconstrained — and the passive path is usually the common
  one.** Not a fixture problem: each test is individually well-built. The gap is
  in what the SET of them chose to do.

  Found in step 6 unit 4 (pressing prefill) by a mutation that failed nothing.
  The tests covered prefilling, editing a prefilled field, and the no-target
  case. All four passed with the "silently copied" mutation in place, which
  should have been impossible — so the question was not "is there anything to
  constrain" but "why can't these see it".

  The answer: **every test edited something.** The form builds a pressing from
  the form values, so an edited field always produces a new row and the
  mutation never changed the outcome. The uncovered case was the one a user
  actually performs most: check the prefilled details against the sleeve and
  save without touching them. Under the mutation that yields `pressing_id`
  null — fields visibly filled, save succeeds, pressing gone.

  **Why this shape recurs:** tests are written from the feature's description,
  and a description says what the feature DOES ("prefills the pressing
  section", "lets you edit it"). Accepting a default is not a feature, so
  nothing in the description prompts a test for it — while for the user it is
  the path of least effort and therefore the default behaviour.

  **The check:** for any screen with prefilled or default values, ask what
  happens if the user changes NOTHING and submits. Same for a filter left at its
  default, a toggle left unticked, a prefilled date accepted. If no test covers
  the do-nothing path, the most common flow is the untested one. Noticed: step 6
  unit 4, during the step 5+6 remediation.

  **THE LIMIT OF MUTATION TESTING, and it is a real one: mutation cannot see a
  SYSTEMATICALLY PERMISSIVE layer, because the existing fixtures are all cases
  that layer already rejects.**

  This build leans on mutation harder than on any other technique, so where it
  fails is worth stating plainly.

  Step 7 unit 5: removing the `/^\d+$/` check in front of
  `z.coerce.number()` failed ZERO tests. The obvious reading is "the check is
  redundant" — and NOTES already says not to conclude that, so I probed
  instead. Coercion accepts `'5e4'` as 50000 and `'0x50'` as 80, so the check
  was load-bearing and its removal silently fetched a different record.

  **Why mutation was blind to it.** Every id in the test set —
  `'not-a-master'`, `'-1'`, `'0'`, `'50683/../..'` — is a value coercion
  ALREADY rejects. The guard and the coercion agreed on all of them, so
  removing the guard changed nothing observable. The values that discriminate
  (`'5e4'`, `'0x50'`, `' 50683 '`) are the ones nobody writes down, precisely
  because they do not look like inputs a user would send.

  **The general shape:** mutation asks "does removing this change the output on
  the inputs I have?" It cannot ask "what inputs have I failed to imagine?" —
  and a permissive layer's whole nature is accepting inputs you did not
  imagine. Same structural blind spot as the fixture rule above, one level up:
  there the fixture could not discriminate two RULES, here it cannot
  discriminate two INPUT SETS.

  **What to do instead, when a mutation on a validation guard fails nothing:**
  enumerate what the layer underneath accepts, by execution, before concluding
  anything. Not "does removing this break a test" but "what does the thing I am
  guarding say yes to". Five minutes in `node -e` answered it here.

  **SEAM RULE — third instance, and the one to state as a rule: LAYER TESTS
  PROVE A LAYER, NEVER THE JOIN. When two correct layers must agree, the test
  that matters runs end to end through both, and neither side's suite can
  substitute for it.**

  Three instances now, all found by use rather than by tests:

  | Layer A | Layer B | What fell in the gap |
  |---|---|---|
  | normalizer (24 tests) | search route | raw payloads returned; every normalizer test still passed |
  | search endpoint (accepts 12 params) | lookup form (offers 7) | five §5.7 parameters unreachable; no endpoint test can see a form |
  | import writes `discogs_release_id` | ownership matches on it | the FORM path never sent it — §7.7 tier 1 unreachable for every record the user owned |

  **The third is the sharpest.** Both sides were correct and both were tested:
  every ownership test built pressings directly WITH an id, every import test
  asserted what was written. The defect existed only in the join, and the
  mutation that exposes it — never sending the id — failed ZERO tests before a
  seam test existed and three after.

  **Why layer tests cannot catch it, structurally.** A layer test supplies its
  own inputs. That is what makes it fast and precise, and it is exactly why it
  cannot tell you whether the real producer supplies those inputs — the fixture
  stands in for the other layer and always agrees with it. Two suites can be
  green, complete, and jointly silent.

  **The rule: for any property that requires two components to agree, write one
  test that goes through both.** `test/integration/import-then-own.test.ts` is
  the shape — real import in, real ownership query out, no fixture in between.
  It is slower and less precise than either layer's tests and that is the
  point: precision is what hides the seam.

  **The tell:** a property stated in the spec that no single module owns. §7.7's
  tier 1 is a claim about the importer AND the matcher; §5.7's twelve
  parameters are a claim about the endpoint AND the form. Whenever a
  requirement spans components, ask which test would fail if they stopped
  agreeing. Noticed: steps 7 units 4, the search-params QA finding, and the
  tier-1 QA finding.

  **WIRING VARIANT: a pure-function test proves the TRANSFORMATION, never that
  anything calls it.** Not a fixture problem at all — the fixtures are fine and
  the assertions are real. The gap is that a change bypassing the function
  entirely passes every one of its tests.

  Measured in step 7 unit 4. `normalize-search.test.ts` has 24 tests over real
  payloads: genres and styles kept separate, absence-prose mapped to null, the
  combined "Artist - Title" split. Making the route return the RAW Discogs
  payload instead of the normalized one:

  | Layer | Result |
  |---|---|
  | normalizer's own 24 tests | **all still pass** |
  | endpoint tests | **5 fail** |

  Nothing was wrong with the normalizer, so nothing testing the normalizer
  could notice. A user would see a record pressed in a country called
  "Unknown", with a green suite.

  **The rule: for any transformation that exists to protect the user from
  something, assert the property at the layer the USER reaches, not only where
  it is implemented.** The pure-function tests stay — they are where the
  behaviour is pinned down, and they discriminate far more finely than an
  endpoint test can. But at least one assertion per property belongs at the
  boundary, and it should be the property that matters rather than a smoke
  test: "styles survive", "absence is null", not "returns 200".

  **The tell:** a module whose tests all pass but which nothing imports. Same
  family as the extraction-with-one-importer check above — both are questions
  about whether the code is CONNECTED, which no test of the code itself can
  answer. Noticed: step 7, unit 4.

  **UNREACHABLE-PATH VARIANT — the tell above came true at full scale, and this
  is the extreme case of it: `POST /api/discogs/import` is not called by any UI
  code in the repository.**

  Found by QA (2026-08-11): imported records have no genres. `discogs-import.ts`
  implements §6's mapping correctly — `findOrCreateGenres(tx, [...styles,
  ...genres])`, styles first, with a comment citing CLAUDE.md §8 on not
  flattening the hierarchy — and its tests pass and genuinely prove genres
  attach.

  **They are honest tests of code nothing runs.** Every assertion is real, the
  fixtures are real, the transaction is real. What no test in that file can
  express is whether any caller exists. The lookup screen links to
  `/records/new?discogsReleaseId=`, which goes through `loadDiscogsPrefill` —
  a path that reads neither `genres` nor `styles`.

  **The rule, and it belongs beside the seam rule: passing tests establish that
  a unit WORKS, never that anything calls it.** "Do we implement §6's genre
  mapping?" answers yes from the test suite and no from the running app. Any
  audit that greps for an implementation and finds one with green tests will
  reach the wrong conclusion.

  **The cheap check, worth running when a feature is reported missing despite
  being implemented:** grep for callers of the module OUTSIDE its own tests. One
  command, and it distinguishes "broken" from "never invoked" — which are
  different bugs with different fixes.

  Compounding factor worth noting: the two paths were not merely duplicates. The
  live one has format matching, the master-year fallback and the cover fetch;
  the dead one has genres and styles. Each was correct about different fields,
  so neither could be deleted in favour of the other without measuring first —
  and a field-by-field comparison was the only way to see it.

  **SELF-MATCHING VARIANT: a checker that scans the repo can end up inside its
  own subject set, and it fails on its own matchers rather than on real code.**
  The cross-spec variant one level up: the shared state is the REPOSITORY.

  `test/repo/dotenv-quiet.test.ts` asserts that every tracked file calling
  dotenv's `config()` passes `quiet: true`, finding those files by search. Its
  own source contains the strings `dotenv` and `config(` — inside the regexes
  doing the matching — so once it was committed and `git ls-files` could see
  it, it matched itself and failed against the bare `config()` in its own
  matcher.

  **It passed alone and failed in the full suite**, which is the tell, and the
  timing is the trap: the file is invisible to `git ls-files` until the commit,
  so the defect appears one commit AFTER the code that causes it. Verified by
  running the file in isolation (green) and the suite (red).

  **The rules for any repo-scanning check:** exclude the checker from its own
  subject list explicitly, by path, with a comment saying why — and keep the
  vacuity guard, because an exclusion that silently over-matches turns the
  whole assertion into a loop over nothing. Both are in place there. Noticed:
  step 7, unit 1.

  **VARIANT: sometimes no value on that axis CAN discriminate, and the fix is a
  different axis rather than a better fixture.** The five cases above are all
  repaired by adding inverting rows. This one cannot be.

  `formatPrice` keeps money as a string so it never routes through a float, and
  the test asserted that with `'12345678.91'` — "a value beyond float
  precision". It is not: `NUMERIC(10,2)` allows at most 8 digits before the
  decimal, which is comfortably inside a double, so **no value the column can
  hold** produces a different answer from `Number(v).toFixed(2)`. Enumerating
  the candidates is what established that; the test looked rigorous and
  constrained nothing.

  The discriminator was on another axis entirely — ROUNDING, not magnitude.
  `'8.567'` truncates to `8.56` and rounds to `8.57`. That value is not even
  storable in the column; it can arrive from an unsaved form field, which is
  precisely why the helper must not round.

  **The check when a fixture resists repair:** before concluding the property
  is untestable, ask what OTHER observable difference the two implementations
  have. "Same output for every legal input" means the axis is wrong, not that
  the behaviour is unconstrainable. Noticed: step 5, unit 6.

- **RULE: "same family" is a hypothesis, not a diagnosis. Measure which
  component DOMINATES before choosing a fix.**

  Two failures can share a shape exactly and need opposite responses. Fixing
  the shape fixes neither.

  The instance, both found in step 5 unit 7b and describable in the same
  sentence — *"a click acts on state the server has not caught up with"*:

  | | Collection filters | `/manage` genre move (Mode 2) |
  |---|---|---|
  | Trigger | `router.push` | `router.refresh` |
  | What is stale | URL, props AND `useSearchParams` | rendered props |
  | Dominant cost | the server render | **the PATCH (1264ms vs 142ms)** |
  | Consequence | wrong href built → a filter is silently DROPPED | assertion runs early |
  | Nature | **product bug** — a user hits it | **test bug** — the app is correct |
  | Fix | hold the last-pushed query and build from it | wait for the response |

  Described in prose they are the same problem. Measured, they are not related
  at all: one needs application code, the other needs one line in a spec. Four
  earlier attempts on Mode 2 failed because the diagnosis named the 142ms
  component and the 1264ms component was doing the work.

  **The check:** before adopting a fix because a failure "looks like" one
  already understood, measure the components and confirm the same one dominates.
  A shared description is a reason to look, not a reason to conclude. This
  compounds badly with the "a mutation is code and can be wrong" rule: an
  inherited diagnosis is never re-derived, so a wrong emphasis survives every
  subsequent attempt. Noticed: step 5, unit 7b.

- **RULE: Zod's coercion layer is SYSTEMATICALLY PERMISSIVE at trust
  boundaries. Four instances is a class, not a run.**

  **The standing rule: no `.coerce` appears in a boundary schema without an
  explicit FORMAT CHECK in front of it.** Not "be careful with coercion" —
  coercion's job is to say yes to things that resemble the target type, and a
  trust boundary's job is to say no to everything it was not promised. Those
  are opposite jobs, so the format check is not belt-and-braces, it is the
  actual validation and the coercion is only the conversion.

  Four instances, all in this build, all invisible to every downstream test —
  because each produced a *valid-looking* value rather than an error:

  | Modifier | Input | Becomes | Consequence |
  |---|---|---|---|
  | `.default([])` on `genreIds` | absent | `[]` | "leave alone" becomes "REMOVE ALL" — silent data loss on PATCH |
  | `z.coerce.number()` on `yearFrom` | `''` | `0` | applies `release_year >= 0`, drops every undated record behind a 200 |
  | `z.coerce.boolean()` on `includeUndated` | `'false'` | `true` | the flag cannot be turned off; every non-empty string is true |
  | `z.coerce.number()` on a Discogs master id | `'0x50'` | `80` | fetches a DIFFERENT master's versions and presents them as the answer |

  The fourth adds a dimension the first three did not have: **the coerced value
  left our process.** `"5e4"` becomes 50000 and `"0x50"` becomes 80 — both
  accepted, both interpolated into a URL, both returning real data for the
  wrong record. Probed rather than assumed, after a mutation removing the
  format check failed nothing:

  ```
  z.coerce.number().int().positive()
    '50683'  → 50683      ' 50683 ' → 50683
    '5e4'    → 50000      '0x50'    → 80        '50683\n' → 50683
  ```

  **Why they are hard to catch.** A validation bug that REJECTS is loud — a 400
  arrives and someone investigates. All four ACCEPT, and produce a plausible
  value, so the endpoint returns 200 with the wrong rows. Nothing downstream
  can tell: the query layer received a legitimate number, the handler received a
  legitimate array. The defect exists entirely in the gap between what the
  caller wrote and what the schema decided they meant.

  **Nor will a mutation necessarily catch it.** Removing the digit check in
  front of `z.coerce.number()` failed ZERO tests, because the existing tests
  only sent ids that coercion rejects anyway (`'not-a-master'`, `'-1'`). The
  test set has to contain values coercion ACCEPTS but the format forbids, and
  those are not the values anyone thinks to write down.

  **The rule.** In a boundary schema, prefer an explicit shape that cannot
  reinterpret:

  - a boolean flag is `z.enum(['true','false']).transform(v => v === 'true')`,
    never `z.coerce.boolean()`;
  - a numeric param validates its STRING form first
    (`.refine(v => /^-?\d+$/.test(v))`) and only then transforms — coercing
    first is what destroys the absent/blank distinction;
  - `.optional()` preserves absent-vs-empty; `.default()` destroys it. If
    absence and emptiness mean different things — and for a nested array they
    always do — `.default()` is wrong.

  **The test that catches this class** is not "does a valid value work" but
  "does an EMPTY or MALFORMED value get rejected rather than reinterpreted".
  Every filter now has one; `yearTo=` was found only because the empty-string
  case was tested for each param separately rather than once. Noticed across
  steps 4–5; stated as a class during the step 5 UI work.

- **DIAGNOSED: the E2E flake was WebKit outrunning React hydration. Here is
  everything that was ruled out, so the next investigation does not repeat it.**

  Symptom: `[mobile]` specs failing 2-4 times per full suite run, passing in
  isolation, across `collection-filters` and `record-form`. It survived four
  rounds of investigation across three units before being diagnosed.

  **What it is NOT.** Each ruled out by measurement, not reasoning:

  | Hypothesis | Result |
  |---|---|
  | Cross-project contention | mobile alone still fails; chromium alone clean |
  | Viewport width | desktop engine at 390px is clean |
  | Touch / mobile emulation | `hasTouch: false, isMobile: false` still fails |
  | Device scale factor | scale 3 on Chromium is clean |
  | Worker concurrency | `workers: 1` still fails |
  | Elapsed time / slowness | a 15s timeout did not help |
  | Fixture accumulation | fixed the /manage specs, not these |
  | Fast Refresh / dev server | a production build left the rate unchanged |

  **What it IS.** `devices['iPhone 13']` has `defaultBrowserType: 'webkit'`, and
  **Desktop Safari fails identically at full size with no mobile emulation** —
  so the device profile was never relevant, only the engine.

  WebKit reaches the DOM appreciably before React hydrates. A `fill()` landing
  in that window sets the input's value while React's state never receives it,
  and the field submits as `undefined`. Captured rather than inferred:

  ```
  title value after fill: T wmsj3tgyv        <- the DOM has it
  POST 400 {"title":"expected string, received undefined"}   <- React did not
  ```

  `selectOption` survives because a select is re-read at submit; only typed
  text is lost.

  **The mitigation:** `RecordForm` and `CollectionFilters` set `data-hydrated`
  from an effect and the specs wait on it. Waiting for a RENDERED CONTROL does
  not work — the controls are server-rendered, so their presence proves the
  markup arrived rather than that handlers are attached, which is precisely the
  failing state. Full suite went from 2-4 failures every run to 4 of 5 runs
  completely clean.

  **If this recurs**, the first question is whether the failing interaction is
  typed text on WebKit, and the second is whether the spec waits on
  `data-hydrated`. Do not re-run the table above. Noticed and diagnosed across
  steps 4-5; resolved during step 5's final unit.

- **KNOWN PROPERTY, not a defect: there is a window where the DOM and React
  state can diverge.** It is the mechanism behind the flake above, stated
  separately because it outlives that test problem.

  Between server-rendered markup arriving and React hydrating, an input can be
  given a value that React's state never sees. A subsequent submit reads state,
  not the DOM, so the field is absent from the payload.

  **Harmless for a human** — nobody types faster than hydration, and the window
  is milliseconds. **Real for anything automated**: a browser extension
  autofilling a form, a password manager, an accessibility tool, or any future
  integration driving the UI can hit it, and the failure is silent (a field
  simply missing) rather than an error.

  Not worth fixing now: the app is single-user, manually driven, and the
  mitigation for the test harness is in place. Recorded so that a future
  autofill bug report is diagnosed in minutes rather than rediscovered.
  Noticed: step 5, E2E flake work.

- **OPEN, ~1 run in 5: `collection-filters.spec.ts` fails a spec on BOTH
  projects. Which spec varies between runs.**

  **THE DIAGNOSTIC, first because it is the useful part: a MOVING failure is
  the flake; a FIXED failure is a regression.** If `collection-filters` fails,
  run that file two or three more times on the same build. A change that broke
  something fails the same spec every time; this fails a different one, or
  none. Ten seconds, and it settles the question without an investigation.

  Corollary, learned the hard way in unit 5: **do not baseline by stashing and
  running once.** A single clean baseline run is indistinguishable from the
  flake not firing, and it will tell you your change caused the failure. Run
  the CURRENT build several times instead — the stale-baseline rule, in
  miniature.

  Its signature differs from the WebKit hydration flake above, so it is
  deliberately not treated as the same problem — "same family" is a hypothesis
  (see the rule below), and bundling them is what let the /manage flake survive
  four attempts.

  **Signature, for whoever picks it up:**
  - specs seen failing, one at a time and not the same one twice running:
    `a parent-genre chip finds a record tagged with its grandchild`,
    `clicking the active chip clears it`, and
    `clicking through to a filtered view equals loading that URL directly`;
  - fails on **chromium AND mobile**, unlike the hydration flake which was
    WebKit-only;
  - roughly 1 run in 5, in a full suite AND in isolation. An earlier version of
    this entry said "never in isolation"; that was wrong — unit 5 reproduced it
    running the file alone;
  - present with `data-hydrated` waits already in place, so it is not that
    mechanism.

  **Measured in the step 5+6 remediation, unit 5:** a full-suite run failed two
  specs; an immediate isolated run of the file passed those two and failed a
  third; three further runs on the same build gave 10 passed / 1 failed / 10
  passed. So it is a property of the FILE — most likely its fixtures or its
  shared filter state — not of any spec in it.

  Left undiagnosed deliberately: at 1 in 5 any measurement is mostly noise, and
  the suite is currently clean enough that a real regression would still stand
  out. **If the rate climbs or it spreads to other specs, it needs its own
  investigation** — starting with measurement, not with the assumption that it
  is the hydration issue returning. Noticed: step 5, final unit.

- **RULE: a measurement compared against a baseline taken on DIFFERENT CODE
  overstates the change, and the error always flatters the change.**

  The step 5 flake work produced two measurements of the same thing:

  | Wait signal | Submissions lost | Taken on |
  |---|---|---|
  | rendered control | 6 of 8 | the build BEFORE unit 9b |
  | rendered control | 1 of 12 | the build AFTER unit 9b |
  | `data-hydrated` | 0 of 12 | the same build |

  Reporting "6 of 8 → 0 of 12" would have been arithmetic on two different
  programs. Unit 9b added an inline-create button that renders LATER in the
  tree than the old wait signal, so the control arm had silently become a
  longer wait — the earlier "fix" was waiting longer rather than waiting
  correctly, and the difference the new signal actually makes is 1 in 12, not
  6 in 8.

  **Why the error is never neutral:** a stale baseline was measured before the
  intervening work, and intervening work is usually improvement. So the "before"
  is worse than the true control, and every comparison against it flatters
  whatever came next. Nobody re-measures a baseline that already tells a good
  story.

  **The rule:** when a fix is verified by comparison, run BOTH ARMS on the
  CURRENT build. A baseline is a property of a build, not a number you can
  carry forward — and the moment any other change lands, the old number is
  measuring something that no longer exists. Noticed: step 5, E2E flake work.

- **PATTERN, for a decision at step 14: SPEC.md §4 states ranges in prose that
  nothing below the API boundary enforces.** Two instances so far — the year
  bound (step 5) and `want_list.priority` (step 6) — and the second was found
  the same way as the first, by checking `pg_constraint` rather than trusting
  the column definition. They differ in a way that matters: the year bound has
  a stated reason to stay API-only, and priority does not.

  | Column | §4 says | Enforced by |
  |---|---|---|
  | `artists.formed_year` | `1877 <= year <= currentYear + 1` (§4.1, with reasoning) | API only |
  | `records.release_year` | same bound (§4.2, added later) | API only |
  | `pressings.year_pressed` | same bound (§4.2, added later) | API only |
  | `want_list.priority` | "1 = highest, 5 = lowest" (§4.2) | API only |
  | `want_list.is_acquired` + `acquired_record_id` | §7.3 makes them one fact | nothing |

  The last row is a different SHAPE from the other four and was found by the
  step 5+6 adversarial review. The others bound a scalar; this one is a
  two-column invariant: `is_acquired = true` with `acquired_record_id` NULL is
  storable, and it means "acquired, but we lost what you acquired" — §7.3's
  acquisition history with the history missing. The acquire transaction always
  sets both, so nothing produces it today. A `CHECK (NOT is_acquired OR
  acquired_record_id IS NOT NULL)` costs nothing and, unlike the year bound, has
  no moving upper bound to argue about. Decide it with the rest at step 14.

  §4.1 is explicit that the year bound is "not a database constraint: it is a
  product judgement, and the upper bound moves" — which is a real reason, since
  a CHECK on `currentYear + 1` would need a migration every January. **Priority
  has no such excuse**: 1–5 is fixed, and a CHECK would cost nothing.

  **Why it matters beyond tidiness.** The API is the only writer today, so the
  bounds hold. That stops being true the moment anything writes directly — a
  migration backfill, a repair script, a future import path, or the Discogs
  import in step 7, which maps external data onto these columns. A prose range
  with no constraint is a rule that holds by convention, and convention is what
  the schema exists to replace.

  **The decision to make at step 14** is a class decision, not case by case:
  which §4 ranges become CHECK constraints, and which are explicitly
  API-only-with-a-reason like the year bound. Writing that down is most of the
  work; the migration is small. Do NOT fix these piecemeal in the meantime —
  a half-applied convention is worse than a consistent one. Noticed: step 5
  (years), step 6 unit 1 (priority).

- **DEFERRED — the unconstrained acquired state has a UI DEAD-END, and the two
  compound.** Recorded separately from the CHECK-constraint decision above
  because it needs a different fix, in a different file, and would survive that
  constraint being declined.

  `WantListRow` renders the "Acquired" badge and hides "Mark acquired" whenever
  `is_acquired` is true. The "View record" link is guarded on
  `acquiredRecordId !== null` — **so in exactly the unconstrained state, the row
  shows that something was acquired and offers no way to reach it.** Not
  reacquirable, not linked, delete or nothing.

  One correction to how this was reported to me: the link is not absent, it is
  conditional. That distinction is the whole point — the UI degrades precisely
  where the schema stops holding, so neither problem is visible until they meet.
  Either fix alone closes it: the CHECK makes the state unreachable, or the row
  treats a NULL `acquiredRecordId` as a repairable state rather than rendering a
  dead end. Prefer the CHECK; §4 is where invariants belong. Noticed: step 5+6
  adversarial review.

- **STANDING EXPECTATION: when a handler pre-checks a condition its transaction
  also guards, the failure test goes against the QUERY-LAYER PRIMITIVE from the
  start.** Not after a mutation reveals the gap — from the start.

  Three consecutive units in step 6 hit this, and it will recur on every
  transactional endpoint ahead:

  | Unit | Pre-check in the handler | Guard it masked |
  |---|---|---|
  | 1, `POST /api/want-list` | `missingIds` rejects a bad genre | the create transaction |
  | 2, `PATCH /api/want-list/:id` | same | the update transaction |
  | 3, acquire | `item.isAcquired` refuses a repeat | `is_acquired = false` on the UPDATE |

  In every case **removing the guard failed no endpoint test**, because the
  pre-check rejects the input before the guarded code is reached. The endpoint
  suite is green and proves nothing about the property.

  **Why the guard is still load-bearing.** A pre-check and a transaction close
  different windows. The pre-check handles bad INPUT; the transaction handles
  what changes BETWEEN the check and the write. Unit 3's is the clearest: two
  concurrent acquires both read `is_acquired = false`, both pass the pre-check,
  and without the `WHERE is_acquired = false` on the UPDATE the second
  overwrites `acquired_record_id` — orphaning the first record and losing an
  acquisition that happened. The pre-check cannot close that by construction.

  **So both layers are real** (NOTES case 3, masked-by-a-different-mechanism),
  and the primitive is the only place the guard is observable. Writing the test
  there costs nothing extra when done first, and is easy to skip when the
  endpoint suite already looks complete.

  **The tell:** a handler that validates something, then calls a query function
  that validates the same thing again. That second check is not redundant — it
  is the concurrent case — and it needs its own test at the layer where it
  lives. Noticed: step 6, units 1-3.

- **RULE: a mock that intercepts EVERY call disables the function; a mock that
  intercepts only the FIRST simulates the race.**

  Race tests here hook a pre-check so a concurrent write appears to land in the
  window between check and insert. The natural way to write that is:

  ```ts
  vi.spyOn(queries, 'findLabelByName').mockImplementation(async () => {
    await db.execute(sql`INSERT INTO labels (name) VALUES ('Dischord')`);
    return undefined;              // "no such row" — the race window
  });
  ```

  That works only while the handler calls the function ONCE. The moment the
  recovery path calls it again — which §5.4's `existingId` made it do, to name
  the winner — the mock answers "no such row" a second time, the handler
  concludes something impossible has happened, and the test sees a 500 instead
  of the 409 it asserts.

  **Five existing race tests had this shape and broke together**, and the new
  test written in the same unit had it too. They were not wrong when written:
  the mock matched the code as it then was, and only became a lie when the
  function acquired a second caller.

  **The fix** is to hook the first call and fall through afterwards:

  ```ts
  const real = queries.findLabelByName;
  let firstCall = true;
  vi.spyOn(queries, 'findLabelByName').mockImplementation(async (name) => {
    if (!firstCall) return real(name);
    firstCall = false;
    await db.execute(sql`INSERT INTO labels (name) VALUES ('Dischord')`);
    return undefined;
  });
  ```

  **Why it belongs with the fixture rules:** it is the assumed-precondition
  pattern in mock form. The fixture assumes something about the data; this
  assumes something about the CALL COUNT of the code under test — and neither
  assumption is stated, checked, or visible when reading the test. The tell is
  identical: the test looks correct and passes, right up until the thing it
  silently assumed stops being true.

  Expect it on every recovery path: a catch that has to identify what it
  collided with will re-read, and any mock covering that read has to let the
  second call through. Noticed: step 5, unit 9b.

  **THIRD INSTANCE — a mock answering EVERY PATH IDENTICALLY cannot
  distinguish code that calls one path from code that calls both** (step 7,
  unit 8c). The family so far:

  | Mock shape | What it could not see |
  |---|---|
  | intercepts every CALL rather than the first | the recovery path's second read |
  | returns `undefined` from the name finder | that the finder was reached at all |
  | answers every PATH with one fixture | which endpoints were actually called |

  The versions endpoint fetches two things: the versions list, and the master
  for the artist name. My mock returned the versions fixture for both, so the
  master lookup yielded no artist — and §7.7's tiers 2 and 3 match on artist,
  so every unowned row would have come back badgeless **with the tests
  agreeing**. The mock made the endpoint look correct while removing the data
  half its logic depends on.

  **The rule for a multi-call mock: branch on the path and assert the branches
  were taken.** If a mock ignores its arguments, it is asserting that the
  arguments do not matter — which is a claim about the code under test, and
  usually a false one.

  **The unifying shape across all three:** a mock is a MODEL of the dependency,
  and every simplification is an assumption. Call count, return shape, path
  discrimination — each one silently states "this does not matter here", and
  the test cannot tell you when the statement stops being true.

- **RULE: a message-less `.toThrow()` asserts only that SOMETHING failed.**
  Six instances have now accepted a different exception than intended, and the
  sixth was in the guard built to prevent the fifth.

  **Swept the whole suite (step 5 remediation): 91 occurrences, 13 files.**

  | Form | Count | Risk |
  |---|---|---|
  | `.not.toThrow()` | 11 | none by construction |
  | `toThrow(<matcher>)` | 8 | constrained |
  | bare `toThrow()` positive | 49 | the at-risk set |

  The 49 were **tested, not rewritten**, by asking of each: *if the intended
  failure were impossible, would something else still throw and satisfy it?*

  **30 database-constraint assertions came back sound in substance.** Each was
  probed for the error it actually catches, and every one is the intended
  SQLSTATE — 23514 for the `price_history` XOR, 23505 duplicate, 23503 foreign
  key, 23001 append-only trigger. Control cases confirm valid input SUCCEEDS, so
  the throw comes from the constraint under test and not from setup. Left as-is
  deliberately: Drizzle wraps everything as `Failed query: …`, so a message
  matcher is near useless. **If they are ever tightened, the matcher is
  `error.cause.code`, not the message** — that is where the SQLSTATE lives.

  **Two real findings:**

  1. **The sixth instance** — the `catch` around pg-connection-string's `parse()`
     in `resolveConnectionHost` failed NOTHING when removed. Probed rather than
     assumed dead: `parse()` genuinely throws on `postgresql://[`,
     `postgresql://%` and a non-numeric port, all of which pass the scheme check
     first. So it was LIVE BUT UNCONSTRAINED (case 2 below), not dead. Four
     tests now reach it and assert the parse message specifically.

  2. **A test whose NAME asserted what its assertion did not check.**
     `expect(() => resolveConnectionHost('mysql://user:pass@localhost:3306/db')).toThrow()`
     sat in a test called "rejects a non-postgres scheme" — but that URL's host
     is `localhost`, which the host allowlist ACCEPTS. The scheme check was the
     only thing rejecting it, and a bare `.toThrow()` would have passed if the
     rejection came from anywhere else. This is the cleanest illustration of the
     whole pattern: the name carries a claim the assertion never makes.

  **The shape to watch for:** a test that manipulates environment or input to
  reach a code path can be defeated by a DIFFERENT guard reading the same input.
  The hollow Neon test is the worst case — see the Neon entry below.
  Swept: step 5 remediation.

  **WORSE STILL, and the one to remember: A TEST THAT MANUFACTURED FALSE
  CONFIDENCE ABOUT THE EXACT PROPERTY IT NAMED.**

  A repo test asserted that `client.ts` contains the string `guardedFetch`,
  under the name "is wired into the shared client, not merely available". It
  passed. The name existed — and covered ONE OF TWO construction paths:
  `getDiscogsClient` wrapped its fetch, `createDiscogsClient` did not, so any
  caller passing `globalThis.fetch` reached Discogs for real.

  **The test written to prove the guard was what stopped anyone checking whether
  the guard was complete.** Its green tick answered "is the guard wired in?"
  with evidence about a NAME, and the question was never asked again. The hole
  was found only when a DIFFERENT test — replacing another file-text assertion
  with a behavioural one — resolved with a genuine 36-field Discogs payload.

  **Why this is worse than the config-text case below.** That one asserted a
  fact about a file and inferred behaviour. This one asserted a fact about the
  IMPLEMENTATION and inferred completeness — a stronger claim, from weaker
  evidence, about the property the test was named for. A grep can tell you a
  mechanism exists. It cannot tell you the mechanism has no exceptions, and a
  guard's entire value is in having none.

  **The rule: never assert a guard by searching for it. Exercise the paths it
  must cover, including the one you think nobody uses.** Both replacements do:
  one drives `createDiscogsClient` with the real `fetch` and expects a refusal,
  the other drives it with an injected `fetch` and expects success, so the
  guard is pinned in both directions.

  **The tell: a test whose assertion is `toMatch` on source code.** If the
  answer to "what would have to be true for this to pass while the property is
  false" is "a name in the wrong place", it is not a test of the property.
  Noticed: step 7, security unit 5.

  **SAME CLASS, WORST FORM YET: asserting a CONFIG FILE'S TEXT rather than the
  running system's BEHAVIOUR.** The test passed for the entire period the thing
  it named was inert.

  A repo test asserted that `playwright.config.ts` starts the dev server with
  `NODE_ENV=test`. It does — and Next FORCES `NODE_ENV` to "development" for
  `next dev`, discarding it. So the config line was present, the test was
  green, and the guard keyed off that variable never applied to a single E2E
  run. Two live calls reached api.discogs.com underneath it.

  **Why it is worse than the other two in this entry.** A message-less
  `.toThrow()` at least observes the code under test; it just cannot tell which
  failure. This observes a FILE, and infers behaviour from it. The inference was
  wrong in a way no amount of reading either the config or the guard would have
  revealed — only running the system and asking what it saw.

  Replaced with a Playwright spec that drives a real endpoint and asserts the
  call is refused, mutation-verified: disabling the guard fails 2 of its 3
  specs. Cost: an extra E2E spec. Value: the assertion is about the thing whose
  behaviour matters.

  **The tell: a test whose subject is a file path.** `readFileSync` in a test
  is not automatically wrong — the dotenv and migration checks legitimately
  assert repository FACTS — but the moment the assertion is a proxy for
  "therefore the system behaves like X", it has stopped testing X. Ask what
  would have to be true at RUNTIME, and whether anything checks it. Noticed:
  step 7, the no-live-calls guard.

  **SAME CLASS, DIFFERENT MATCHER: `toEqual` cannot catch an explicit
  `undefined` where a key should be absent.** Verified rather than assumed:

  ```
  expect({ q: 'x', genreId: undefined }).toEqual({ q: 'x'})        // PASSES
  expect({ q: 'x', genreId: undefined }).toStrictEqual({ q: 'x' }) // fails
  ```

  Found in `withFacet` (step 5, unit 7a), where clearing a filter must DELETE
  the key rather than assign `undefined`. Replacing the delete with an
  assignment failed no test, and a comment in the source asserted that `toEqual`
  would have caught it — wrong, and wrong in the confident direction.

  It belongs in this entry because it is the same defect shape as a bare
  `.toThrow()`: **an assertion that appears to constrain a property it cannot
  express.** `.toThrow()` cannot distinguish which error; `toEqual` cannot
  distinguish absent from undefined. In both cases the test reads as though it
  checks the thing and does not.

  Compounding it here: `toQueryString` skips `undefined` too, so the serialised
  URL is identical either way. TWO layers each blind to the difference, which is
  why the mutation came back clean. The fix was a `toStrictEqual` test on the
  state object plus an `Object.keys` assertion.

  **Worth a sweep of `toEqual` on object shapes**, the same way `.toThrow()` was
  swept — every place a test asserts a whole object and an extra undefined key
  would slip through. NOT done yet; recorded so it is not lost. Noticed: step 5,
  unit 7a.

- **RULE: some defects cannot be expressed as a failing assertion, and the
  honest move is to say so in the test rather than write one that looks like it
  covers them.** A hang is the clearest case.

  Step 7 unit 1's Discogs client retries a 429 a bounded number of times.
  Removing the bound does NOT fail its test — it kills the vitest worker
  ("Worker exited unexpectedly"). The loop spins on an injected `sleep` that
  resolves immediately, so it never yields: `testTimeout` cannot fire, no
  assertion is reached, and the harness exhausts memory first. The run reports
  no counts at all.

  **Two attempts to convert that into a clean failure both failed, each for a
  reason worth knowing:**

  | Attempt | Why it did not work |
  |---|---|
  | mock throws after a call ceiling | the client catches every `fetch` rejection as a network error and RETRIES — the escape hatch fed the loop it was meant to break |
  | mock returns a non-retryable status after a ceiling | the worker dies before reaching the ceiling; the retry counter is not what runs out first |

  Abandoned there per CLAUDE.md §9 rather than attempting a third.

  **RESOLVED, and the resolution is the transferable part: the gap was closed
  by adding a SECOND bound of a different kind, not by a third attempt at the
  test.** A total elapsed-time deadline (`MAX_ELAPSED_MS`) now sits alongside
  the attempt count. With it, removing the attempt bound FAILS the test rather
  than crashing the worker — the runaway loop terminates on time, so the
  assertion is reached and reports.

  **Two bounds, and each makes the other testable.** Neither alone is enough:
  the attempt count catches a fast retry storm, the deadline catches a slow one
  — including a hostile or mistaken `Retry-After: 3600`, which a count-based
  limit would obey to the letter. Both are mutation-verified, including the
  plausible mistake of checking the deadline AFTER sleeping rather than before,
  which fails 2 because the sleep has already spent the budget being protected.

  **Why the deadline was the right instrument** — it matches the actual
  production risk. An unbounded retry in a vitest worker is an OOM; in a
  serverless function it is a WEDGED REQUEST holding execution time until the
  platform kills it, with the user watching a spinner. So the useful guarantee
  is "this returns within ten seconds either way", not "this makes at most four
  attempts". A lint rule against unbounded loops was the other candidate and
  was rejected: it would fight the `for (;;)` retry idiom and constrain the
  shape of the code rather than the risk.

  **SECOND INSTANCE, and it means the OPPOSITE — read the crash before
  concluding anything from it.**

  Step 8 unit 4: removing `readCapped`'s streaming size cap (`arrayBuffer()`
  instead) also killed the worker, `FATAL ERROR: ... heap out of memory`, no
  counts reported. Same symptom, same absence of a red assertion. The
  interpretation is inverted:

  | | Step 7, retry bound | Step 8, size cap |
  |---|---|---|
  | Crash is | **the defect** — the test never reached its assertion, so the bound was UNVERIFIED | **the consequence** — the mutated code did the harmful thing, loudly |
  | Evidence value | none; the gap stayed open | stronger than a failed assertion |
  | Action | add a second bound of a different kind | none; the cap is verified by other tests too |

  **The distinguishing question: does the CRASH itself demonstrate the harm the
  code prevents?** Buffering an unbounded stream IS the production failure —
  the process dying is the property under test, arriving in person. An
  unbounded retry loop spinning on an immediate `sleep` is an artefact of the
  test harness's fake clock, not what production does.

  **The rule: a mutation that crashes is not automatically a bad mutation, and
  not automatically a good one.** Ask whether the crash is the behaviour being
  prevented. If yes, record it as evidence and keep an ordinary assertion
  alongside it (here, `cancelled === true`, which fails cleanly). If no, the
  mutation proved nothing and the gap is still open.

  **The general rules, both still standing:**

  1. When a mutation produces a CRASH rather than a failure, the test does not
     cover it. Say so, in terms of what it does and does not constrain — a
     stated gap is a smaller problem than a false claim of coverage.
  2. **Before concluding a property is untestable, ask whether a DIFFERENT
     guarantee would make it testable.** The same move as the `formatPrice`
     variant above, where the discriminator was on another axis: here the
     answer was not a cleverer harness but a second bound the code was arguably
     missing anyway. A property that resists testing is sometimes telling you
     the code is underspecified. Noticed and closed: step 7, unit 1.

- **RULE: this toolchain reports ABSENCE as SUCCESS in at least three distinct
  ways. A green result can mean "nothing ran", not "nothing broke".**

  Three instances, three different mechanisms, all in this build:

  | What was absent | How it appeared | Found by |
  |---|---|---|
  | A test file that could not be imported | `Tests no tests`, after `Test Files 1 failed` | reading past the summary line |
  | A whole file's worth of skipped tests | a `console.warn` at module scope, swallowed | investigating something else |
  | A test that never reached Neon | a passing `.rejects.toThrow()` catching the wrong error | probing what the error actually was |

  **The third one is the reason this entry exists**: the hollow Neon test
  reported green for weeks while never contacting the database it existed to
  verify. The other two are cheaper but the same shape.

  **The first is the newest** (step 6, unit 2). A `ReferenceError` thrown while
  IMPORTING a test file — `uuid is not defined`, left by an incomplete deletion
  — surfaces in the summary as `Tests no tests`. There is a `Failed Suites 1`
  section above it with the stack trace, but the line most readers scan for a
  verdict says the tests did not run rather than that they failed. A run that
  collects zero tests from a file that had thirteen is a failure; it reads as a
  skip.

  **The common shape: the absence of a signal is being rendered in the same
  visual register as a positive result.** Vitest's summary, a swallowed warn,
  and a satisfied assertion all look like the thing worked.

  **The rule: for any check that matters, know its POSITIVE count and assert
  it.** Not "did the suite pass" but "did the number of tests that ran match
  what should have run". This is why the Neon gate reports "9 passed" rather
  than "green", why `test/repo/neon-gate.test.ts` fails BY NAME when the branch
  is unconfigured, and why CURRENT POSITION carries counts rather than ticks. A
  count can be wrong in a way a tick cannot. Noticed across steps 4-6.

  **FOURTH INSTANCE, and the first originating OUTSIDE this system: Discogs
  encodes absence as PROSE.** Every entry above is our own tooling reporting
  nothing-happened as nothing-broke. This one arrives over the network from a
  third party, which makes it a different problem: no amount of discipline in
  our own code prevents it, and it is invisible until someone reads real
  payloads.

  Real values from the captured search fixtures (step 7, unit 3):

  | Field | Discogs sends | Passed through, it means |
  |---|---|---|
  | `country` | `"Unknown"` | pressed in a country called Unknown |
  | `catno` | `"none"` | catalog number "none" |
  | `label` | `["Not On Label"]` | released by a label called Not On Label |

  **These are worse than nulls, because they look ENTERED.** A blank country
  reads as "we don't know"; the string "Unknown" reads as a fact somebody
  recorded, and it will sort, filter and display as one. §5.7 already says
  Discogs data is user-submitted and imperfect — this is the concrete form that
  takes, and it fabricates data rather than omitting it.

  **No hand-written fixture would have contained them**, which is the argument
  for captured fixtures in one line. I would have written `country: null` for a
  missing country, because that is what a sane API does.

  **THE INVERSE, and it is the same error wearing the other face: a value that
  is PRESENT and means something else.** Absence-prose fabricates data where
  there was none; this misfiles data that exists.

  Discogs' format `text` field carries whatever a contributor wrote about that
  pressing's physical form. On release 381756 it is `"Gatefold"`; on the
  no-matrix fixture it is `"Blue/Green"`. Same field, same type, and one is a
  sleeve fact while the other is the vinyl colour §4.2 asks for.

  Read unconditionally into `color_variant`, every gatefold record in the
  collection acquires a colour of "Gatefold" — wrong in the confident
  direction, exactly like `country: "Unknown"`, and for the same reason: it
  looks entered, so nobody questions it.

  **The rule: when an external field is a free-text catch-all, require positive
  evidence before mapping it to a typed column.** The colour mapping now needs
  a colour word to appear. Conservative on purpose — a missed colour is a blank
  the user fills in, a wrong one is data they have to notice is wrong first.

  **SAME SOURCE, DIFFERENT SHAPE PER ENDPOINT — and the mismatch is silent.**
  Discogs sends the same information in different shapes depending on which
  endpoint answered, and nothing announces the change:

  | Field | Search results | Master versions |
  |---|---|---|
  | format descriptors | ARRAY `["Vinyl","LP","Reissue"]` | STRING `"LP, Album, Reissue"` |
  | year | `year` | `released` |
  | genres / styles | `genre` / `style` (singular) | — |
  | community counts | `community.have` | `stats.community.in_collection` |

  **The consequence is worse than a missing field.** Treating the version
  string as an array yields ONE descriptor that matches nothing, so
  `isReissue` is false for every row — on the screen built specifically to tell
  an original from a reissue. It does not throw, it does not warn, and the
  table looks complete. Reading `year` instead of `released` empties the column
  that separates the 1982 original from the 1989 repress.

  **The rule: normalize per endpoint, and never assume two endpoints of the
  same API share a field's shape.** Where the RULES are shared (absence-prose,
  reissue inference) extract them; where the SHAPES differ, keep separate
  parsers and let each one state what it expects. A single "clever" normalizer
  spanning both is how the string-as-array case gets written.

  **The rule for any external boundary: enumerate how the source spells
  ABSENCE, from real payloads, before mapping its fields.** Null and undefined
  are the easy cases. The dangerous ones are sentinel strings, `0` for "not
  set", `"0000-00-00"` dates, and empty arrays that mean "unknown" rather than
  "none". Normalize them to null at the boundary, in one place, and test the
  mapping at the ENDPOINT as well as in the normalizer — a pure function is
  easy to bypass with a wiring change. Noticed: step 7, unit 3.

- **RULE: prose is more rigorous than the work it describes, and it is always
  wrong in the flattering direction.** Comments, headers and STATUS REPORTS all
  do this. Three instances now, the third the worst:

  1. `isUniqueViolation` sat dead for a whole build unit behind a confident
     comment describing what it caught.
  2. A comment in `withFacet` asserted that `toEqual` would catch an
     `undefined`-vs-absent mutation. It cannot — verified.
  3. **`src/lib/records/create-schema.ts` (step 6, unit 3).** Its header says
     the schema is "shared by `POST /api/records` and
     `POST /api/want-list/:id/acquire`", and argues the case: *"Defining it
     twice is how they drift — and the drift would be silent."* Only acquire
     ever imported it. `POST /api/records` kept its own local `createSchema`,
     so the module warning against a second definition WAS the second
     definition. Found by the step 5+6 adversarial review, not by any test.

  **What makes the third one different: the artifact that outran the work was
  the REPORT.** The unit 3 report stated as fact that the schema was "shared
  with POST /api/records". Nobody checked, because a status report is read as
  a record of what happened rather than as a claim needing verification — and
  it is written by the party least able to audit it. The comment then encoded
  the same false claim in the source, where the next person editing one file
  would reasonably believe both had moved.

  **Why this class is nastier than a wrong comment.** A wrong comment misleads a
  reader. A wrong report misleads the REVIEW — it removes the item from the list
  of things anyone will look at again. Every other rule in this file assumes
  something eventually gets checked; this is the failure that opts out of that.

  4. **A false JUSTIFICATION, which is the most durable form** (step 6 unit 2).
     The same `create-schema.ts` header explained WHY the copy existed:
     "`MAX_NESTED_IDS` is inlined rather than imported from the query layer,
     which is `server-only`… pulling a server-only module through it would be a
     needless coupling." Two files already did exactly that import
     (`api/records/route.ts:7`, `api/records/[id]/schema.ts:3`), and this module
     is imported only by route handlers, so the coupling it warned of could not
     occur.

     **A false comment misleads a reader; a false justification survives
     review.** A bare "copied from X" invites the question "why not import it?"
     — the reasoning is missing, so a reviewer supplies it. A stated rationale
     answers that question before it is asked, and a reviewer who accepts the
     premise stops there. The more plausible the reason, the longer the copy
     lives: this one named a real project rule (CLAUDE.md §6) and a real
     constraint that simply did not apply here.

     **The check:** when a comment explains why the obvious approach was NOT
     taken, verify the obstacle exists — usually one grep for whether anything
     else already does the thing being called impossible. Treat a justification
     as a claim with a higher burden than a description, not a lower one.

  **The rule: a report sentence claiming a code property is an assertion, and
  gets verified like one before it is written.** "Shared by both endpoints" is
  one grep. Specifically, when a unit says it EXTRACTED or CONSOLIDATED
  something, grep for the importers and count them — an extraction with one
  importer is a copy, whatever the header says. Same discipline as a mutation:
  do not report the property, report what you ran. Noticed: step 6 unit 3,
  found by the step 5+6 adversarial review.

- **RULE: when a check can fail in two directions, pick the default by asking
  which error the user NEVER FINDS OUT ABOUT. Not by which is more likely, and
  not by treating them as equivalent.**

  (See also the guard-and-its-callers rule below, which is how the same badge
  came to be silently missing on the versions table.)

  §7.7's ownership tiers were settled this way, and the reasoning is recorded
  because a future change would otherwise undo it without knowing there was an
  argument. The two errors:

  | Wrong answer | What happens | Does the user learn? |
  |---|---|---|
  | "You own this pressing" when they own a DIFFERENT one | they put back a record they wanted | **No.** They walk away and never discover it |
  | "You own a different pressing" when they own THIS one | they buy a duplicate | Yes — at home, within the hour |

  **The second error corrects itself; the first is permanent and invisible.**
  So the exact tier requires POSITIVE EVIDENCE — a pressing row carrying the
  same `discogs_release_id` — and everything short of it falls to tier 2. The
  design is not "match as precisely as possible", it is "be reluctant to claim
  the specific thing".

  A record logged with no pressing at all reads as tier 2 for the same reason:
  the user owns the album, nothing establishes which pressing, and "you own a
  different pressing" is honest where "you own this pressing" is a claim
  nothing supports. That case is also the LIKELIEST one in practice, since
  §10's quick in-store entry exists to create records without pressings.

  **The general form: symmetry is the assumption to check, not the default.**
  Two failure directions are rarely equally costly, and the asymmetry is
  usually in DISCOVERABILITY rather than in frequency or severity. An error the
  user cannot detect gets no correction and no bug report — it is not merely
  worse, it is worse in a way that never appears in any feedback anyone
  receives.

  **The tell that this reasoning has been lost:** a later change making the
  matching "smarter" or "more accurate" without saying which direction it
  loosens. Noticed: step 7, unit 8a.

- **The decorative-test check has now caught one in ADVANCE rather than by
  mutation** (step 7, unit 8c). Sixth instance overall, first prevented.

  The test asserted that a column list is "static, not computed from the rows":

  ```ts
  expect(Object.isFrozen(COMPARISON_COLUMNS) || Array.isArray(COMPARISON_COLUMNS)).toBe(true);
  expect(COMPARISON_COLUMNS).toHaveLength(5);
  ```

  `Array.isArray` on an array is trivially true and a length check constrains
  nothing — it asserted the property in its NAME and not in its body, which is
  the shape CLAUDE.md §2 describes. Deleted while writing, not after a mutation
  came back clean.

  The five before it were all found afterwards: a probe deleted, a length test
  measuring itself, a whitespace test caught incidentally, an NFD literal
  normalised on disk, and "Misprint" colliding with no reissue prefix. The
  difference here was applying §2's question — *name the line of source this
  would fail against* — BEFORE running it rather than after.

  **What replaced it is worth more than a better test: the TYPE SYSTEM holds
  the decision.** A data-dependent column order changes the export's shape from
  a constant to a function, and the compiler names every call site. A guarantee
  the compiler enforces does not need a test, and a test that cannot fail is
  worse than the absence of one — it reports coverage that is not there.

  **The general form: before writing a test for a property, ask whether
  something already makes the property unrepresentable.** Types, constraints
  and unique indexes all do this. The identity assertion in
  `create-schema.test.ts` is the same move from the other direction — making
  drift unrepresentable rather than detectable.

- **RULE: a module whose only consumers are its TESTS has an unvalidated
  interface. Tests exercise a function; callers exercise a DESIGN.**

  `ownership-badge.ts` was written in unit 8b with 16 passing tests, mutation-
  verified in four directions. All of that was true and none of it established
  that the module's SHAPE was right — it took the internal `OwnershipMatch`,
  because that was the only ownership type that existed when it was written.

  The §5.7 amendment then made the endpoints emit a different wire shape, and
  the component that finally consumed the badge received THAT. The module could
  not serve it. What happened next is the point: rather than failing, the
  component grew its own copy of the labels — a second definition of the most
  consequential text in the app, appearing exactly where the real caller was.

  **Passing tests on an uncalled module tell you the function is correct, not
  that anyone can use it.** The tests were written by the same person, in the
  same hour, with the same picture in mind; they inherit the design's
  assumptions rather than testing them. A caller is an independent party with
  its own requirements, which is what makes it evidence.

  **The practical rule: while a module's only importers are test files, treat
  its interface as provisional.** Wire it to something real before adding more
  to it, and expect the first real caller to change its shape. The failure mode
  is not a broken module — it is a duplicate appearing at the call site,
  because copying is easier than reshaping something that already looks
  finished.

  **The tell:** `grep` for importers excluding `*.test.*` returns nothing. Same
  check as the extraction-with-one-importer rule, asking a different question:
  that one asks whether a claimed consolidation happened, this asks whether the
  design has ever met a consumer. Noticed: step 7, unit 8c.

- **RULE: a guard justified by its CURRENT CALLERS is an assumption about
  callers, not about the function — and it fails on the first caller that does
  not fit.**

  `matchOwnership` opened with `if (artist === null || title === null) return
  NONE`. Correct for every caller that existed: all of them came from search
  results, which carry both. And correct-LOOKING forever, because a guard at
  the top of a function reads as input validation.

  It is not. §7.7's tier 1 matches on `discogs_release_id` ALONE — a stronger
  identification than any text comparison — so it never needed the artist. The
  guard skipped it anyway.

  **The first caller that did not fit was the versions endpoint**, where
  Discogs' rows carry a title and no artist. The result: a table of pressings
  reporting "no badge" for a record sitting on the shelf, on the screen built
  to compare pressings. Nothing failed — every existing test supplied an
  artist.

  **The tell: a guard at the TOP of a function that serves only SOME of the
  paths below it.** The check belongs next to the code that needs it. Moved
  down, tier 1 runs regardless and tiers 2 and 3 return honestly; a regression
  test now covers the null-artist path in both directions.

  **The general form:** "no caller does that" is a fact about today. A
  precondition that is really about one branch, hoisted to the entry point,
  silently disables the branches that never had it. Noticed: step 7, unit 8c.

- **FOR THE SECURITY REVIEW: `POST /api/discogs/import` re-fetches the release
  by id rather than accepting a release payload from the client. That is a
  SECURITY decision, not a spec-reading, and it should be reviewed as one.**

  §5.7 gives the body as `{ discogsReleaseId, target, overrides }` — no release
  payload — and the implementation follows it. The distinction the shape
  enforces: **a client asserting facts about a pressing versus the server
  establishing them.**

  If the endpoint accepted a payload, any caller could claim any pressing
  identity — a `discogs_release_id` belonging to a different release, a matrix
  that was never in the dead wax, a catalog number matching a rare original.
  Those values are found-or-created into SHARED `pressings` rows (§4), so a
  false claim does not stay local to one record: it becomes the pressing every
  future import of that release matches against. §7.7's ownership tiers then
  read from it, and CLAUDE.md §8 calls getting that distinction wrong the worst
  bug this app can ship.

  The user's corrections still arrive — as `overrides`, which are an explicit,
  strictly-validated, bounded field list rather than an arbitrary object.

  **Single-user app, so the threat model is thin today.** Recorded because the
  property is easy to lose: accepting the payload the client already has looks
  like an obvious optimisation — it saves a rate-limited call — and the reason
  not to is not visible from the endpoint alone. `test/integration/api/
  discogs-import.test.ts` asserts both halves (it re-fetches; it rejects a
  client-supplied `release` key).

  **The general shape for the review: which endpoints let a client assert a
  fact the server could establish itself?** Noticed: step 7, unit 7.

- **RULE: cache the UPSTREAM payload, never your interpretation of it — your
  interpretation is the part that changes.**

  The Discogs release cache stores the raw payload and normalizes on every
  read, rather than storing the normalized result. Two reasons, and the second
  is the one that decides it:

  1. **Normalization is our code and it keeps changing.** Six units into this
     step the mapping has already been corrected several times — the colour
     rule, the pressing-plant role, the matrix array. Caching output freezes
     today's mapping for seven days, so a fix does not reach any record someone
     has already viewed. The bug is fixed and the user still sees it.
  2. **Double-normalization.** Feeding normalized output back through the
     normalizer produces a different shape again, so the second request for a
     release returns something the first did not.

  **The second failure is invisible to any test that fetches once**, which is
  most tests. It appears only on a cache HIT, meaning in production, after a
  release has been looked at twice — and it presents as an intermittent shape
  difference rather than an error. The test that catches it is explicitly "the
  cached body equals the fresh body".

  **The general shape: a cache stores a snapshot of something. Make sure it is
  a snapshot of THEIRS, not of yours.** Theirs changes when they edit it, which
  is what the TTL is for; yours changes when you deploy, which no TTL accounts
  for. Noticed: step 7, unit 6.

- **RULE: a search that does not cover the space returns a confident
  UNDERCOUNT, and an undercount looks exactly like a correct count.** Third
  instance of "verified by execution, wrong premise", and the cheapest to
  prevent.

  Step 7's `validationError` defect was reported as affecting TWO endpoints. It
  was eight. The grep was real, it ran, its output was accurate — and it
  covered `src/app/api/records/` and `src/lib/records/` rather than `src/`.
  Every PATCH endpoint in the project carries the same object-level refine.

  **Why this is worse than a failed search.** A search that finds NOTHING
  prompts a second look; nobody accepts "no results" for something they know
  exists. A search that finds SOMETHING closes the question — the number gets
  written into a report, scoped into a unit, and nothing about it invites
  re-checking. The two-endpoint figure survived into a commit message and a
  plan.

  **The check, and it is one line:** before quoting a count, run the search
  once more from the repository ROOT with no path filter, and confirm the two
  numbers agree. If they differ, the narrower one was measuring your assumption
  about where the code lives.

  Related and already recorded: the extraction-with-one-importer check, which
  is the same discipline for a different question. Both are about whether a
  claim covers the space it appears to. Noticed: step 7, validationError unit.

- **RULE: a class can be SOLVED and not RECOGNISED, and the giveaway is a
  comment calling the general case an exception.**

  Distinct from the prose-outran-the-work family above, and worth separating:
  there the comment was FALSE and the work undone. Here the work was correct,
  the comment was accurate, and the FRAMING was too small — which is why no
  amount of verifying the claim would have caught it.

  `validationError` handled `unrecognized_keys` as a special case because Zod
  gives it an empty `path`. The header said so, in writing:

  > "`unrecognized_keys` is the exception that made this more than a one-liner:
  > it describes the object, not a field, so Zod gives it an empty path"

  That sentence contains the general rule — *issues describing the object have
  no path* — and files it under "exception". Object-level `.refine` has exactly
  the same shape, and its message was dropped by the same line of code for
  eight endpoints.

  **The tell: a comment that explains WHY a case is special in terms that would
  apply to other cases too.** "It describes the object, not a field" is not a
  property of `unrecognized_keys`; it is a property of a category. When the
  justification for a special case generalises, the case is not special —
  enumerate the others before writing the branch.

  **The check when adding one:** ask what else has the property just used to
  justify it. Here, one search of Zod's issue codes for those with an empty
  path would have found the refine case years of sessions earlier. Noticed:
  step 7, validationError unit.

- **RULE: probes are code too, and a verified-by-execution claim still needs its
  premise checked.** NOTES already says "a mutation is code, and it can be
  wrong". Extend that to probes, and to the review loop around them.

  **The instance.** The `.toThrow()` sweep above reported a seventh finding that
  was FALSE: that `assertLocalHost` accepts `postgresql://u:p@[::1]/db` while
  rejecting four other loopback spellings, making the guard "comprehensive-
  looking but holed". The probe output was accurate — `[::1]` IS accepted. The
  INFERENCE was wrong. `::1` is deliberately allowed: there is a comment
  directly above `LOCAL_HOSTS` saying so, `stripBrackets` exists for no other
  purpose than to make it match, the error message names `::1` in its allowed
  set, and two existing tests cover it as accepted.

  **What made it look like a hole** was reading one probe result without
  checking what produced it — the same error the sweep existed to find in tests.

  **What caught it** was not re-reading. It was testing whether the POLICY held
  across spellings: `[0:0:0:0:0:0:0:1]` and `[::0001]` also came back accepted,
  which looked like confirmation of a real gap until tracing the resolved host
  showed pg-connection-string NORMALISES all three to `[::1]` before the guard
  runs. They are accepted because they ARE `::1`. The genuinely non-loopback
  addresses — `[::2]`, `[fe80::1]`, `[::ffff:127.0.0.1]` — are all correctly
  rejected. The guard is right as written; no code changed.

  **The part that is about the loop, not the probe.** The finding was APPROVED
  for fixing on the strength of the report, without the guard being read — so
  both sides of the review accepted a conclusion whose premise neither had
  checked. A claim being "verified by execution" makes the OBSERVATION reliable;
  it says nothing about whether the observation means what the reporter says it
  means. Both roles have to check the premise, and the reviewer's approval is
  not a substitute for the reporter's having done so, nor the reverse.

  The prior commit message (`b2c7129`) records the false finding as fact. Left
  unrewritten deliberately — a pushed commit is history — which is why the
  correction lives here. Noticed: step 5 remediation.

- **CORRECTED — the database DOES protect reference rows; an earlier entry here
  said the opposite.** This entry previously claimed `record_tags.tag_id` was
  `ON DELETE CASCADE` and that only the application layer stood between a delete
  and silent data loss. That was wrong, and wrong in the dangerous direction:
  it asserted a threat that does not exist while implying the app check was the
  sole guard. Verified by querying `pg_constraint` directly (step 4, unit C):

  | Junction | → owning entity | → reference row |
  |---|---|---|
  | `record_tags` | `record_id` CASCADE | `tag_id` **NO ACTION** |
  | `record_genres` | `record_id` CASCADE | `genre_id` **NO ACTION** |
  | `want_list_genres` | `want_list_id` CASCADE | `genre_id` **NO ACTION** |
  | `artist_genres` | `artist_id` CASCADE | `genre_id` **NO ACTION** |
  | `artist_influences` | both FKs CASCADE | — |

  This matches SPEC.md §4.3 as amended (the rule is directional, not blanket).
  So the FK **is** the guarantee for every reference resource, and the query
  layer's count is advisory — it exists to produce a helpful 409 with a
  reference count before attempting the delete, not to prevent data loss. Both
  layers are kept deliberately; see unit C. Corrected: step 4, unit E.

- **RULE: environmental causes look like logic bugs, and a diagnosis that
  survives four failed fixes is probably about the wrong thing.**

  **Four instances now** — the two below, the prerendered `/manage` page, and
  the 390px screenshot failure recorded further down. The count is the point:
  this is not a one-off, it is the most common way an investigation here goes
  wrong. When something fails, the environment is a first-class hypothesis, not
  what you fall back to after the logic explanations run out.

  Two `/manage` genre specs were quarantined from step 4 until step 5's E2E
  stability unit — weeks — against the diagnosis "`router.refresh()` has not
  delivered new props when the assertion runs". Four fix attempts aimed at that
  mechanism, including two `aria-busy` approaches, and NOTES recorded that they
  "made it worse".

  **Neither actual cause was in the application.** Both were environmental:

  1. **Accumulated fixture rows.** E2E specs wrote through the real API and
     nothing cleaned up, so every run's genres persisted. The move select's
     contents depend on how many genres exist. Fixed by resetting the E2E
     database once per run.
  2. **`/manage` was prerendered at build time.** It reads seven tables and
     uses no request-scoped API — auth is in middleware, which does not opt a
     page into dynamic rendering — so a production build served a snapshot.
     Found only by running E2E against a production build.

  After both, the specs passed **9/9 across every configuration** and are
  unquarantined.

  **Why the diagnosis persisted:** it was plausible, it named a real mechanism,
  and it was never re-derived — each attempt inherited it. The measurement that
  would have refuted it (PATCH 1264ms vs refresh 142ms) took ten minutes when
  finally done. See the "same family is a hypothesis" rule above; this is the
  same failure one level up, where a *cause* rather than a *resemblance* went
  unchecked.

  **The check:** when a fix aimed at a diagnosis fails twice, stop fixing and
  re-derive the diagnosis. Test the environment — data volume, build mode,
  caching — before the application logic. Environmental causes produce
  symptoms indistinguishable from logic bugs, and they do not respond to
  logic fixes, which is exactly why the attempts "made it worse".

  **Mode 1 (`Protocol error … session closed`) never recurred** in ~30 runs
  during the investigation. Possibly also environmental; not claimed as fixed.

- **A test fixture can fail to create the condition its test claims — and
  reading the test cannot catch it.** Two instances so far, both invisible to
  review and both found only by mutation:

  1. **NFC/NFD literals.** A typed NFD string is normalized to NFC when written
     to disk, so `expect(nfc).not.toBe(nfd)` compared a value with itself. The
     test passed while testing nothing.
  2. **Enum sort order.** `price_type` is a Postgres enum and sorts by
     DECLARATION order (`new` < `used` < `best_dig`), not alphabetically. Two
     successive fixtures accidentally made the newest row ALSO sort first under
     type ordering, so a type-ordered implementation passed a test asserting
     recency.

  **The rule:** when a test's precondition depends on an ordering, encoding, or
  normalization that the DATABASE or RUNTIME controls rather than the test,
  query the actual behavior instead of reasoning about it. `enum_range()` over
  an assumption about sort order; `\uXXXX` escapes over a typed literal;
  `pg_constraint` over a memory of what the schema says.

  **Why it needs its own rule:** a mutation only exposes this if the fixture
  happens to be wrong in a way that mutation reveals — in the enum case it took
  three fixtures and two wrong hypotheses. Reading the test never catches it,
  because the test looks correct. The tell is a fixture whose *discriminating
  property* is assumed rather than verified. Noticed: step 5, unit 3.

- **A mutation is code, and it can be wrong. "Fails N tests" is not evidence
  until the N that failed are the ones that SHOULD have.**

  In step 5 unit 6 a global-recency mutation appeared to fail 5 tests — which
  looked like strong evidence the chain was well covered. It was not. The
  mutation's subquery referenced `price_history` unqualified inside a Drizzle
  template, so the correlation to the outer row silently broke and EVERY record
  fell through the entire chain to its purchase price. It was not testing
  "global recency instead of per-type", it was testing "no price history at
  all".

  **The tell:** a test that should have been INDIFFERENT to the change failed
  anyway. Both rules return the same value for a record whose only prices are
  `used`, so the used-only test had no business failing. Checking that one case
  in isolation exposed it.

  Rewritten correctly — using the same helper style as the real code, so the
  correlation works — it fails 2, which are exactly the two cases that
  distinguish the rules. **The smaller number was the honest one.**

  An inflated count is worse than a small one: it reads as stronger evidence
  while actually meaning the mutation broke something other than the behaviour
  under test, leaving that behaviour unverified. Add to the mutation checklist
  alongside "what produced the correct outcome instead" — before trusting a
  count, confirm the failures are the predicted ones. Noticed: step 5, unit 6.

  **COROLLARY: a mutation result from a DIRTY BASELINE is not a result — and
  the specific trap is that `git checkout` does not restore an UNTRACKED file.**

  A mutation on a file created in the current unit is not yet in git, so
  `git checkout <path>` succeeds, prints nothing, and changes nothing. The
  mutation silently persists into the next one, and every subsequent count is
  measuring two mutations stacked while appearing to measure one.

  Hit in step 8 unit 2: M3 reported 2 failures against a file still carrying M2,
  so the number was unattributable. Restored from source and re-run alone, the
  honest count was 1.

  **The habit:** for a new file, snapshot it (`cp`) before the first mutation
  and restore from the copy — or commit first. Then verify the baseline is
  green BETWEEN mutations, not only at the end. A green run between two
  mutations is the cheapest possible proof the previous one was undone.

  **THIRD TRAP, distinct from both: the mutation can apply CLEANLY to the wrong
  code.** Not a dirty baseline and not a changed test count — the edit succeeds,
  the suite runs, and it measures a query nobody was testing.

  Step 9 unit 4. `records.ts` contains `.innerJoin(labels, ...)` TWICE. A
  `str.index()` anchor found the first occurrence, in an unrelated query, so the
  `byLabel` LEFT JOIN mutation reported "0 failures" and I nearly concluded the
  test was decorative. It was correct — measured directly against Postgres, a
  LEFT JOIN yields a null-named group, exactly what the test asserts against.
  Re-anchored on `const byLabel` first, it fails 2.

  **The tell: a mutation you expected to fail something that reports zero.**
  Before concluding the test is weak, confirm the mutation LANDED — grep the
  mutated file for the change, or count occurrences of the anchor first. Three
  traps now, all producing a number that looks like evidence:

  | Trap | Symptom | Check |
  |---|---|---|
  | dirty baseline | plausible count, unattributable | green run between mutations |
  | changed test set | count moves for the wrong reason | run the whole file, fixed set |
  | **wrong anchor** | **zero failures on a real gap** | **confirm the edit landed where intended** |

- **UX HAZARD for step 9's stats screen: one record legitimately shows two
  different prices, and it will read as a bug.**

  SPEC.md §5.2's record detail shows "latest price" — the most recent
  `price_history` row, whatever its type. §7.6's estimated collection value uses
  a different rule: the most recent row of type `used`, falling back to `new`,
  then `purchase_price`. Both verified against the database.

  So a record with an old `used` price of 20.00 and a newer `new` price of 99.00
  displays **99.00** on its detail screen while contributing **20.00** to the
  collection total. Both numbers are correct and the separation is deliberate —
  they answer different questions — but whoever meets the discrepancy first will
  reasonably read it as an arithmetic bug.

  **What step 9 must do:** the stats screen states in words what it is summing,
  rather than presenting a bare number. Something to the effect of "estimated
  from the most recent second-hand price, or the new price, or what you paid" —
  the point is that the rule is visible, not that the wording is exact. A
  tooltip on the figure is not enough if the figure is what gets screenshotted.
  Noticed: step 5, unit 6.

- **A mutation that fails nothing does not mean the code is dead.** Three
  distinct patterns have now produced "removing this breaks no test", and only
  one of them meant the code was genuinely unused:

  1. **Genuinely dead** — `isUniqueViolation` read `.code` off Drizzle's
     wrapper, where it is always undefined, so the branch never matched.
  2. **Live but unconstrained** — the branch executes and is correct, but no
     test holds it: both `isUniqueViolation` call sites after the unit C fix,
     and the `'is missing'` branch in `parseEnv`.
  3. **Masked by a different mechanism** — the branch is real and load-bearing,
     but its absence produces the same observable outcome by another path. The
     `pressings` discogs-id match branch: remove it and the request falls
     through to create, the partial unique index rejects the duplicate, and
     POST's recovery returns the winning row. Same 200, same body, different
     mechanism. It looks dead to a mutation test *and* to a reviewer, and the
     "delete unreachable code" instinct removes it.

  **The check:** when a mutation fails nothing, do not conclude the code is
  dead — determine what produced the correct outcome instead. If the answer is
  a different mechanism, both are real and each needs an isolating test.
  Removing both layers together is what distinguishes case 3 from case 1.
  Noticed: step 4, pressings.

  **Two more instances in the step 5 remediation, and they resolved OPPOSITE
  ways — which is the point of doing the determination rather than guessing:**

  4. **KEPT (case 3).** `count(DISTINCT record_id)` in the stats ancestry CTE.
     Removing it fails nothing, because `UNION` (not `UNION ALL`) has already
     deduped the `(record_id, genre_id)` pairs as the walk produces them.
     Removing BOTH fails the double-count test. Probed the CTE directly to
     establish that UNION was doing it. Both kept, because they guard different
     things: UNION also bounds the walk if a cycle ever reaches the data, the
     same reasoning as `wouldCreateCycle`. Documented in the source, since the
     "delete unreachable code" instinct removes one, sees green, and removes the
     other in a later pass.

  5. **REMOVED (subsumed).** A `.min(1, 'must not be empty')` on the year
     filter schema. Its mutation also failed nothing — but probing showed the
     empty string is already rejected TWICE over: the digit regex `/^-?\d+$/`
     fails on `''`, and `isValidFormedYear(0)` is false. Unlike case 4, this
     layer guarded nothing the others did not already cover, so it went.

  **The distinguishing question is not "does removing it fail a test" — both of
  these answered no. It is "what would go wrong that nothing else catches".**
  For 4 the answer was a cycle in the data; for 5 there was no answer.

- **DEFERRED to step 14 — concurrent PATCHes to one record can interleave their
  genre replacements.** `updateRecordWithNested` now wraps all three writes in
  one transaction, so a FAILED PATCH rolls back completely. That is a different
  property from two SIMULTANEOUS PATCHes to the same record: each replacement is
  delete-then-insert, and under the default READ COMMITTED isolation two
  overlapping transactions can produce a union or a loss rather than
  last-write-wins.

  Real, but it requires two concurrent writes to the SAME record on a
  single-user application, where the only client is one person's browser. The
  fix, if ever needed, is `SELECT … FOR UPDATE` on the parent row inside the
  transaction, or `SERIALIZABLE` isolation with a retry — not a change to the
  replacement logic. Developer decision: revisit at step 14. Noticed: step 5
  remediation, unit 1.

- **COLLECTION SCREEN: undated records are invisible to ANY year range, by
  design, with no way to surface them.** `release_year` is nullable (a record
  can be logged before its year is known), and both year filters compare
  against it, so `yearFrom=1980` and `yearTo=1990` and any combination all
  exclude every null-year record. That is correct SQL semantics and correct
  filter behaviour.

  It is a UI problem, not a query bug: a user who sets any year filter silently
  stops seeing part of their collection, with nothing on screen saying so. The
  step 5 collection screen has to decide — an "undated" chip, a count of
  excluded records next to the filter, or a documented choice not to. **Do not
  "fix" this in the query layer** by making nulls pass the filter; that would
  make `yearFrom=1980` return records that may well be from 1972.

  Related and separate: this was found while fixing the empty-string coercion
  bug, where `yearFrom=` silently applied `release_year >= 0` and dropped every
  undated record behind a 200. That bug is fixed; this design consequence
  remains. Noticed: step 5 remediation, unit 3.

- **RESOLVED: `validationError` discarded the message from any object-level
  `.refine`, and EIGHT endpoints were answering "Invalid request" with the
  reason dropped.** Fixed in its own unit after step 7 unit 5.

  A refine on the whole object produces an issue whose `path` is EMPTY, and the
  helper kept only issues that named a field. The response was a well-formed
  400 that told the caller nothing — the absence-as-success shape in a place
  where the absence IS the explanation.

  **The count was wrong when first recorded here: I said two endpoints, and it
  was eight.** The original grep covered two directories rather than `src/`.
  Every PATCH endpoint carries the same `At least one field must be supplied`
  refine — artists, genres, labels, stores, pressings, records, want-list and
  influences.

  **Why it survived: all eight had an empty-body test, and all eight asserted
  only the STATUS.** A status-only assertion cannot distinguish a considered
  rejection from one whose explanation was silently discarded. Reverting the
  fix now fails 10 tests; before the fix that same mutation failed zero.

  **The other half was already in the same function.** `unrecognized_keys` has
  the identical empty-path shape, was handled specially, and the handling was
  never generalised — the header even documents the empty path as "the
  exception that made this more than a one-liner". One instance of a class,
  solved and not recognised as a class.

  Field errors keep precedence: when a body fails a field check AND an
  object-level refine, the field errors say what to fix. That rule needed its
  own fixture — the first version passed under either precedence because the
  refine did not actually fire, and mutation caught it.

- **DEFERRED (security review) — a `cause` chain can carry more than the message
  it was wrapped in.** `DiscogsError` keeps `cause` for the log, and
  `withErrorHandling` stringifies `error.message` plus the stack. A driver or
  `fetch` error nested deep enough could put a URL, a header set, or a
  connection string into a log line nobody expected to hold one.

  Latent rather than live: nothing today puts a credential in a `cause`, the
  token travels in a header the client never logs, and the response body is
  fixed prose (§5). It is on this list because the shape is one where a future
  change makes it live without anyone touching the logging code.

  **The fix, when it happens:** log a redacted projection — name, message,
  status, SQLSTATE — rather than the whole chain, and assert in a test that a
  planted secret in a nested `cause` does not appear in the emitted line.
  Noticed: step 7 security review.

- **DEFERRED TO STEP 14 (deploy) — the no-live-calls guard keys off the
  DATABASE TARGET, which is exactly right today and stops being sufficient the
  moment a test run points at a remote database.**

  `isTestContext()` returns true when `DATABASE_URL` is local, `NODE_ENV` is
  test, or `VITEST` is set. Every current test context satisfies at least one.

  A CI job running E2E against a hosted preview database would satisfy NONE:
  Next forces `NODE_ENV=development` for `next dev` (measured), `VITEST` is
  unset in a Playwright run, and the database would be remote. The guard would
  go quiet and a server component could reach Discogs for real — the exact
  failure it was built for, restored by a configuration change nobody would
  connect to it.

  **Deferred rather than fixed because that configuration does not exist**, and
  a guard keyed on a signal we have not yet designed would be speculation. But
  it is a DEPLOY concern rather than a testing one: whoever sets up remote-
  database CI has to add a signal that survives it, and `test/repo/
  no-live-discogs.test.ts` should gain a case for it at the same time.

  **The general shape, worth carrying past this instance:** a guard keyed on an
  OBSERVATION rather than a flag is more robust — that is why the database
  target beat `NODE_ENV` — but every observation is still a bet about the
  environments that will exist. Write down which environments the bet covers.
  Noticed: step 7 security review.

- **DEFERRED — `genreSubtree` is defined twice, in two files, and both copies
  are correct today.** The recursive CTE walking the genre hierarchy down (§7.1)
  exists in the records query layer and again in the want-list one. Nothing is
  wrong with either; the risk is drift, and drift here is silent — a §7.1 fix
  applied to one file leaves the other filtering by a different rule, with both
  screens returning a plausible 200.

  **Sharing is not free**, which is why this is deferred rather than done: the
  records copy lives in a `server-only` module, so extracting it means either a
  new shared module that is itself server-only (fine, but a third file) or
  loosening that boundary (not fine — CLAUDE.md §6). The right move is probably
  a `src/lib/db/queries/genre-hierarchy.ts` marked `server-only` and imported by
  both, but that is a refactor across two step-boundaries' code and belongs in
  its own unit rather than smuggled into a defect fix.

  **If either copy is touched before then, port the change to the other in the
  same commit and say so in the message.** Noticed: step 5+6 adversarial review.

- **DEFERRED — nothing stops TWO want-list items pointing at ONE record.**
  `acquired_record_id` has no unique constraint, so two rows can claim the same
  `records` row. §7.3 treats the want-list as acquisition history, and one
  physical acquisition appearing as two entries misstates that history —
  the collection value is unaffected, but "what did I hunt for and find" is not.

  **Not reachable through the API today**: acquire creates a fresh record inside
  its transaction and links that, so no endpoint can aim two items at one row.
  **It stops being unreachable in step 7.** The Discogs import writes these
  columns and matches external data onto existing records, which is exactly the
  path that could link a second want-list item to a record already claimed.

  So this is not a step-14 bounds question like the others — **step 7 has to
  decide it**, either with a partial unique index on `acquired_record_id WHERE
  acquired_record_id IS NOT NULL` or with an explicit rule about what a
  duplicate match means. Deliberately not fixed now: the constraint is trivial,
  but choosing it before the importer exists risks blocking a legitimate flow
  nobody has designed yet. Noticed: step 5+6 adversarial review.

- **`/manage` has the same 200-row assumption the collection chips had, and it
  is NOT fixed.** `src/app/manage/page.tsx` fetches every reference resource
  with `{ limit: 200, offset: 0 }` on the reasoning that "reference data is
  small, so one page of 200 covers every resource and this screen needs no
  pagination controls."

  That assumption is now known to break: a single full E2E suite run produces
  **300 genres**, and the 201st onward simply do not render — no pagination
  control, no indication, no error. A user with many genres would silently be
  unable to see or edit some of them, on the screen whose entire purpose is
  editing them.

  Unlike the collection chips, the facets fix does NOT apply here: `/manage`
  must show every reference row including unused ones, because deleting an
  unused genre is exactly what that screen is for. So this needs real
  pagination or a search field, not a narrower query.

  Deliberately not fixed in step 5 — `/manage` is step 4's screen and this is
  scope discipline (CLAUDE.md §4). Noticed: step 5, unit 7b.

- **The 1877 `formed_year` floor is the start of recorded sound, not of music.**
  §4.1 bounds `artists.formed_year` at 1877 (Edison's phonograph) on the
  reasoning that no *recording* artist predates it. A classical or early-jazz
  reissue could nonetheless involve an artist whose meaningful date is earlier —
  a composer, or an ensemble founded in the 1800s. `formed_year` is band
  formation rather than birth or founding, and this collection is punk-centred,
  so it is unlikely to bite. Recorded rather than acted on: if it ever does, the
  fix is to lower the floor or make it nullable-with-a-note, not to remove the
  bound, which is the only thing keeping 999999 out of §8's graph. Noticed:
  step 4, artists.

- **DO NOT run `prettier` in this repo. There is no config, so it formats to
  ITS defaults, not the house style.** Run once on a single route file during
  the step 5+6 remediation, it rewrote every string in the file from single to
  double quotes — a whole-file diff of unreviewed cosmetic changes wrapped
  around a three-line fix, which is exactly the large-unreviewed-diff problem
  CLAUDE.md §1 splits units to avoid. Reverted with `git checkout` and the
  change reapplied by hand.

  Lint does not object, because ESLint here carries no formatting rules — so
  nothing in the toolchain will catch this on the way in. Match the surrounding
  file by hand instead.

  **If formatting is wanted, it is a deliberate step-14 decision** with a
  committed `.prettierrc` matching the existing style and one sweeping commit
  that touches nothing else — not an ad-hoc run inside a feature unit. Noticed:
  step 5+6 remediation, unit 3.

- **`--reporter=basic` no longer exists in Vitest 4.** It is now resolved as a
  custom reporter *module*, so passing it fails the run with `ERR_LOAD_URL`
  before any test executes rather than with a "no such reporter" message. Cost a
  debugging round in unit 0. Nothing in the repo passes it today (the new probe
  in `test/repo/env-loading.test.ts` deliberately omits any `--reporter` flag),
  but it is the obvious thing to reach for when adding CI output formatting
  later — the Vitest 4 equivalents are `default`, `dot`, `json`, `junit`, etc.
  Noticed: step 4, unit 0.

- **A failing assertion in `test/repo/drizzle-config.test.ts` prints a vitest
  sourcemap error instead of the assertion message.** When vitest formats a
  failure from that file it walks the repo root looking for sourcemaps and
  chokes on a binary (`favicon.ico`), emitting
  `SyntaxError: Unexpected token '<9f>', "<9f>" is not valid JSON` in place of
  the diagnosis. **The detection itself is unaffected** — the mutation that
  removes `.env.test` loading is reliably caught (5 passing drops to 4) — only
  the message is unreadable. Two attempts to avoid it failed: `node
  --experimental-strip-types` cannot load the config (its imports omit file
  extensions under TypeScript `bundler` resolution), and reducing the assertion
  to a short string label did not stop vitest from source-mapping the frame.
  Left as is per CLAUDE.md §9 rather than thrashing. If it bites someone, the
  likely fix is a vitest `server.sourcemap` setting or moving the probe into a
  helper module outside `test/repo/`. Noticed: step 1–3 remediation, unit 3.

- **DEFERRED (from step 1–3 adversarial review): timing leak distinguishes a
  malformed `APP_PASSWORD_HASH` from a wrong password.** `src/lib/auth/password.ts`
  fails closed on a broken hash, and the response text is correctly vague — but
  the malformed-hash path returns in ~0.01ms versus ~270ms for a real bcrypt
  compare, a ~27,000× difference measured locally. An unauthenticated caller can
  therefore detect that the hash env var is unset or corrupt. Single-user app,
  low value; the fix is to compare against a fixed dummy hash of the same cost on
  the failure path. Developer decision: revisit at step 14 (deploy). Noticed:
  step 1–3 review.

- **CORRECTED — the Neon transaction gate is CLOSED, and this entry said
  otherwise for a whole session.** It previously read "DEFERRED — SCOPE WIDENED:
  transactional code MUST be verified against a real Neon database", and claimed
  that nothing in the suite exercised `drizzle-orm/neon-serverless`. That was
  true when written and became false in **step 5 unit 1** (`ef5b066`), which
  closed the gate rather than deferring it again. The entry was never updated.

  **What that cost.** A cold session read this file, reported the gate as still
  open, and was about to make a scoping decision on that basis. This is the
  THIRD stale-entry incident in this file, after the `record_tags` cascade claim
  and the `price_history` append-only claim. All three were wrong in the
  dangerous direction: each asserted an absence of protection that in fact
  existed, which invites building a redundant guard or, worse, treating verified
  code as unverified and re-litigating it.

  **State as of 2026-08-06** (superseded — the current count is 9, see
  CURRENT POSITION): `test/integration/neon-transactions.test.ts` ran 7 tests
  against a real throwaway Neon branch over `drizzle-orm/neon-serverless` — the
  only place in the suite that driver is exercised at all. Both nested-write
  primitives were covered: `writeRecordWithNested` (create) and
  `updateRecordWithNested` (PATCH).

  **BUT THE CLOSING TEST WAS HOLLOW UNTIL 2026-08-06, AND REPORTED GREEN THE
  WHOLE TIME.** `rolls back the real nested-write primitive, not just raw SQL`
  blanked `TEST_DATABASE_URL` to point the primitive at the branch — which makes
  `resolveDriver` THROW, because it refuses to select a driver when
  `NODE_ENV=test` and no test URL is set. A bare `.rejects.toThrow()` accepted
  that refusal as if it were the rollback under test. Probed and confirmed: the
  caught error was the driver guard, not a foreign key. It never reached Neon.

  The other four tests were genuine throughout — they use the branch connection
  directly — so the gate was partially real. But the ONE test covering the §5.2
  primitive, which is the entire reason the gate exists, was not.

  Fixed: both primitive tests now stub `NODE_ENV` so the driver resolves, and
  assert on the failing TABLE (`/record_genres/`, `/record_tags/`) rather than
  any throw.

  **The general lesson, which outlives this entry:** a test that manipulates
  environment to reach a code path can be defeated by a DIFFERENT guard reading
  the same environment, and a message-less assertion will not notice. See the
  `.toThrow()` entry below. Corrected: step 5 remediation.

  **The acquire deferral that used to end this entry is now CLOSED** (step 6,
  unit 4). It read: "§5.3's `POST /api/want-list/:id/acquire` is step 6 work and
  its §11-required mid-transaction failure test does not exist yet… Step 6
  cannot be closed without it." Both the flow and the test now exist, and the
  Neon file covers the acquire rollback plus two simultaneous acquires on the
  WebSocket pool. See item 14 above for what was proven.

  Updated here rather than left to be inferred from item 14: this entry is the
  one a cold session reads when asking "is the Neon gate open", and it has
  already been stale once in exactly that situation.

- **README.md is a 20-byte stub.** SPEC.md §14 requires it to cover local setup,
  running migrations, obtaining a Discogs token, running each test suite, and
  deploying. That is project-level definition-of-done, not build step 1, so it
  was left untouched. Noticed: step 1.

- **`npm audit` reports 4 moderate advisories, all one transitive chain.**
  `drizzle-kit` → `@esbuild-kit/esm-loader` → `@esbuild-kit/core-utils` → an old
  `esbuild` (GHSA-67mh-4wv8-2f99: the esbuild dev server will answer cross-origin
  requests). It is devDependency-only and does not reach the app or production
  bundle. `npm audit fix --force` resolves it by downgrading drizzle-kit to
  0.18.1, a breaking major regression, so it was left alone. Worth rechecking
  when drizzle-kit next updates its bundler. Noticed: step 1.

- **`d3-force` was installed in step 1 though not used until step 10.** SPEC.md §2
  names it in the fixed stack, so it was installed with the rest of the stack
  rather than deferred. No code imports it yet. Noticed: step 1.

- **CORRECTED — `price_history` append-only IS enforced by the database.** This
  entry previously said the opposite: that nothing in the schema prevents an
  `UPDATE` and that `set_updated_at` was attached, implying updates were
  expected. Both were false from migration 0001 onward, and the entry was wrong
  in the dangerous direction — it would lead the next unit either to build a
  redundant query-layer guard or to assume no protection exists at all.

  Verified against `pg_trigger` and by execution:

  | Claim | Reality |
  |---|---|
  | Nothing prevents `UPDATE` | `price_history_reject_update` BEFORE UPDATE fires and raises |
  | `set_updated_at` is attached | It is NOT; the table has exactly one trigger |

  An `UPDATE` fails with `restrict_violation` and the message
  `price_history is append-only (SPEC.md 7.5): UPDATE is not permitted, insert
  a new row instead`. §4.2 also drops `created_at`/`updated_at` from this table
  entirely, so there is nothing for a timestamp trigger to maintain.

  **What this means for the query layer:** the guarantee is the trigger, not
  convention. Query code should insert new rows and need not defend against
  its own updates; a `PATCH` that reaches this table is a bug that will surface
  as a 500, not silent corruption. Corrected before step 5.

- **Next 16 deprecates the `middleware` file convention in favour of `proxy`.**
  The dev server warns on every boot and offers a codemod
  (`npx @next/codemod@canary middleware-to-proxy .`). `src/middleware.ts` works
  correctly today and SPEC.md §3 says "Next.js middleware" explicitly, so it was
  left alone rather than migrated mid-step. Worth doing before step 14 (deploy).
  Noticed: step 3.

## Resolved

- ~~§10a's market panel on the want list and record detail.~~ Step 10 unit 3,
  2026-08-13.

  **The want list is where four quantities meet**, and three of them are money:
  `best_dig_notes` (a PRESSING), `max_price` (the user's DECISION), the market
  floor (a seller's LISTING), and Discogs' ladder (a MODEL). §7.2 has kept the
  first two apart since step 6; §10a adds the last two to the same row.

  Each says what it IS in words rather than relying on position — a label naming
  the field tells the reader where a number came from, not what it means.
  Mutation-verified: a floor label colliding with the ceiling fails 2 tests,
  claiming a "worth" fails 1, presenting the ladder as sales fails 1.

  **One component for both screens**, per §10a's "building it per-screen
  produces three implementations that drift". Record detail auto-loads (one
  record, already owned); the want list does not, because it is a list.

  **A screenshot caught duplication no assertion did:** the panel heading read
  "CHEAPEST ASKING NOW" directly above a sentence beginning "cheapest asking
  $47.28". The heading now names the QUESTION (§10a's table) and the sentence
  supplies the figure. The test that pinned the old wording was rewritten to
  assert the PROPERTY — never "worth", never "sold" — rather than the phrasing.

  **A new variant of the shared-row collision, worth the entry.**
  `pressings.discogs_release_id` carries a UNIQUE index (§4.2) and pressings are
  found-or-create, so two Playwright projects cannot both own a pressing for
  release 381756: the first wins, the second reads back a row it never seeded.
  Passed alone, failed paired.

  Previous instances collided through PAGINATION (rows pushed off page 1) and
  through NAME (the suffix convention). This one collides through a database
  CONSTRAINT, which no suffix can help with — the id is the key.

  Fixed with `seedDiscogsCacheAs(id, fixture)`: each run caches real captured
  data under an id of its own. **The general rule holds and gains a third face —
  a spec asserting on a found-or-created row needs a key no other run can
  produce, and "key" includes any uniquely-indexed column, not just the name.**

- ~~The app rendered `£` throughout and Adam is in New York.~~ Fixed
  2026-08-13, its own unit.

  **SPEC.md never named a currency.** `£` was assumed in step 5 and copied into
  three formatters. QA made it visibly incoherent rather than theoretically
  wrong: a record detail page showed **"PAID £10.00" directly above market data
  in dollars** — two currencies on one screen, neither labelled.

  **Three formatters became one.** `formatPrice`, `formatTotal` and
  `formatCeiling` were the same string manipulation with different null
  handling, which is exactly why the symbol lived in three places. `formatMoney`
  now carries it once, and the old names delegate so no caller changed.

  | | before | after |
  |---|---|---|
  | code sites with the symbol | 3 | **1** (`CURRENCY_SYMBOL`) |
  | tests pinning it | scattered | 13 fail if it changes |

  **`formatCeiling`'s distinct behaviour is preserved, not flattened.** It
  returns `undefined` rather than a dash, because the want list OMITS the
  max-price line entirely — a dash beside a ceiling reads as "I will pay
  nothing" (§7.2). That is an overload on the shared function rather than a
  fourth copy.

  **Still string manipulation, never `toLocaleString`.** `NUMERIC(10,2)` values
  are carried as strings end to end precisely so they never route through a
  float, and a locale formatter would reintroduce exactly that.

  Verified by screenshot: every figure on the detail and stats screens is USD,
  and §7.6's estimate correctly excludes the $120 asking price in favour of the
  $24.50 `used` one.

- ~~`VersionTable` called `useState` after an early return.~~ Found by LINT, not
  by any test, during step 10 unit 2.

  The identical-versions unit added `const [expanded] = useState(...)` below the
  `versions.length === 0` guard. React requires hooks in the same order on every
  render, so a card that first rendered with no versions and then received some
  would call a different number of hooks.

  **No test caught it and none would have**: the two orderings only diverge when
  the props change mid-life, and every fixture in the suite renders a card once
  with its final data. `react-hooks/rules-of-hooks` sees it structurally.

  **The generalisable part: lint is a different INSTRUMENT, not a slower test.**
  It reasons about code shape rather than behaviour, so it catches the class of
  defect whose trigger no fixture happens to reproduce. Three of the last four
  findings came from tools rather than tests — this, the fresh-clone migration
  check, and the `git diff` set comparison.

  Also cleared in the same pass: a `setState` called synchronously inside an
  effect (the §10a auto-resolve), which the same rule flags as cascading
  renders. Fixed by scheduling off the effect body rather than by suppressing.

- ~~`price_type` contained `best_dig` — a PRESSING modelled as a price.~~
  Spec defect, migrated out in **0005**, 2026-08-12.

  Adam's record read **"£120.00 best dig"**, which reads as "best price" — the
  exact §8 conflation the rule exists to prevent, and it was in the schema. The
  enum is now `new | used | asking`.

  **Data verified before and after, not just "the migration ran":**

  | | rows | sum | the row |
  |---|---|---|---|
  | before | 3 | £138.00 | `de0f81dd… @ 120.00 best_dig` |
  | after | 3 | £138.00 | `de0f81dd… @ 120.00 asking` |

  Same id, same amount, relabelled. Postgres cannot remove an enum value in
  place, so the type is replaced (`CASE best_dig -> asking`); flagged as a
  destructive type change per CLAUDE.md §7 and confirmed before running.

  **`asking` is deliberately OUTSIDE §7.6's chain** (`used → new →
  purchase_price`), and that is the most important part of this unit: a price
  nobody paid must not inflate the headline figure on /stats. Same class as the
  fabricated 230g weight, except it compounds into a number people quote.
  Mutation-verified — adding `asking` to the chain fails **3** tests.

  **The fresh-clone migration test caught an untracked file.** It copies TRACKED
  files only, so a journal entry without its committed SQL produced a failure
  that looked like bad SQL. The migration was fine; `git add` was missing. That
  test earned its place.

  **Five stale test references**, each updated with the reason rather than
  quietly: three were incidental uses of the value, one asserted the enum
  contents (which is what should fail), and one depended on DECLARATION ORDER —
  `asking` is also declared last, so recency and type-ordering still disagree
  and the fixture still discriminates.

- ~~Prices showed neither date nor type.~~ QA finding, step 9, fixed
  2026-08-12.

  The sparkline plots by time and the range gave the bounds, but "3
  observations, £8.00 to £120.00" could not say whether the £120 was last week
  or three years ago, nor which observation was new or used.

  Each observation now reads `2026-08-12  £120.00  what someone wanted — nobody
  paid this`.

  **The type is EXPLAINED, never labelled**, and this is the same rule as §7.6's
  value sentence: "Asking" alone does not say that nobody paid it, which is the
  entire point of the type. A bare enum label would reintroduce the `best_dig`
  problem in a new vocabulary.

  **Found by screenshot after the fix**: "Latest price £120.00 asking" sat
  directly beside "PAID £8.00" in the Acquisition section — still a raw enum,
  and the juxtaposition invites reading the record as worth £120. Now uses the
  same `priceTypeMeaning`. **The QA finding named the observation list; the
  same defect was one section up.**

- ~~`manage.spec.ts` "moves a genre under another" failed intermittently in full
  runs — survived four investigations and a quarantine.~~ **Diagnosed and fixed
  2026-08-12: the cause was `workers`, not the test, the component, or
  hydration.**

  Playwright's default is roughly half the cores — ~6 on this 12-core machine —
  and all of them drive ONE dev server. Measured across full runs:

  | workers | result |
  |---|---|
  | default (~6) | 1-6 failures per run: `manage` timing out at 30s, `ECONNRESET` on setup POSTs across four other files |
  | **3** | **278 passed, zero failures, zero flaky, twice** |

  `ECONNRESET` is the server refusing connections it cannot accept; the 30s
  timeout is the same saturation reaching the test that does the most
  sequential round trips. **Wall clock is unchanged** (~4.9m vs ~4.6m) — the
  bottleneck was the server, so extra workers bought contention, not throughput.

  **Why it survived four attempts: every one looked at the test and the
  component.** The failure named `manage`, so `manage` was investigated. The
  cause was one line of harness config, and nothing about the symptom pointed
  at it.

  **My hydration lead was WRONG, and the way it nearly stuck is the entry worth
  keeping.** `GenreTree` and `ResourceTable` do have unmarked controlled inputs,
  which made the theory plausible. I built a forced-race reproduction and it
  failed **8 of 8** — apparently decisive confirmation.

  It was my own locator. The genre tree renders `listitem`; my probe used
  `getByRole('row')`, which matches nothing there. Every "0 rows" reading —
  including four timing measurements at 500ms to 6s that looked like proof the
  refresh never lands — was the locator, not the app. With the correct locator,
  the same forced race shows the row present.

  **The rule: a reproduction that confirms your hypothesis needs the same
  scrutiny as one that refutes it.** I verified the failure was deterministic
  and did not verify the assertion could ever pass. The cheap check, before
  trusting a red reproduction: **make it green once** — against known-good
  conditions — so you know the locator and the assertion work at all.

  Related and now separated: the probe that "proved" the POST never refreshed
  actually showed `posts: 1` and a 201 with the right name. The write was always
  fine. Reading that carefully is what broke the theory open.

  **Retries measured, not assumed.** With 3 workers and `retries: 0`, a run
  still failed one spec — so the retry stays, and what it now covers is the
  hydration class (a real property of the app) rather than harness load.

- ~~The §7.6 stats hazard: one record legitimately shows two different prices,
  and a bare total would read as an arithmetic bug.~~ Built around rather than
  captioned, step 9 unit 4, 2026-08-12.

  The figure and its meaning are ONE sentence, produced by
  `estimatedValueStatement`: *"Estimated value of what is on the shelf: £242.10,
  using each record's most recent second-hand price — or its new price, or what
  you paid, when that is all there is."* There is no arrangement of the page
  that shows the number without the rule.

  **Why not a caption:** a bare £X with an explanation underneath is a number
  people quote back at you having not read the explanation.

  **Four things the tests pin that a looser wording would lose:**
  - the WHOLE fallback chain, not just its first link — naming only the used
    price describes a smaller sum than the one shown;
  - the word "estimate", since most of these prices come from Discogs and §5.7
    calls that a starting point, never proof;
  - **never "best dig"** — it is a `price_type` in §4.2 and NOT in §7.6's chain,
    and CLAUDE.md §8 forbids conflating it with any price. This is the copy
    where that confusion would be most expensive;
  - zero reads as *"cannot be estimated"*, not £0.00 — the collection is not
    worth nothing, nothing is known about what it is worth.

  Spend is worded as a FACT ("total paid"), never an estimate: the two sit side
  by side and the pair would otherwise read as profit.

  **`byLabel` was in §5.2's amended response shape and missing from the query.**
  The documented shape said one thing and the endpoint returned another. INNER
  JOIN, like `byStore` — measured directly against Postgres, a LEFT JOIN yields
  a null-named group, which would render as a shelf category called nothing.

  **`formatTotal` added alongside `formatPrice`**, grouping thousands by string
  manipulation: `formatPrice` deliberately avoids floats because
  NUMERIC(10,2) → float is the precision loss the column type exists to prevent,
  and `toLocaleString` would reintroduce it. Row prices are rarely four digits;
  a collection total is.

  **A shared-state race between two of my OWN tests**, worth the entry: an
  E2E test asserting the zero branch guarded with `test.skip(estimatedValue >
  0)`, and another test in the same file seeded a priced record between the
  guard and the assertion. Check-then-act, at spec scope. Removed rather than
  retried — `value-statement.test.ts` covers both branches directly because it
  chooses its own input. **A test that is usually right about shared state is
  worse than no test: it teaches you to re-run.**

- ~~`price_history` had no write path.~~ Step 9 unit 3, 2026-08-12.

  `POST /api/records/:id/prices` per the amended §5.2, plus §10's sparkline.

  **The append-only rejection is the load-bearing part**, and it was
  mutation-verified specifically: an endpoint that accepts an `id` and appends
  anyway fails **2** tests. §7.5's guarantee — "never UPDATE a price_history
  row" — is only meaningful if a correction is a DELIBERATE new observation. A
  client sending `{ id, price }` believes it is editing; appending would raise
  the row count, satisfying any test that checks only that, while leaving the
  client's model of history wrong. `.strictObject` is what produces the 400, and
  here it is a rule rather than housekeeping: `id`, `recordedAt` and `priceId`
  are exactly the keys someone reaches for when trying to correct a row.

  **The query layer cannot express an update**, deliberately — `appendPrice` and
  a list, no update, no delete. A layer that offered one would make §7.5 depend
  on every caller remembering it.

  **Third copy of the money regex avoided.** `create-schema.ts` and the Discogs
  import already carried `/^\d{1,8}(\.\d{1,2})?$/`; this would have been the
  third. Extracted to `moneySchema` — two definitions that agree today are how
  they drift, and the coercion class means the regex IS the validation
  (`z.coerce.number()` reads `'5e4'` as 50000).

  **Sparkline decisions, each mutation-verified:** plotted oldest-first (query
  order would draw a rising price as falling — the most misleading thing this
  chart could do), spaced by TIME not index (six years and two days are
  different histories), and the range compared numerically (`'9.00' > '35.50'`
  as text). The bounds are stated in words beside the shape: a sparkline shows
  a trend and says nothing about scale.

- ~~`a year range keeps undated records` failed in full runs and passed alone —
  cleared as unrelated TWICE before being diagnosed.~~ Fixed 2026-08-12.

  It asserted against the whole collection filtered only by year. Every other
  spec's records land in the same table, records from 1980-83 belonging to other
  runs fall inside the range, and at 50 per page this run's rows drop off page 1.

  **The same pagination collision as `clicking the active chip clears it`**,
  fixed in the flake unit — and this test was missed then because its failure
  MOVED between runs while the chip's stayed fixed. Seven tests in that file
  scope by `artistId`; this one did not.

  **The process failure is the entry worth keeping: I cleared it twice.** Both
  times it passed 3/3 in isolation and I concluded "no mechanism connects it to
  my change". That reasoning was correct and irrelevant — the mechanism was
  another spec's fixtures, which no amount of isolated re-running can reveal.

  **The rule: "passes alone" is evidence about isolation, never about
  correctness under load.** When a test fails a full run and passes alone, the
  next question is what SHARED state it asserts on — not whether the current
  change could have caused it. Already recorded for `db.execute` and shared
  rows; this is the third instance and the first where the delay was mine.

- ~~The journal's add-entry form lost typed text on mobile.~~ Found and fixed
  within step 9 unit 2.

  Its inputs are CONTROLLED, so a value typed before hydration never reaches
  React state — `add()` saw an empty note and refused it. Measured with a probe
  rather than assumed: the textarea held `"probe note"` while the guard fired.

  Fourth component to need `data-hydrated` after `RecordForm`,
  `CollectionFilters` and the login page. **The pattern is now predictable
  enough to apply on sight: any new controlled form in this app needs the
  marker, and its spec needs the wait.** Adding it while writing the component
  costs nothing; discovering it costs a mobile-only failure that looks like a
  save bug.

- ~~Discogs `notes` were "dropped by both import paths".~~ **Not a defect. My
  report was wrong and the correction is the finding**, 2026-08-11.

  §6's field mapping does not include `notes`. It maps title, artist, label,
  catalog number, year, country, format, matrix and genres — and stops. I
  measured "dropped" against a mapping I had assumed rather than the one the
  spec states, and the developer accepted it without checking either.

  **The two fields also mean different things.** Discogs' notes on release
  381756 read: *"Front sleeve note: 'Pay no more than £3.99'. Gatefold sleeve
  with lyrics. Original sound recording by Clay Records. Publishing
  Clay/Intersong © 1982"* — the RELEASE, true of every copy pressed.
  `records.notes` is the user's note about THEIR copy.

  Prefilling would have created the §7.8 problem rather than solving one: "never
  overwrite user-entered data with external data" requires knowing whose text it
  is, and a prefilled field the user later edited is indistinguishable from one
  they wrote.

  Shipped instead: the step 7 matrix treatment — reference text beside an empty
  field. Nothing dropped, nothing claimed. See the release-versus-copy rule
  under Open.

  **Second time in two units that a reported defect was an assumed spec.** The
  other was `format.text` "already in the versions payload". Both were caught by
  reading the authority — §6's mapping, the actual payload — rather than by
  reasoning about what seemed natural.

- ~~`format.text` would separate the identical Hot Tuna versions.~~ **My own
  claim, and it was wrong.** Corrected by measurement before building on it,
  2026-08-11.

  I reported that `format.text` carries "Rockaway Pressing" and is "already in
  the versions payload". The first half is true — of the RELEASE endpoint. The
  versions endpoint has no `text` field at all; its keys are `id, label,
  country, title, major_formats, format, catno, released, status, resource_url,
  thumb, stats`.

  **The error was reading one payload and generalising to another.** I saw
  `format.text` while diagnosing release 1458122 and carried it across to a
  different endpoint without checking. Caught only because the instruction was
  to measure it against the four rows before committing — building on it first
  would have produced a column that is `undefined` for every row.

  **The check: when a field is observed on one Discogs endpoint, confirm it
  exists on the endpoint that will actually be called.** The two payloads
  overlap enough to make the assumption feel safe and differ enough to break it.

- ~~Discogs genres were invisible on the form, though they attached on save.~~
  QA finding on the Hot Tuna import, fixed 2026-08-11.

  The consolidation fixed the SAVE — the import transaction derives genres from
  the release — so chips appeared afterwards. But `new/page.tsx` passed
  `genreIds: []` for the Discogs path, and the form renders a checkbox per
  EXISTING genre row: an unmatched genre is not merely unselected, it is
  **unselectable**.

  **That defeats §5.7's two-stage flow at its purpose.** The point of stage one
  is that the user verifies and corrects before committing; a field they cannot
  see cannot be verified. A record filed under "Rock" and "Blues" when the user
  would have chosen "Blues Rock" alone is CLAUDE.md §8's flattening concern
  arriving through OMISSION rather than error — no wrong value is written,
  the user simply never gets a say.

  `findOrCreateGenresByName` now runs at prefill. **The judgement call**: the
  prefill deliberately does NOT create artists or labels, because abandoning
  the form would leave debris and the inline-create box answers it there.
  Genres have no inline create, so creation is what makes them selectable at
  all — and the debris is far cheaper: a name in a small reference table,
  visible in /manage and deletable, versus an artist anchoring a record's
  identity.

  **The regression guard's blind spot, which is the transferable part.** The
  guard drove the real form and passed while the Genres row was empty, because
  it asserted POST-SAVE state and the endpoint derives genres regardless of
  what the form sends. **A test that checks only the outcome cannot see a
  two-stage flow's first stage.** It now asserts the checkboxes are checked
  BEFORE saving; reverting the prefill to `genreIds: []` fails it with a message
  naming the field.

- ~~`DELETE /api/records/:id` had no UI.~~ Added 2026-08-11, its own unit.

  The endpoint shipped in step 5 and nothing could reach it — the same
  unreachable-path shape as `/api/discogs/import`, though here the consequence
  was only a missing feature rather than a silent data loss.

  §7.3's confirmation rule was written about the want list and carries: "the UI
  must make the consequence legible before it happens — a confirmation naming
  what is lost, not a bare delete button." A record costs MORE than a want-list
  entry: images, journal entries and price history cascade (§4.2), and the
  purchase price, date and store are hand-entered and unrecoverable.

  The message is a pure function (`deleteConsequence`) rather than a string in
  the component, because the WORDING is the decision — a component test would
  confirm whatever string the component held. It counts only what exists: "0
  images and 0 journal entries" is noise, and this sentence is the only warning
  before an irreversible action.

  **The 409 is surfaced specifically**, not as a generic failure: the record
  fulfils a want-list entry (§7.3's acquisition history), and "could not
  delete" would leave the user with nothing to act on.

  **A shared-component defect found by screenshot, not by any assertion:**
  `DialogTitle` had no padding for the absolutely-positioned close button, so a
  title long enough to reach it rendered UNDERNEATH it. Every dialog had this;
  it only showed here because a delete confirmation names the record, and
  record titles are long. Fixed at the source (`pr-6`, and `leading-snug` so a
  wrapped title does not clip its descenders) rather than worked around
  locally, and the other dialog users re-run to confirm no regression.

  **A mutation-testing error worth keeping:** the first two mutations both
  reported "2 passed" against a "3 passed" baseline — a test had DISAPPEARED
  from the filtered set rather than failed, because `-g` matched different
  tests as the messages changed. Re-run against the whole spec file, they show
  9 → 8 and restore to 9. **A mutation whose test COUNT changes is not a
  result; fix the set before reading the number.** Same family as the
  dirty-baseline rule.

- ~~Imported records had no genres, because the form never called
  `/api/discogs/import`.~~ QA finding, consolidated 2026-08-11.

  §6's mapping was implemented correctly and its tests passed. **Nothing called
  it.** The lookup screen links to `/records/new?discogsReleaseId=`, whose
  prefill reads neither `genres` nor `styles`; the form then posted to
  `/api/records`. Verified against the dev database: every imported record had
  `genre_count: 0`, and the `genres` table held one hand-created row.

  **The fix is what §5.7 already specifies**, not new behaviour: "the client
  renders it into the form; the user verifies and corrects; **only then is
  `/api/discogs/import` called with the user's edited values in `overrides`**."
  The form was skipping stage two. Teaching the prefill seam to duplicate genre
  find-or-create would have created the second implementation the spec avoids.

  **The two paths were not duplicates**, which a field-by-field comparison was
  the only way to see:

  | | prefill (live) | import (dead) |
  |---|---|---|
  | genres / styles | ✗ | ✓ |
  | format matching | ✓ | ✗ |
  | master-year fallback | ✓ | ✗ |
  | cover fetch | ✓ | ✗ |
  | notes | ✗ | ✗ |

  So neither could be deleted in favour of the other. The consolidation added
  `formatId`, `storeId`, `labelId`, `genreIds` and `tagIds` to the import's
  override surface, and moved the cover fetch onto that route.

  **A second defect found while wiring it: the import sent
  `discogs_release_id` unconditionally**, even against a corrected catalog
  number — while the form path applied `discogsIdToSubmit` for exactly that.
  §7.6's rule implemented in one place and not the other. Since
  `discogs_release_id` is unique and pressings are SHARED, keeping it on a
  corrected pressing either discards the correction or writes it onto every
  record matching the release. The rule is now one exported function
  (`contradictsDiscogs`) used by both.

  **Three E2E specs then failed deterministically, and the cause is a rule
  worth keeping.** They assert an artist and label are UNMATCHED — a claim about
  the whole database. Once the form began importing, any spec saving release
  381756 find-or-created "Discharge" and "Clay Records". Moving them to 27522408
  failed too, because the matrix test SAVES that release. They now use 12856557,
  which is opened by nobody and saved by nobody.

  **The distinction that took two attempts: reading a release creates no rows;
  only SAVING does.** When choosing a fixture for an absence assertion, check
  which specs save it, not which mention it.

  **The regression guard the codebase lacked** is now
  `discogs-prefill.spec.ts`'s "carries its Discogs genres onto the collection
  screen": form → import → `record_genres` → chips on screen, asserting
  `['Hardcore', 'Punk', 'Rock']`. Reverting the routing to `/api/records` fails
  it. No integration test could have caught the original bug, because the gap
  was that nothing called the code they tested.

- ~~Cover storage failed with a valid token, and the log said only "The image
  could not be stored."~~ QA finding, diagnosed and fixed 2026-08-11.

  **The cause: the Blob store was configured for PRIVATE access, and `put()`
  hardcodes `access: 'public'`.** The SDK's own words were
  `Vercel Blob: Cannot use public access on a private store.` — which named the
  problem exactly, and which nothing ever printed.

  Resolved by switching the store to public. **A private store would have needed
  more than an access flag**, and this is worth knowing before anyone tries it:
  a private-store upload SUCCEEDS, but its URL returns **403 to anonymous
  readers** — verified. Storing that URL writes a row whose image renders as
  broken, which is the "row pointing at a dead blob" failure the delete ordering
  exists to avoid, arriving from a new direction. Making it work needs
  `presignUrl` at render time and signed URLs that expire, so `images.url` would
  no longer be directly usable.

  **The real defect was the swallowed cause, and it was mine.** `createBlobStorage`
  wrapped the SDK error and attached it as `cause`; `attachDiscogsCover` logged
  `cause.message`, which is the WRAPPER's sentence. The chain existed and
  stopped one frame short of the only place it mattered.

  `describeError` now walks the chain (`a ← caused by: b`), bounded at 5 links
  and 600 chars, cycle-guarded. Wired into `attachDiscogsCover` AND
  `withErrorHandling` — the sweep found the same defect one layer up, affecting
  every route: a wrapped error logged its message and stack but never its cause.

  **Logs only.** §5's shape is what reaches a client, and a cause chain there
  would leak deployment detail — asserted, since the SDK's message can contain
  token fragments.

  **A cycle test that proved nothing, caught by mutation.** The first version
  asserted `describeError` returns on a self-referencing cause — but `MAX_LINKS`
  already guarantees termination, so removing the `seen` set passed it. It now
  asserts the exact output (`'a ← caused by: b'`) and that each link appears
  once. Same lesson as the primary-image fixture: **when two mechanisms provide
  overlapping guarantees, a test must isolate the one it names.**

- ~~A failed cover fetch left no signal on screen.~~ Same QA pass, fixed
  2026-08-11.

  Unit 4 correctly never fails the import — but **never failing is not the same
  as never telling.** The record saved, the gallery was empty, and nothing
  distinguished "Discogs had no cover" from "we tried and could not". The second
  is retryable, and the user might otherwise photograph a sleeve they did not
  need to.

  `?cover=failed` on the redirect, rendered as a notice on the record page.
  Carried through the URL because the form navigates immediately — a message set
  in component state would unmount before anyone read it.

  **Only on `reason: 'failed'`, never on `'none'`.** A notice on every coverless
  record trains the user to ignore the one that matters. The discriminating test
  asserts the notice is ABSENT for a release with no images — without it, a
  notice shown always would pass the positive test.

  **Cost, found by the full-suite gate:** two specs asserted
  `toHaveURL(/\/records\/<uuid>$/)` and the query param broke the anchor. Both
  are genuine Discogs imports whose cover fails in this environment, so the app
  was right and the anchors were relaxed to `(\?|$)`. Only two — I initially
  grepped ten candidates and inferred the blast radius from file names rather
  than measuring it.

- ~~A missing `BLOB_READ_WRITE_TOKEN` made every upload return "Internal server
  error".~~ Found in the step 8 QA pass, fixed 2026-08-11.

  Measured before and after, on the real screen:

  | | Status | What the user reads |
  |---|---|---|
  | before | 500 | `Internal server error` |
  | after | **503** | `Image uploads are not configured. Add a Vercel Blob store to enable them.` |

  A 500 says "our code broke" and sends the reader to application logs; a
  missing credential is a DEPLOYMENT problem the app can detect and name. Third
  instance of the family — the no-live-calls guard returned 500 for a rule
  working exactly as designed until it was given a status of its own.

  **The token stays optional**, deliberately: §10's in-store case wants the app
  usable without every integration configured, and a developer running it
  locally has the same claim. The cost of that choice is that each absence must
  be detected where it is USED — `isBlobConfigured()` does it for uploads, and
  step 12 owes the same for `ANTHROPIC_API_KEY`.

  The check runs BEFORE the request body is read: a 10MB photo on a phone
  connection should not be transferred in full only to be told the server was
  never able to store it. The message never names the variable — it reaches a
  browser, and which credential is absent describes the deployment's shape.

  **A decorative test caught by mutation, worth keeping.** The first version of
  "checks configuration before reading the body" sent a bad payload and asserted
  503 — which passes with the check placed anywhere before payload validation,
  so a mutation moving it after `file.arrayBuffer()` **failed zero tests**. It
  now instruments the request's own `formData` and asserts the body was never
  read; the same mutation fails 1. The NOTES check applies exactly: would this
  assertion produce a different result if the property it names were wrong?

  Also corrected: the schema comment read "not required until build steps 12 and
  8 respectively" — true when written, false once step 8 shipped. **A dated
  claim in the very file that enforces it**, the same shape as a placeholder
  assertion. It now states why they are optional by design.

  **Test-setup consequence worth knowing:** the upload and delete suites seed
  through the endpoint, so both now stub `isBlobConfigured` to true. Stubbed
  rather than setting a fake token in `process.env` — a fake credential there is
  one edit away from being mistaken for a real one.

- ~~The login page had no `data-hydrated` marker, making it the largest single
  source of E2E flake.~~ Fixed 2026-08-11, its own unit.

  `login()` typed a password into a CONTROLLED form before React hydrated. The
  keystrokes reached the DOM and never reached state, so `onSubmit` saw `''` and
  rendered "Enter the password" with the field looking full. Every spec goes
  through `login()`, so when it fired it failed whole FILES at once and each
  failure named whatever feature that spec was about — one run produced 33
  identical `toHaveURL` failures across 8 files, none related to the features
  they named.

  **The reproduction is the transferable part.** The flake was intermittent
  enough that three consecutive green baseline runs proved nothing. Racing it
  deliberately made it deterministic:

  ```ts
  await page.goto('/login', { waitUntil: 'commit' });   // returns AT the window
  await page.getByLabel('Password').pressSequentially(PASSWORD, { delay: 0 });
  ```

  | | 8 parallel attempts |
  |---|---|
  | before | **8 failed** |
  | after | **8 passed** |

  `waitUntil: 'commit'` is what does it — it returns as soon as the navigation
  commits, which is exactly the pre-hydration window. **For any
  hydration-sensitive flake, this converts "sometimes" into "always" and makes
  a before/after measurement possible.** Kept as a committed regression test in
  `auth.spec.ts`; mutation-verified by removing the marker.

  Full-suite effect, measured: mobile-only went from **9 failed results** to
  **0-1 flaky**, and a full run from 6.9m back to ~4m. What remains is one
  unrelated test (`manage.spec.ts` "moves a genre under another"), which is the
  separately-diagnosed slow `router.refresh` + PATCH case.

  **Out of scope, worth doing later: `login()` is copy-pasted into TWELVE spec
  files.** Fixing this meant editing all twelve. A shared helper in `e2e/seed.ts`
  or similar would have made it one edit — noted rather than done, since the
  refactor touches every spec and belongs in its own unit.

- ~~E2E #9's first version stubbed the browser's POST and proved nothing.~~
  Found and corrected within step 8 unit 3, 2026-08-11.

  The gallery is SERVER-rendered, and `router.refresh()` re-fetches from the
  server. Intercepting the browser's upload with `page.route` returned 201 to
  the client, wrote no row, and the server then correctly rendered "no images
  yet" — so the assertion failed and **read exactly like a broken gallery**. The
  stub was on the wrong side of the thing under test.

  **The rule: a stub must sit between the code under test and its dependency,
  not between the test and the code.** For anything server-rendered, a
  browser-level route stub is outside the boundary — it intercepts a request the
  server never sees. Seed the database instead (`seedImage` in `e2e/seed.ts`).

  Found by probe rather than reasoning: the stub logged as hit, the row count
  stayed zero, and that pair named it in one run. The gallery was correct
  throughout.

  **THE PAIR, and the reason this is a class rather than an incident: the same
  server-versus-client confusion produced two OPPOSITE symptoms.**

  | | Step 7 | Step 8 unit 3 |
  |---|---|---|
  | Stub | `page.route` on the Discogs API | `page.route` on the upload endpoint |
  | Symptom | a live call that should NOT have happened | a call that did not happen when it SHOULD |
  | Read as | the guard failing | the gallery failing |
  | Actually | the stub never covered server components | the stub never covered the server render |

  Both times the stub sat in the browser and the code under test ran on the
  server, so the interception was invisible to it. One leaked outward, one
  starved inward; the cause is identical. **Before writing a `page.route` stub,
  ask which process makes the request.** If it is the server, the browser-level
  stub is decoration — seed the database or inject at the module seam instead.

  Two smaller traps in the same unit, both worth keeping:

  - **`db.execute` returns a driver result object, not an array.** `const [row]
    = await db.execute(...)` throws "is not iterable". Use Drizzle's typed
    `.insert().returning()`, which also survives a schema change.
  - **`innerText` returns text as RENDERED, so `uppercase` styling reaches the
    assertion.** A heading reading "Cover" in the DOM comes back "COVER". The
    fix is comparing case-insensitively when ORDER is what the test is about —
    the same `innerText`/`textContent` gap as the collection-widths rule, seen
    from the other side: there it hid a defect, here it invented one.

- ~~`renders a record that has only the required fields` asserted the Images
  heading was ABSENT.~~ Updated in step 8 unit 3.

  A placeholder from step 5 — "sections for the parts that are not built yet
  (steps 8 and 9)" — that became false the moment the gallery shipped. It failed
  deterministically on both projects and both retries, and the **full-suite
  rule added to CLAUDE.md §10 the same day caught it**: the unit's own spec file
  was green.

  Replaced with the real assertion rather than deleted: the gallery IS present
  on a record with no images, unlike the Pressing section, because it is also
  the upload control — hiding it would leave no way to add the first image. The
  Journal line stays at `toHaveCount(0)` until step 9.

  **The pattern: a placeholder assertion is a dated claim.** "Not built yet" is
  true until the step that builds it, and nothing marks which step that is. Both
  instances so far were found by a full-suite run, not by the unit that made
  them false.

- ~~`saves what the user confirmed` failed deterministically once another spec
  imported the same release first.~~ Found in step 8 unit 2's full-suite gate,
  fixed 2026-08-11. **The app was correct throughout; the test asserted
  something §4 makes impossible.**

  It imported release 381756, corrected the matrix, saved, and expected the
  saved pressing to carry its value. But `pressings` are SHARED and
  found-or-create (§4), and SPEC.md §7.6 says a row carrying a
  `discogs_release_id` is *the* row for that release — user edits deliberately
  do not win on it, because that would "write one person's correction onto
  every record that matches the same release".

  `lookup-flows.spec.ts` imports 381756 too. Whichever spec ran first created
  the pressing; the second attached to the existing row and read back the
  first's matrix. The test passed for as long as it happened to run first.

  Fixed by giving it release 27522408 (`release-no-matrix`), which nothing else
  imports, so the pressing is its own.

  **THE FIXTURE RULE THIS ESTABLISHES, wider than the existing suffix rule: a
  spec asserting on a SHARED row must use a key no other spec can produce.**
  The suffix convention already covers rows keyed by name. It does not cover
  `pressings`, which are keyed by `discogs_release_id` or
  `(catalog_number, country_pressed, year_pressed)` — a Discogs fixture id is
  shared by every spec that imports it, and no suffix can separate them. Before
  asserting on a pressing, check which other specs import that release.

  **Why it read as flake for one run:** the failure moved between full runs
  because which spec ran first moved. The rule from the flake unit still
  applies and is worth restating — apply the moving/fixed test to the TEST, not
  the run. Here the same test failed on both projects and both retries with a
  byte-identical message, which is fixed, whatever else was failing around it.

- ~~The matrix/runout field was prefilled with every runout Discogs holds.~~
  Changed 2026-08-10, on the approved design decision.

  Release 381756 carries EIGHT Matrix / Runout values spanning FOUR documented
  pressings. Joined into one field they produce a fingerprint describing no
  physical object — in the field §4 calls "the true pressing fingerprint" and
  CLAUDE.md §8 calls user-authoritative. §5.7 is explicit: "frequently missing
  or partial. **Always let the user hand-enter it from the dead wax.**"

  A prefilled field also reads as VERIFIED, which inverts the instruction: the
  one field the user is meant to read off the record arrived looking already
  answered.

  The field now starts empty and the variants render beside it as reference
  (`matrixReference`, `data-testid="matrix-reference"`). Nothing is dropped —
  all eight are shown, since a user comparing wax to screen wants the list. The
  match key is unaffected (matrix was never in it, §4) and `discogsIdToSubmit`
  still keeps the pressing id when the matrix is edited (§7.6).

  **A `Row` gained an `after` slot for this.** First attempt rendered the
  reference between the input and its hint, splitting the field from its own
  instruction — visible only in the screenshot, not in any assertion. The rule
  the slot encodes: supporting detail goes BELOW the hint; the instruction stays
  adjacent to the control it instructs.

- ~~The collection list dropped the label between 640 and 767px, rendering it
  the way it renders "not recorded".~~ Found by QA, fixed 2026-08-10.

  The table hides columns at narrow widths and reprints them in a summary line.
  Sound only while the two are exact complements — and they were not. The
  summary was `sm:hidden` (gone at 640) while the label column was
  `hidden md:table-cell` (arriving at 768). **Between 640 and 767 the label was
  in neither.**

  Worse than a missing column, and this is the reason it ranks: the table draws
  absence as `—`, meaning "not recorded". A value dropped by the LAYOUT is
  indistinguishable from a value the user never entered — the confidently
  misleading failure CLAUDE.md §8 ranks above the obviously broken one. Another
  instance of the absence-as-success family (now 5+).

  **The rule, generalised: a responsive summary line must hide at the WIDEST
  breakpoint of any column it stands in for, never the narrowest.** Encoded in
  `CollectionList.tsx`. Format was additionally promoted to a column at all
  widths — two or three characters, highly scannable, costs nothing.

  **Two process notes.**

  1. **The first version of the test passed at all seven widths, including the
     broken one.** It used `toContainText`, and both the hidden column and the
     hidden summary line remain in the DOM — Tailwind hides with
     `display:none`, and `textContent` returns hidden text. The test would have
     passed whatever the layout did: the decorative shape CLAUDE.md §2 names.
     Fixed by asserting `innerText`, which respects `display:none`. **Any test
     about what the user can SEE must read `innerText`, never `textContent`.**
  2. **Testing only 390 and 1280 would have missed this entirely** — both pass.
     The gap lived between the two habitual widths. `collection-widths.spec.ts`
     sweeps 375/639/640/700/767/768/1280 for that reason.

- ~~An unmatched Discogs label was silently dropped, and the only recourse was
  to leave the form.~~ Found by QA, fixed 2026-08-10.

  "Match, never create" is right — a prefill is not a commitment, and creating
  rows for an abandoned form leaves debris. But the near-miss was rendered as
  prose telling the user to go to /manage and re-import, losing everything
  typed. **On a new collection nothing matches, so every import lost its
  label.** Confirmed against the database: the imported row had `format_id` and
  `release_year` populated and `label_id` null.

  `InlineCreate` now takes a `suggestion` that opens the box with the name in
  it. Nothing is created until the user clicks Add, so the principle is intact;
  the dead end is gone. Initial state rather than an effect — syncing would
  fight the user's typing on re-render.

  **Scope, deliberately narrower than "wherever a prefill matches nothing":**
  artist and label only. **Store has no Discogs source at all** — Discogs
  cannot know where you bought a record, so `unmatched` has no store field and
  inventing one would be worse than the dead end. **Format is a controlled
  vocabulary**, not an open set; "choose the closest" is the correct
  instruction for a fixed list, and prefilling a create box would mean building
  inline create for it.

  Also verified: the QA report named four missing fields, and they were three
  different things. Year was never missing. Format was in the database and
  hidden by the layout bug above. Label was the save gap. **Condition is
  correct behaviour** — it describes the physical copy in your hands and no
  import can supply it.

- ~~`clicking the active chip clears it` failed every full suite run and was
  read as flake for three steps.~~ Fixed 2026-08-10.

  It asserted `toContain('Kind Of Blue')` against an **unfiltered** collection.
  The suffix helper filters the rows the page RENDERED — it cannot recover a row
  pagination never sent. At 68 accumulated records the 50-per-page cut dropped
  this run's record onto page 2, and the assertion read that as "clearing the
  chip did not restore the record". Alone, the collection fits one page and it
  always passed. Fixed by scoping to the spec's own `artistId`, which the
  pagination specs already did; `q=<suffix>` also isolates but writes to the
  URL, and the URL round-trip is what this test is about.

  **Three process lessons, in order of how much they cost.**

  1. **A fixed failure hid inside a moving set.** The recorded rule — moving is
     flake, fixed is regression — was applied to the run and not to the test.
     This one failed 3 of 3 with an identical message while its companions
     rotated, so the set moved and the diagnosis followed the set.

  2. **The prediction test is what broke it open.** The recorded diagnosis
     (WebKit outrunning hydration, mitigated by `data-hydrated`) predicts the
     failures are typed text on unhydrated forms. Two of the six failing tests
     type nothing at all — one is a `goto` and an assertion. That mismatch,
     not more re-running, is what proved a second mechanism existed. Same move
     as discarding the Fast Refresh theory when its prediction failed.

  3. **Two wrong theories died to measurement, cheaply.** "Stale element
     handles under re-render churn" — the reader was instrumented for 25
     consecutive reads and never threw. "The app fails to refetch on clear" —
     probed directly and the app was correct, URL and rows both. The failing
     run's own page text (`Collection 68 records`) was what actually named it.

- ~~The no-live-calls guard returned 500 instead of 502, because moving it fixed
  the leak and broke the reporting.~~ Found closing step 7, fixed 2026-08-10.

  Security unit 5 moved `assertNoLiveCall` from inside the fetch wrapper to the
  request site to close the `createDiscogsClient` bypass. It closed it. But the
  new site was *before* the `try`, and the guard throws a plain `Error`, so it
  escaped `withErrorHandling` as a **500** — "our bug" — for a rule that was
  working exactly as designed. The guard's own E2E specs caught it by asserting
  the status rather than just the refusal.

  **The pattern, third instance: a fix verified on the axis it was about.** The
  unit asked "does the guard still fire?" and the answer was yes, on every path.
  Nobody asked what the caller now *sees*. Same shape as the tier-1 forgery
  (correct on both sides, wrong at the seam) and the `yearPressed` fix ("I
  applied the argument to releaseYear and never looked at the field beside it").
  A moved call site changes two things — whether it runs, and what catches it.

  The fix moved the guard inside the `try`, which produced the 502 and then
  *swallowed the message*: it came back as "Could not reach Discogs", sending
  the next reader to debug their network instead of reading the sentence naming
  the fix. Two guard tests failed on the message and were **not** relaxed to
  match — the message is the point. Final shape: the guard throws a
  `DiscogsError` with `status: 502`, and the transport rethrows an already-typed
  `DiscogsError` rather than re-wrapping it. **The second bug was introduced by
  the first fix and caught only because the tests asserted the message text as
  well as the status.**

- ~~Hierarchical genre filtering would show records whose badges never mention
  the filtered genre.~~ Resolved in the step 5 remediation by SPEC.md §5.2's
  `matchedVia`, decided BEFORE the collection screen rather than retrofitted.

  Once §7.1 was applied (unit 2), filtering by Punk began returning records
  tagged only `Oi!` or `Crust` — correct, and indistinguishable from a bug to
  anyone looking at the screen. The client could not explain it either: a
  record's `genres` array holds only its DIRECT tags, so the UI had no way to
  know Crust descends from Punk without fetching the whole tree and
  reimplementing §7.1 — the denormalization §7.1 forbids, relocated to the
  client.

  `descendants` is an ARRAY rather than a single path because a record can match
  through several descendants at once, and picking one arbitrarily flattens
  exactly the distinctions CLAUDE.md §8 exists to protect. It contains the
  filtered genre itself on a directly-tagged record, so it is never empty on a
  matched row.

  Implementation note worth keeping: it reuses `genreSubtree`, the same CTE the
  filter uses. Computed by a separate rule, the explanation could disagree with
  the filter that produced the row — a divergence that cannot be represented
  beats one that is merely tested.

- ~~A stray `next-server` on port 3000 collided with E2E runs.~~ No longer
  present (verified before step 5: nothing is listening on 3000), and it could
  not recur regardless — `playwright.config.ts` pins `E2E_PORT` to 3100 and sets
  `reuseExistingServer: false`, so a run never attaches to a server it did not
  start. The port choice remains deliberate; the observation itself is spent.

- ~~`records.condition_media` / `condition_sleeve` nullability was unconfirmed.~~
  Confirmed intended (before step 5): a record can be logged before it is
  graded, and requiring a grade at insert would block quick in-store entry —
  which §10 names as the primary mobile case. Nullable is the correct shape and
  step 5's record form must not make either field required.

- ~~`.env` / `.env.local` might diverge from `.env.example`.~~ Reconciled
  manually before step 5. Two corrections to the original entry, which was
  written without reading the files: `.env` does not exist at all (only
  `.env.local` does), and the variable names now match `.env.example` exactly
  apart from `BLOB_READ_WRITE_TOKEN`. That one is absent from `.env.local` and
  correctly so — it is `.optional()` in the env schema and unused until step 8
  (images), so boot validation passes without it.

- ~~Integration test files raced each other against the shared test database.~~
  Resolved in unit 1 (step 4). Latent since step 2 and invisible until a second
  integration file existed: every integration test truncates in `beforeEach`
  (CLAUDE.md §2), and vitest runs files in parallel by default, so one file's
  truncate landed inside another file's test. It presented as
  `TypeError: Cannot read properties of undefined` on rows that had just been
  inserted, in `test/integration/schema.test.ts` — a file unchanged by this
  unit — with a *different subset* failing on each run. `fileParallelism: false`
  in `vitest.config.mts` serializes files; `test/repo/integration-isolation.test.ts`
  asserts the setting via a spawned tsx probe and was mutation-verified.
  Serial execution is the cost of one shared database; if the suite gets slow
  enough to matter, the fix is a database-per-worker, not re-enabling
  parallelism.

- ~~`npm test` failed unless the caller exported `TEST_DATABASE_URL` inline.~~
  Resolved in unit 0 (step 4). `drizzle.config.ts` loaded `.env.test` for the
  CLI, but nothing loaded it into vitest's own process, so `test/global-setup.ts`
  threw before any test ran. The suite passed only because it was being invoked
  with the variable exported — CI would not have. `vitest.config.mts` now calls
  `config({ path: '.env.test' })` at module scope, mirroring the drizzle config.
  `test/repo/env-loading.test.ts` asserts on the outcome (a real spawned vitest
  process resolves a local URL with nothing exported and a remote `DATABASE_URL`
  ambient), not on the presence of the call; mutation-verified that removing the
  load fails that test *even when `TEST_DATABASE_URL` is exported*, so it
  constrains the config rather than duplicating the global-setup throw. dotenv
  does not overwrite an already-set value, so an explicit override still wins —
  covered by a second test.

- ~~`next dev` appended a generated agent-rules block to CLAUDE.md on every run.~~
  Resolved during step 3 (post-review). `next dev` writes the block to
  `AGENTS.md` when that file exists and hosts it, and skips CLAUDE.md entirely
  (`writeAgentFiles` in `node_modules/next/dist/server/lib/generate-agent-files.js`,
  lines 99–104). `AGENTS.md` now carries the block verbatim and points at
  CLAUDE.md and SPEC.md as authoritative. Verified by running `next dev` and
  confirming CLAUDE.md's checksum is unchanged; `test/repo/claude-md-integrity.test.ts`
  fails if this ever regresses. If a future Next version changes the block text,
  that suite will fail and AGENTS.md needs re-syncing — do not let the generator
  fall back to CLAUDE.md.

- ~~`next dev` rewrote tsconfig.json.~~ Resolved during step 3 (post-review):
  accepted as-is by developer decision. One semantic change — adding
  `.next/dev/dev/types/**/*.ts` to `include` — plus cosmetic one-item-per-line
  array formatting. The added directory does not currently exist and typecheck
  passes without it; `.next/` is gitignored, so it has no effect on a clean
  checkout. The rewrite is one-time, not recurring: a second `next dev` run
  leaves the file byte-identical.

- ~~SPEC.md §2 line 41 said driver selection was by `TEST_DATABASE_URL` /
  `NODE_ENV`, while the implementation used `TEST_DATABASE_URL` alone.~~
  Resolved: §2 was amended to mandate `TEST_DATABASE_URL`-only selection,
  empty-string-as-absent, and a throw on `NODE_ENV=test` with no test URL. Spec
  and code now agree.

- ~~SPEC.md §4.3 was silent on whether junction-table FKs cascade.~~ Resolved
  during step 2: §4.3 was amended with an explicit cascade rule and its
  reasoning — without it, `DELETE /api/records/:id` (§5.2) would fail on an FK
  violation. Reference rows remain protected by NO ACTION FKs on the owning
  tables, so §7.4's 409 behavior is unaffected.

- ~~SPEC.md §2 prohibited `node-postgres` while CLAUDE.md §2 required a plain
  Postgres path for the local test database.~~ Resolved during step 1: SPEC.md §2
  was amended to scope the prohibition to serverless production functions and to
  name `pg` as a devDependency for the local test path.

## Step 10 unit 4 — the version spread (§10a layer 3)

- **RULE: an assertion about absence needs a time dimension, or it cannot
  distinguish "did not happen" from "has not happened yet."**
  `expect(spreadCalls).toBe(0)` immediately after the result card rendered
  passed against a mutation that moved the spread fetch into a mount effect —
  the mount fetch had not resolved yet either, so 0 meant "not back yet"
  rather than "never asked". The assertion read like it guarded §10a's
  on-demand rule and guarded nothing. A settle window before the check is what
  makes zero mean absence.

  This is a distinct member of the assertion-that-cannot-constrain family
  already catalogued above, and the one most likely to recur: it applies
  ANYWHERE we assert something did NOT occur — no request fired, no row
  written, no email sent, no handler called. The others fail by measuring the
  wrong thing; this one fails by measuring the right thing too early.

- **RULE: three green instruments can all agree on a feature that was never
  built.** The spread's state and fetch were wired but no render block read the
  state. Typecheck clean, lint clean, the request demonstrably firing against a
  live endpoint returning 200 — and the feature absent from the page. Only an
  E2E test that looked at the DOM caught it.

  Static gates verify that code is consistent, not that it is reachable. A
  value computed and never rendered is well-typed, lint-clean, and invisible.
  When a unit ends in something a user is supposed to SEE, the test that proves
  it must assert on what is displayed.

  Corollary, from the same incident: my first diagnosis blamed the test stubs.
  The probe showed the request reaching the endpoint and returning 200, which
  ruled the stubs out and pointed at the render. Probe before theorising —
  recorded again because it worked again.

## Step 10 unit 4a — the market cache (§10a, "Where it is cached")

- **RULE: two routes writing one store must be tested against each other, not
  against each other's fixtures.** A mutation that mislabelled the spread's
  floor-only cache rows as carrying both layers survived every test in both
  endpoint specs. Each spec wrote its OWN fixture row and read it back, so
  neither ever saw what the other actually writes. The defect only became
  visible in a test that runs the spread and then requests the market for a
  version it priced.

  This is a THIRD kind of test gap, distinct from the two already recorded here.
  Layer tests prove a layer. Seam tests prove a join. This is two independent
  writers to one store, each honest about its own rows, DISAGREEING about what a
  row means — invisible to both suites because each read back only what it
  wrote.

  The cost of getting it wrong is the shape §10a exists to prevent: the spread
  fetches only `marketplace/stats`, so a row claiming the ladder too would make
  the market panel serve an empty condition ladder as a cached FACT for seven
  days, for a release layer 2 was never asked about. Hence `layersFetched` and
  `cacheCovers` — a floor-only row reads as a miss to anyone needing layer 2.

  **And the consequence is why this class deserves its own rule: a mislabelled
  cache row is absent-versus-unknown PERSISTED.** A wrong answer inside a
  request lasts one request. A wrong answer written to a store with a seven-day
  TTL outlives every attempt to notice it — the next reader sees a confident
  cached fact with no trace of the call that never happened.

- **Hand-writing a migration skips its snapshot.** `drizzle/meta/NNNN_snapshot.json`
  is generated, and a hand-written `.sql` plus a hand-edited journal leaves the
  chain without one. Caught by the fresh-clone test, which copies only
  git-tracked files — the untracked migration was absent while the journal
  referenced it. Use `drizzle-kit generate`, then rename the file and fix the
  journal tag; do not author the SQL directly.

- **A green migration is not proof against a dirty local database.** After the
  regenerate, `drizzle-kit migrate` failed with an empty error and exit 1
  because my earlier hand-run had already created `market_cache` while the new
  migration hash was unrecorded. Dropping and recreating the test database
  resolved it. When a migration fails with no message, suspect local state
  before suspecting the migration.

## Step 10 unit 5 — manual price entry removed (§10a, "What it replaces")

- **RULE: an absence assertion needs its precondition ON SCREEN.** The check
  that the empty-state copy no longer invites manual entry sat on a record that
  HAD a price, so the empty state never rendered and `not.toContainText` passed
  against a branch that was not there. A mutation restoring the old copy
  survived it. Fixed by asserting against a record with no prices, and by
  asserting the new copy is present as well as the old copy absent.

  Third variant of this family now: the first measured the wrong thing, the
  second measured too early (the mount-fetch), this one measured the wrong
  page state. Common shape — proving a negative requires proving the positive
  case was reachable.

- **§5.7 line 529 reads like a conflict and is not.** "Do not overwrite manual
  entries" presumes manual entries exist, which they will: rows already written
  stay, and the cron must still leave them alone. What §10a removed is the UI
  that CREATED new ones, not the historical rows or the protection.

- **The removal made the component a server component again.** No form means no
  state, no submit, no `data-hydrated` marker. Worth noting because the reverse
  move — adding one input to a display component — silently costs a client
  boundary and a hydration marker.

## RULE: a schema unit is not done until `db:migrate` has run against NEON

Twice now a step has looked complete — migrations clean from an empty local
database, full suite green — and then failed in QA because the deployed Neon
database was still on the previous schema. The local test database and Neon are
two databases; `npm run test` only ever proves the first one.

The test suite CANNOT catch this. It resets and migrates the local Postgres
every run, so the migration is always applied there by definition. Nothing in
the gates looks at Neon at all.

For any unit that adds or changes a migration, run `db:migrate` against the Neon
URL as part of the unit, and say in the report that it was run. Treat it as part
of the §10 definition of done for schema units, alongside "runs clean from an
empty database".

## QA round, step 10 — the outlier floor (recorded for the copy pass, not fixed)

A Japanese CD rendered: "1 for sale, cheapest asking $594.83. Discogs estimates
NM $73.31." The floor is EIGHT TIMES the top estimate — one optimistic seller
with the only listing — and the panel presents the two figures flatly, as though
they corroborate each other.

Neither number is wrong and neither is mislabelled; §10a's layers are doing
exactly what they promise. What is missing is the RELATION between them. Adjacent
placement implies agreement, and here they disagree by an order of magnitude —
which is itself the most useful thing on the panel, because it says "the only
copy listed is priced far above what Discogs thinks it is worth."

The shape to fix in the copy pass: when the floor exceeds the top ladder estimate
by a wide multiple, say so in words rather than leaving the reader to divide two
numbers. Related to the want-list "three money figures, each saying what it is"
work — same problem, one layer further out: it is not enough for each figure to
say what it is when their RELATIONSHIP is the finding.

Not fixed now because it is copy design on a closing step, and because the
threshold wants real data behind it rather than a guess.

## QA round, step 10 — two fixes

- **The version table badge was correct per row and wrong per table.** Verified
  with a probe against the real matcher: with one owned pressing among four
  version rows, the owned row returns `exact` and the rest return
  `different-pressing`. Every one of those was TRUE — §7.7's tiers were written
  for a single candidate, and in a version table every row shares the album, so
  every unowned row genuinely is a different pressing of something owned.

  The lesson is not about ownership. **A rule that is correct for one item can
  be noise when applied to a list of items that share the thing the rule is
  about.** The signal was carried by the ONE row that differed, and marking all
  of them destroyed it. §7.7 amended: state it once at the head, badge only the
  owned row.

- **"Withhold on partial" silenced layer 3 exactly where it mattered.** A price
  range only grows, so a partial sample already spanning a wide ratio cannot
  become narrow — the verdict is safe. The old rule withheld anyway, and
  combined with `MAX_VERSIONS_PRICED = 15` that meant every master with more
  than fifteen versions got silence. Those are the popular records. A caution
  that fires only on small masters never fires when it counts.

  Generalisable: **a safety rule keyed on "is the evidence complete" rather
  than "can the evidence change the answer" fails asymmetrically**, and it fails
  toward saying nothing — which reads as a broken feature rather than a careful
  one.

- **A `sed` mutation that fails to apply looks exactly like a surviving
  mutation.** Three mutations of the directional rule reported "20 passed"
  because `sed` rejected the `||` in the anchor and changed nothing. The
  anchor-not-found failure mode from the earlier LEFT JOIN finding, in a new
  disguise. Mutation scripts must ASSERT the anchor was found — the Python
  version does, and the three then failed 2, 4 and 5 tests.

## RULE: a real fix can be adopted for a wrong reason

The format hypothesis for the Carpenters spread was that 8-tracks and cassettes
were polluting the range. Measured against the live master (84975): unfiltered
11 priced, $0.80–$40.00, ratio 50.00. Vinyl only: 10 priced, $0.80–$40.00, ratio
**50.00**. Identical. Both endpoints are vinyl LPs — a 1971 UK `AMLS 63502` at
$0.80 and a 1971 South Korean `OLE-009` at $40.00. The non-vinyl versions were
two unpriced 8-tracks and a $13.18 cassette sitting mid-range, so removing them
moved neither endpoint.

Format filtering is still worth doing — the pollution is real, and filtering
BEFORE the cap buys 15 comparable versions for the same budget instead of 12.
But it does not fix the case it was justified by.

**The tell is that nobody checks whether the fix addressed the thing that
motivated it.** Filtering would have been adopted, the defect would have
remained, and the change would have looked like a success because it was
independently defensible. Whenever a fix is justified by a specific observed
case, measure that case before and after — the fix surviving on its own merits
is not evidence it solved the problem it was proposed for.

## Finding 3 (held): the spread answers a different question than the one asked

Recorded as a REFRAMING rather than a solution, because the solution is not yet
known.

The verdict currently answers: *"how much do prices vary across this master?"*
The question the user is actually asking in a shop is: *"is the pressing in front
of me better or worse than the ones I would realistically encounter?"*

A scarce territory pressing is a true answer to the first and irrelevant to the
second. Adam will never see a South Korean Carpenters LP in a shop, so a 50x
spread driven entirely by that one release is technically correct and practically
useless — it fires "pressing matters" on a record where, among the pressings he
could actually find, it does not.

**Not fixed, and deliberately not fixed by trimming.** An outlier rule tuned
against one known case is two guesses agreeing on one record, and `WIDE_RATIO` is
already the first guess. Per-row prices (finding 1) may dissolve this entirely by
making the outlier VISIBLE and self-explaining — the user sees a Korean pressing
at $40 beside a stack of $1-$3 LPs and draws the correct conclusion without the
verdict needing to encode it. Decide after seeing that against real data.

## QA round 2 — per-version prices and format filtering (measured)

**Filtering before the cap, verified against the live Carpenters master (84975):**
64 vinyl versions of 160 total. The cap now takes 15 VINYL versions rather than
the first 15 in Discogs order (12 vinyl, 3 other) — 12 priced instead of 11, for
the same fifteen calls. The three extra include a $65 US pressing the unfiltered
sample never reached.

**And it moved the ratio the WRONG way: 50x -> 81.25x.** The extra budget bought
more outliers, because on this master the expensive versions are all scarce
territory pressings (South Korea $40, Brazil $38.83, US $65) against common
UK/Canada copies at $0.80-$2.16. Filtering made the sample better and the verdict
worse — which is finding 3 restated, not a regression: the spread is faithfully
measuring a population the user will never shop in.

Recorded because it is the second measurement in two rounds where a defensible
fix did not improve the case that motivated it. See the rule above.

**Per-version prices do appear to dissolve it in practice.** With the column
rendered, the row list reads UK $0.80, UK $1.28, Canada $2.16, Australia $3.55 …
South Korea $40.00, US $65.00. The outlier is self-explaining: nobody reads that
and concludes their UK copy is bad. Worth deciding finding 3 against this rather
than against the verdict text alone.

**A Playwright route glob without a trailing `*` stops matching on a new query
param.** Adding `?format=` to the spread URL detached the stub from two older
tests that routed `**/spread`. Caught by running the whole spec file — the
cross-file break CLAUDE.md §10 describes.

**Corrected after measuring:** the first version of this entry said the tests
"passed against the real endpoint". They did not. Reproduced by reverting one
glob: the request reaches the route handler, `assertNoLiveCall` throws, and the
endpoint returns 502 `UPSTREAM_ERROR`, so the test fails loudly and NO live call
is made. See the guard entry below.

## The no-live-Discogs guard covers the detached-stub path (measured)

Question raised in QA: when a Playwright route glob stops matching, the stub
detaches with no error — do the tests then hit Discogs for real, and does the
guard catch it?

**Measured, not reasoned.** Reverted one glob to its stale form and requested the
unstubbed endpoint directly from a running E2E server:

    GET /api/discogs/master/50683/spread?format=Vinyl
    -> 502 {"error":{"message":"Could not reach Discogs. Try again shortly.",
            "code":"UPSTREAM_ERROR"}}

That is `assertNoLiveCall` throwing. The guard is armed in E2E because
`.env.test` points `DATABASE_URL` at localhost:5433 and the guard keys off the
DATABASE TARGET rather than a flag — the step-7 correction holding up under a
case it was not written for.

So the failure mode of a detached stub here is a LOUD failure, not a silent
live call. The guard is doing exactly what it exists for.

**What is still true and worth fixing separately:** a detached stub fails for the
wrong REASON. The test reports "element not found" rather than "your route glob
stopped matching", which cost a diagnosis cycle. The guard prevents the dangerous
outcome; it does not make the cause legible.

## RULE: a mock can fail by not answering, not only by answering wrongly

Alongside the mock-shape family already recorded here (a fixture that answers
every path identically; a fixture that does not discriminate between rules), this
is the degenerate member: **the mock stops answering at all.**

The tell is different from the others. A wrong-shaped mock produces confidently
wrong assertions; a detached mock produces assertions that fail for an unrelated
reason — "element not found", "timeout waiting for locator" — and sends you
looking at the component instead of the stub. Both times this has happened here
the first hypothesis was the render path.

Practical rule: when a UI assertion fails right after a URL or contract change,
check that the stub still MATCHES before investigating what it returns. A
`page.route` glob is a silent contract with the code under test, and query
strings, path segments and trailing slashes all break it without warning.

## WIDE_RATIO is unvalidated against a real negative case

Stated plainly because two rounds of measurement have now failed to confirm it.

`WIDE_RATIO = 3` was a guess, and the Carpenters master (84975) is the one record
where the answer is known — pressing does NOT meaningfully matter among the
copies a collector would actually encounter. Measured against it twice:

    unfiltered, first 15 versions   ratio 50.00   -> "pressing matters"
    vinyl-only, first 15 vinyl      ratio 81.25   -> "pressing matters"

The threshold fired on the wrong answer both times, and the strictly-better fix
made the number worse rather than better.

**This does not mean the threshold is wrong.** It means it has never been
confirmed against a real case where the verdict should be negative, and the one
candidate case fails it. Treat `WIDE_RATIO` as unvalidated rather than settled:
do not tune it against Carpenters (one case, and trimming to fit it would be a
second guess agreeing with the first), and do not cite it as tested. What would
settle it is a handful of masters with known answers in both directions —
collected from real use, not constructed.
