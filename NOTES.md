# NOTES.md

Out-of-scope observations recorded during build steps, per CLAUDE.md §4.
Most of this file is observations that have NOT been acted on; the exceptions
are the entries marked CORRECTED or RESOLVED, which record something that was
believed and turned out to be false. Each entry names the step it was noticed
in.

---

## CURRENT POSITION — read this first

**2026-08-25 — the three-findings lookup unit (QA from production use).**

Three defects found by using `/lookup` on production against a Doors pressing.
**Two fixed, one deliberately not built.**

| # | Finding | State |
|---|---|---|
| 1 | Format line dropped `formats[].text` — the plant qualifier | **Fixed** (`917836e`) |
| 2 | "Compare pressings" showed 25 of 637 master versions, excluding every candidate | **NOT BUILT — became step 14b** |
| 3 | Header copy claimed a cat number pins down a pressing | **Fixed** (`c35cbdb`) |

**Finding 2 is unbuilt on purpose and the panel is still wrong today.** It shows
page 1 of 26 of the master's version list, unfiltered, and says nothing about
the other 612 — for the Doors debut that is 25 rows all dated 1967 while the
user's 1979 reissue sits on page 7. It was reclassified as a build step because
scoping it to the search's candidates answers a DIFFERENT question than §5.7
specifies, which needs a spec amendment rather than a fix. §12 step 14b now
carries the full reasoning, including why filtering is the wrong answer (it
needs a year, and year is an output of identification, not an input — a
1967-filtered list is what hid the record).

**Do not read finding 1's fix as having solved pressing identification.**
Measured, and CORRECTED the same day after QA on the live page: the qualifier
appears on 53% of rows but names a pressing plant on only **24%**. The rest are
colour, sleeve and weight notes, which separate two cards on screen without
identifying either. The first figure recorded here (50% / 56%) counted
separation and called it identification — see the proxy rule below. The number
is in §5.7, and the two-phase matrix redesign now has written triggers rather
than an open deferral.

**The most reusable finding is fix 0, and it is about the suite, not the data.**
A captured fixture carrying `formats[].text` sat in the repo unread since
capture, populated on 10 of 12 rows, while the suite asserted against it the
whole time. Every assertion was a named-id lookup or a negative check — shapes
that can only confirm what the schema already knows. A new guard in
`normalize-search.test.ts` now fails when the payload contains a key that is
neither read nor listed as knowingly unread. See the over-correction rule below.

---

## PREVIOUS POSITION

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

- **MEASURED AND PROMISING: verification-by-display beats the matrix design on
  cost AND honesty. Measure stands; not yet built.**

  Proposed by Adam 2026-08-25 after the 24% plant-coverage number landed, and
  measured the same day on the SAME SIX ALBUMS so the figures are comparable.

  **The idea.** Search results cannot distinguish pressings — 24% plant
  coverage, 0% on Discharge. But RELEASE DETAIL carries `identifiers`
  (Matrix / Runout, Pressing Plant ID, Rights Society, Label Code), `companies`
  (Pressed By / Manufactured By) and free-text `notes`, none of which are in
  search payloads. Fetch detail for a small candidate set, DISPLAY those
  fields, and let the user's eye compare them against the record in hand.

  **No matrix INPUT is required**, and that is the whole point: the expensive
  half of the deferred two-phase design is machine-matching messy
  transcriptions — normalisation rules, fuzzy matching, a confidence enum. A
  person reading two strings side by side skips that problem entirely.

  **THE MEASUREMENT** — 15 collision groups (rows identical on every displayed
  column INCLUDING `formatText`), 41 releases fetched:

  | Result | Figure |
  |---|---|
  | groups fully distinguished by identifiers + companies alone | **14 / 15 — 93%** |
  | ...including contributor notes | **15 / 15 — 100%** |
  | releases carrying a Matrix / Runout | **38 / 41 — 93%** |
  | calls to resolve one group | **median 3, mean 2.7, max 4** |

  **It works on the genres where search-level text failed, which is the case
  being made.** Discharge (0% plant coverage) and Misfits (2%) BOTH resolve.
  Two 1984 UK `CLAY LP 3` repressings identical on every column separate on
  `LYN-15062 Damont` vs the same runout with different notes, both `Pressed By:
  Lyntone Recordings Ltd.`

  **Why eyeball comparison is the right shape, in one example.** Four Rumours
  pressings identical on every displayed column carry runouts reading
  `BSK-1-3010 LW2 F12 … MASTERED BY CAPITOL`, `JW10 FS7• #2`, `F24`, and
  `LW1 F6 4 △21970 4`. Machine-matching those is a research project — spacing,
  strikethroughs, unicode glyphs, per-contributor transcription conventions. A
  person holding the record reads their own runout and finds their row in
  seconds. **The asymmetry between machine-matching and eyeball-matching IS the
  argument.**

  **The one failure is honest and worth keeping.** Three Portuguese unofficial
  Misfits pressings have byte-identical runouts (`JRR-804-A 33 UPM`) and differ
  only in contributor notes. Bootlegs copy each other's stampers, so the data
  is genuinely the same. The correct behaviour is to SHOW that they are
  indistinguishable — the existing identical-row collapse, applied one level
  down — never to invent a difference.

  **What this would change about the deferred matrix work.** The deferral's
  three triggers currently point at a design that may be the wrong shape: they
  assume storing a user-entered matrix string and matching against it. A
  display-only version is cheaper, needs no schema, claims nothing, and is
  strictly more honest — the app shows what Discogs says and the user decides.
  **Revisit the deferral rather than merely firing it.** See the trigger entry
  below, which is left in place because a display version is not a substitute
  for stored identification evidence if that is ever wanted for the collection.

  **DECIDED 2026-08-25 (Adam), now SPEC §12 step 14c. Not yet built.**

  - **Per-card expand, never automatic.** Automatic pays the calls on every
    search including the ones where the displayed columns already separate the
    candidates. **And an expand is honest about what it is:** the user is
    asking to compare, not being told the answer — which is the same
    distinction §5.7 draws between showing what exists and identifying a copy.
  - **Notes ARE shown, separately and labelled.** They earned it by resolving
    the one group identifiers could not. But a runout is transcribed off the
    object and checkable against what the user is holding, while notes are
    someone's description of a release — **different KINDS of thing, kept
    visually distinguishable the way §7.8 keeps the generated snippet distinct
    from the facts.** Identifiers and companies come first because those are
    what the user compares; notes read as context, never as evidence.
  - **It supersedes the two-phase matrix design** rather than deferring
    alongside it. See the deferral entry below.

  **THE RULE THAT MAKES OR BREAKS IT: render runout strings EXACTLY as Discogs
  holds them — spacing, strikethroughs, unicode glyphs and all.**

  The user's eye is the matcher. Anything the app trims, collapses or strips is
  **discrimination thrown away**, and it would be thrown away silently: a
  tidied runout still looks like a runout. The real values include
  `"BSK-1-3010 LW2 F12 (scratched out)-W-1 KP SUB #1 MASTERED BY CAPITOL"`,
  `"JW10 FS7• #2"` and `"△21970"` — double spaces, a bullet, a triangle, and
  parenthetical transcription notes, every one of them potentially the
  character that separates two pressings.

  **This inverts the normalizer's usual job and must be stated where the
  normalizer lives.** Every other Discogs string in this app goes through
  `meaningful()` and `bounded()` — absence-prose stripped, whitespace trimmed,
  length capped. A runout must NOT: `bounded()` at a generous cap is
  acceptable as a denial-of-service guard, `meaningful()` and any trimming are
  not. **A test pins this rather than a comment**, because a comment does not
  fail when someone adds a `.trim()` in good faith.

- **RULE: any measurement of Discogs metadata quality must be PER-GENRE. An
  average across albums flatters exactly the scenes this collection is made of.**

  Established 2026-08-25 from the `formats[].text` coverage work, and it is
  bigger than that fix.

  **Discogs metadata coverage is contributor effort, and contributors record
  what their scene cares about.** Measured across six albums, 477 live vinyl
  rows, the qualifier field breaks down completely differently by scene:

  | Album | Any qualifier | **Names a plant** | What the qualifiers actually say |
  |---|---|---|---|
  | Discharge — Hear Nothing | **80%** | **0%** | Gatefold, Red Translucent, Textured Sleeve |
  | Misfits — Walk Among Us | **70%** | **2%** | colour variants, almost exclusively |
  | Doors debut (by catno) | 52% | **47%** | Allentown, Terre Haute, Pitman, Monarch |
  | Fleetwood Mac — Rumours | 52% | 25% | plants and sleeves, mixed |
  | Hot Tuna | 33% | 15% | mixed |

  **Headline coverage is ANTI-CORRELATED with usefulness here.** The two albums
  with the most metadata have essentially none of the kind that identifies a
  pressing. For 1960s–70s US majors, collectors document pressing plants,
  because that is what separates the copies. For punk and hardcore, they
  document sleeve and colour variants, because that is what separates THOSE
  copies — the pressing plant of a 1982 Clay LP is not what a collector of it
  cares about, and largely nobody has typed it in.

  **Why this matters beyond one field:** this collection is punk, hardcore and
  adjacent scenes (CLAUDE.md §8 lists UK first-wave, UK82, US hardcore, horror
  punk, psychobilly). **An average across popular albums measures the records
  this app is NOT about.** Any future claim of the form "Discogs has X% coverage
  of field Y" is misleading unless it is broken out by scene, and the aggregate
  will systematically overstate what is available for the records actually being
  held in a shop.

  **The check: when measuring an external data source, sample by the categories
  the USER's data falls into, not by whatever is popular or convenient.** Report
  the spread and the worst case, never only the mean. The first version of the
  qualifier measurement averaged six albums into "50%" and was wrong twice over
  — once by counting separation instead of identification (see the proxy rule
  under Resolved), and once by averaging across scenes that behave nothing alike.

  This also bears on the two-phase matrix redesign: for the scenes this
  collection is made of, the plant qualifier is **near-zero**, so matrix strings
  are not a refinement over `formatText` there — they are the only signal.

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
  | format descriptors | **BOTH**: `format` array + `formats` array of objects **with `text`** | `formats` array of objects, with `text` | **comma-joined string, no `text`** |

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

  **CORRECTED 2026-08-25: the Search cell of that table was wrong, and it was
  wrong in the OPPOSITE direction from the error that produced it.**

  Measured live against `/database/search` while diagnosing the Doors lookup.
  Search rows carry **two** format fields, not one:

  | key | value |
  |---|---|
  | `format` | `["Vinyl","LP","Album","Reissue","Stereo"]` — flat strings, no qualifier |
  | `formats` | `[{name, qty, descriptions[], text}]` — **`text` is here** |

  `normalize-search.ts` declares only the singular `format`. The plural
  `formats` is absorbed by `.passthrough()` and dropped at the type boundary,
  so `text` is not truncated — it is never read. Live from
  `?catno=EKS-74007`: `"Allentown Pressing"`, `"Terre Haute Pressing"`,
  `"Pitman Pressing"`, `"Quality Records Pressing"`,
  `"Specialty Records Corporation Pressing"`.

- **RULE: a correction can over-correct, and the summary written on top of a
  measurement does not inherit the measurement's discipline.**

  This is the shape, and it is worth more than the cell it fixes.

  The original error (2026-08-11, above) was assuming `format.text` was on the
  versions payload because it had been seen on the release payload — a field
  wrongly assumed PRESENT. It was caught by measuring, corrected properly, and
  the correction was then generalised into the endpoint table.

  **The generalisation went one step too far.** Having been burned by assuming
  `text` was everywhere, the table concluded `text` was release-only. That is a
  field wrongly assumed ABSENT — the same class of error, arrived at from the
  opposite direction, and introduced BY the fix for the first one.

  **The fixture carrying the right answer was in the repo the entire time.**
  `test/fixtures/discogs/search-by-catno.json` has held `formats[].text` since
  capture: **10 of its 12 rows have it populated** (`"Red Translucent"`,
  `"Gatefold"`, `"Red, Gatefold"`, `"Transparent"`). The check this very entry
  prescribes four paragraphs above — "read the fixture rather than reasoning
  from memory" — would have caught it in one grep.

  **The practice worked; the generalisation did not inherit it.** The captured
  fixture was correct, the measurement that produced the correction was
  correct, and the SUMMARY written on top of both was never checked against
  either. A measured fact and a rule induced from it are different artifacts
  with different evidence, and only the first one here had any.

  **The check: when a measurement is generalised into a rule, the rule needs
  its own verification pass against the same fixtures.** Especially a rule
  stated as a negative ("endpoint X does not have field Y") — see the
  negative-claim rule under Open, which this is an instance of. Cost: a defect
  that hid the single most discriminating field Discogs offers at list level,
  on the screen where two pressings look identical.

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

  **AMENDED 2026-08-25 — that cost estimate is right for the VERSIONS table and
  wrong for the SEARCH results page. Bears on the two-phase redesign.**

  Still true: the versions endpoint has no `text` and no companies, so the
  plant costs one call per row THERE. Confirmed again by live measurement.

  **But on the search results page the plant text is already in the payload
  that has been paid for**, under the undeclared `formats[].text` — see the
  corrected endpoint table above. **Zero additional calls.** The discriminator
  problem has different economics on the two screens, and the earlier framing
  ("not obtainable, one call per row") reads as if it applied to both.

  **Why this is recorded against the two-phase redesign** (matrix strings, an
  `unresolved` confidence state, storing identification evidence): a design
  that budgets rate-limited calls for a plant hint on the search page would be
  paying for something free. This is exactly the kind of fact that gets
  rediscovered expensively — it was already wrong once in the opposite
  direction and cost a round.

  **CORRECTED 2026-08-25 (same day, after QA on the live page). The first
  version of this measurement counted the wrong thing and overstated the fix by
  roughly 2x. The corrected numbers are below the rule.**

- **RULE: when a measurement stands in for a capability, count the capability,
  not the proxy — and say which one you counted.**

  I measured "does `formats[].text` separate two otherwise identical rows" and
  reported it as how much of PRESSING IDENTIFICATION the fix solves. Those are
  not the same question, and the gap is not small:

  | Question | Answer |
  |---|---|
  | rows carrying any qualifier | 53% |
  | **rows whose qualifier names a plant or label variant** | **24%** |

  "Gatefold" and "Red Translucent" separate two rows on screen perfectly well.
  Neither tells the user which pressing is in their hands, which is the only
  thing this screen exists to do (CLAUDE.md §8). **A separator is not an
  identifier**, and by counting separation I made a 24% capability read as a
  50% one — in SPEC, where the next reader would have taken it as settled and
  used it to argue the matrix work was half-done already.

  **Caught by the developer using the live page**, who saw one qualifier in four
  visible cards and asked for the plant-versus-sleeve split. The measurement was
  real, the method was sound, and the label on the result was wrong — which is
  the same shape as the `format.text` over-correction above: the artifact built
  ON TOP of a good measurement is where the error lived, not in the measurement.

  **The check: name the capability in the same sentence as the number.** "53% of
  rows carry a qualifier" is a fact about the payload. "The qualifier identifies
  the pressing on 24% of rows" is the claim anyone actually cares about, and
  only the second one belongs in a spec.

  **MEASURED COVERAGE (2026-08-25, corrected) — how much of the identification
  problem `formats[].text` actually solves. Recorded so it is not re-derived.**

  Five candidate sets, live, vinyl-only, 377 rows total: the Doors debut by
  catno (the reported case), Doors Strange Days, Discharge Hear Nothing, Hot
  Tuna, Misfits Walk Among Us.

  Six albums, 477 live vinyl rows, classified by what the qualifier actually
  says:

  | Class | Rows | Share | Identifies a pressing? |
  |---|---|---|---|
  | plant / label variant | 116 | **24.3%** | **yes** |
  | colour / finish | 87 | 18.2% | no |
  | sleeve, insert, cover | 39 | 8.2% | no |
  | weight | 4 | 0.8% | no |
  | other | 7 | 1.5% | mostly no |
  | **empty** | **224** | **47%** | — |

  **Per-album plant coverage, which is the number that matters and swings
  hardest:**

  | Album | Any text | **Plant** |
  |---|---|---|
  | Doors debut, by catno `EKS-74007` | 52% | **47%** |
  | Doors debut, by artist+title | 42% | **29%** |
  | Fleetwood Mac — Rumours | 52% | **25%** |
  | Hot Tuna — Hot Tuna | 33% | **15%** |
  | Misfits — Walk Among Us | 70% | **2%** |
  | Discharge — Hear Nothing | 80% | **0%** |

  **Discharge and Misfits are the entry worth remembering:** the two HIGHEST
  headline-coverage albums have almost no identifying data. Their qualifiers are
  colour variants and gatefold notes, because that is what those scenes'
  contributors record. **Headline coverage is anti-correlated with usefulness
  here**, so an average across albums actively misleads.

  **So the parser fix is necessary and not sufficient, quantified honestly.** It
  surfaces a plant name on about one row in four, and the two-phase matrix
  redesign is what covers the other three.

  **What it does NOT change:** `text` is free-text and user-submitted, not a
  plant field. Live values from one search include `"Barcode; SRC-Specialty
  Records Press"`, `"Allentown - Pub. Credit Misprint"`,
  `"(Columbia Records Pressing) "` (trailing space), `"180g"`, `"Blue"`,
  `"USA Cover"`, `"SP"`. It mixes plant, colour, weight and sleeve notes, so it
  is a HINT the user reads and judges, never a resolved plant identity. The
  §7.7 rule against presenting a Discogs match as certain applies to it
  directly.

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

- **DEFERRED WITH A TRIGGER: pressing identification. The shape is
  VERIFICATION-BY-DISPLAY; the two-phase stored-matrix design is SUPERSEDED.**

  Recorded 2026-08-25, at the close of the three-findings lookup unit, while
  the reasoning is fresh. **A deferral without a trigger is a decision never to
  act** — this project's own rule — so the trigger is written here rather than
  left to judgement later.

  **SUPERSEDED, not deferred alongside** (decided by Adam, same day, on the
  measurement above): the two-phase design stored a user-entered matrix string
  and machine-matched it, and **the expensive half of it was matching messy
  transcriptions** — normalisation rules, fuzzy comparison, a confidence enum
  to express how sure the match was. Verification-by-display **skips that
  problem rather than solving it**: the app displays what Discogs holds, the
  user's eye does the comparison against the object in hand, and no match is
  ever asserted. It measured 93% on the same collision groups, needs no schema,
  and claims nothing. The triggers below now point at THIS feature.

  **The specific risk, stated so it can be watched for: the `formatText` fix
  makes lookup feel adequate, and adequate is what kills the follow-up.** The
  cards now differ where they used to collide, which is a visible improvement
  and a partial one. The measured ceiling is above: a qualifier appears on 53%
  of rows and names a plant on **24%**. Feeling better is not the same as
  identifying a pressing, and the gap is now a number rather than an
  impression — a number that got SMALLER, not larger, on closer measurement.

  **Fire the redesign on the FIRST of these, whichever comes first:**

  1. **A collection entry turns out to be the wrong pressing.** One instance is
     enough — no count, no threshold. CLAUDE.md §8 names this as the worst bug
     the app can ship, and it has already happened once (the Hot Tuna
     misidentification recorded above). A second means the list-level fix did
     not hold.
  2. **A lookup ends without the user being able to tell which row is theirs**,
     three times. The honest signal already exists in the UI — the identical-row
     collapse says "N more look identical from here" — so this is countable
     rather than felt. Three collapses acted on, or three searches abandoned at
     that message.
  3. **Step 11 (shelf ordering) needs a pressing identity** it cannot get from
     the fields on hand. Already flagged above as a possible forcing function;
     naming it here makes it a trigger rather than a note.

  **What fires: verification-by-display**, per-card expand, as specified in the
  entry above and in SPEC §12 step 14c. Release detail for the candidate the
  user asks about, identifiers and companies first as the things being
  compared, notes below them labelled as context. No stored matrix, no
  matching, no confidence enum — because nothing is being decided by the app.

  **The one rule that makes or breaks it: runout strings render EXACTLY as
  Discogs holds them.** The user's eye is the matcher, so any character the app
  trims, collapses or normalises is discrimination thrown away. See §12 step
  14c and the test that pins it.

  **What does NOT fire it:** the qualifier being blank on a card. That is the
  known 47% and it is expected; the trigger is about the app being unable to
  distinguish, not about Discogs being sparse.

  **What is NOT superseded:** storing identification evidence on a `records`
  row, if that is ever wanted for the collection rather than for a lookup.
  Display answers "which of these am I holding" at the moment of asking;
  it does not record the answer. That is a separate feature with a separate
  justification, and it should not be smuggled in as part of this one.

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

  **TERMINAL CASE: sometimes no fixture can discriminate, and the honest move is
  to say so.** "The fix is always the same shape" above is not quite true — it
  assumes an inverting fixture exists. For some properties none does, because
  the query's own contract forbids the rows that would invert it.

  `findArtistsNamed` (step 11 unit 4a) is the instance. It matches names
  EXACTLY, so every row it can return shares one name — which makes `ORDER BY
  created_at`, `ORDER BY name` and no ordering at all mutually indistinguishable
  in its output. Two mutations confirmed it: swapping to a name sort and
  deleting the clause both pass. There is no seed data that separates them,
  because any row that would separate them is a row the query does not return.

  When that happens: assert the property that IS observable (there, that the
  first row is the earliest by `created_at`), and state in the test's own
  comment that it does not prove the mechanism. A test that silently claims
  more than it constrains is the thing this whole rule exists to prevent, and
  that failure does not stop being a failure because the gap is unavoidable.

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
  | `toHaveCount` on a hidden subtree | that the elements are ON SCREEN | that they are in the DOM — `display:none` changes neither the count nor the locator |

  Each resembles verification while leaving the named property free to be
  wrong. Noticed: steps 5-7; stated as a class 2026-08-10.

  **Fourth instance, unit 12g — same cause as the `toContainText` variant.**
  The graph's `sm:hidden` / `hidden sm:block` swap hides the canvas on phones
  with CSS, so the SVG subtree still mounts. Two E2E tests that count
  `graph-node` elements passed unchanged on the mobile project **while the
  canvas was invisible to a user.** They read the markup, not the screen.

  This is also the same family as the dead node click (unit 12d): green because
  the element EXISTS, while the feature it stands for is unavailable. In both
  cases the counting assertion was satisfied and the thing a user would do —
  see the graph, click a node — did not work.

  `toBeVisible` / `toBeHidden` are the matchers that know the difference. The
  narrow/wide test in graph.spec.ts asserts with both, at both widths, in one
  test: a fallback that appeared everywhere, or nowhere, would satisfy half of
  that and be plainly wrong.

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

  **CORRECTED — this rule was recorded too bluntly, and the test-quality pass
  found the counterexample.** "A test whose assertion is `toMatch` on source
  code" is not the tell. The tell is narrower:

  > **A file-text assertion is right exactly when the property is about a FILE,
  > and wrong when it stands in for behaviour that can be observed.**

  `neon-gate.test.ts` greps `neon-transactions.test.ts` for its gate test's
  name, which reads like the shape condemned above. Mutation says otherwise:
  renaming the gate away is caught ONLY by that grep. Its behavioural sibling —
  which actually runs vitest and greps the output — PASSES, because the warning
  text it matches is unchanged.

  **No behavioural test can notice that another test was deleted.** A deleted
  test does not fail; it stops existing, and the suite goes green with less
  coverage. The property "this test still exists" is genuinely a property of a
  file, and a file-text assertion is the only instrument for it.

  So the question to ask is not "does this assert on source text" but "is the
  thing being asserted a fact about the file, or about the running system". The
  `guardedFetch` case above was the second: it asserted a NAME and inferred a
  guard was complete. `every-page-has-nav` was the second too — it asserted a
  string and inferred a nav renders, and passed 11/11 against
  `{false && <AppHeader />}`. `neon-gate` is the first, and stays.
  Corrected: test-quality pass after R4.

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
  <!-- 2026-08-25: search ALSO sends a plural `formats` array of objects carrying
       `text`, which this table's first row does not mention and which was
       undeclared in the schema until the Doors lookup fix. See the corrected
       endpoint table under the field-per-endpoint rule. -->
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

  **Fourth instance, and the first where the instrument was a hand enumeration
  in a planning document rather than a grep in code.** The SPEC amendment sets
  under-counted the same class three times running — "four places use this
  term" was five, then six. Each pass found the ones the previous pass named
  plus one more, because each searched for the specific phrase (`graph-based`)
  rather than the root (`graph`). The correction is not a more careful list: it
  is that a claim about coverage in a planning document is an assertion, and
  gets verified by execution like any other. Same family as the
  `validationError` two-endpoints-that-were-eight finding. Noticed: SPEC
  amendments A16–A17.

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

## Step 11 unit 1 — MusicBrainz transport

- **The no-live-calls guard already covered MusicBrainz.** Probed before
  changing anything: `assertNoLiveCall('https://musicbrainz.org/...')` threw
  correctly, because the guard was written host-agnostic and its comment said so
  ("Not host-specific: the rule covers external calls generally"). The step-7
  design held for a host that did not exist when it was written.

  What WAS wrong was the advice. Every message said "Mock getDiscogsClient",
  which on a MusicBrainz failure names an unrelated module and sends the reader
  to the wrong file. **A guard that fires correctly and then misdirects is worse
  than one that says nothing, because the reader trusts it.** Now host-aware,
  with a generic fallback so step 14's Anthropic client is not named after
  whichever client was written most recently.

- **`usesRealNetwork` moved out of the Discogs client and beside the guard.**
  Both transports need it — the guard fires at the request site so an injected
  fake is exempt while the real `fetch` is not, which is what makes a client's
  own retry tests writable. A second copy is how two clients come to disagree
  about what counts as a live call. Mutation M5 (removing the guard call
  entirely from the MusicBrainz client) fails 2 tests, so the exemption is not
  an escape hatch.

- **MusicBrainz differs from Discogs in ways worth encoding, not sharing.**
  Verified against their live documentation rather than recalled: 1 req/sec per
  source IP (not 60/min), enforced ALL-OR-NOTHING so exceeding it fails rather
  than slows, breach code **503** rather than 429, and a `User-Agent` carrying
  contact information required as a term of use. A client parameterised over
  both would be a conditional at every branch; the token bucket is shared
  because it is genuinely generic.

- **FLAKE (unrelated, recorded not fixed):** `record-form.spec.ts` "a matrix
  value survives an edit that does not touch it" failed once in a full run and
  passed on retry, then passed 3/3 in isolation. It exercises no Discogs or
  MusicBrainz path — a form-save navigation with a 15s URL wait. Recorded per
  CLAUDE.md §4 rather than chased mid-unit. Note that 3/3 in isolation is NOT
  evidence it is clean; the worker-saturation finding above is exactly this
  shape.

## Step 11 unit 2 — the relation normalizer

- **A mutation survived because no fixture could tell the two rules apart.**
  Deriving `role` from the target's Person/Group type instead of `direction`
  passed all 18 tests — including the one written specifically to catch it.
  Discharge, Black Flag and the person fixture never disagree: bands have Person
  members, people have Group bands, so both rules give the same answer
  everywhere.

  **The fix was to find real data where they diverge, not to construct it.**
  Searched MusicBrainz for a group that is a MEMBER of a group and found GP Wu
  in the Wu-Tang Killa Bees — `direction: backward`, target type `Group`. By
  direction it is a member (correct); by target type it is a band (an inverted
  row). Captured as `artist-group-member-of-group.json`; the mutation now fails.

  This is the discriminating-power rule again, with a twist worth keeping: **a
  test can name the exact shortcut it exists to prevent and still not detect
  it.** The comment described the failure precisely while the assertion could
  not distinguish it. Naming the hazard is not the same as constraining it.

- **Black Flag earned its place as predicted.** 26 relations, 22 kept — the only
  fixture where the type filter has anything to discard. Against Discharge (31
  of 31 member-of-band) a normalizer that filtered nothing would pass.

- **Three date formats occur in real payloads:** `1976`, `2014-03`,
  `2011-12-13`. `Number('2011-12-13')` is `NaN`, and §4.3 stores an INTEGER
  year — a NaN reaching that column fails at the database, far from the parse
  that caused it. The coercion class from NOTES in a new place.

- **FLAKE COUNT — observation 2.** Full E2E run showed 4 failures in
  `manage.spec.ts` (mobile only, genre move selects), then: mobile-only project
  run 149/149 clean, full suite re-run 298/298 clean. Requires both projects
  running concurrently, which points at contention rather than code — this unit
  added a pure module and JSON fixtures and touches no genre path. Same family
  as the worker-saturation finding above. Not chased, per the standing decision
  to accumulate observations before investigating. Previous: record-form.spec.ts
  matrix test (unit 1).

## Step 11 unit 3 — artist_memberships

- **`NULLS NOT DISTINCT`: verified, not assumed.** Measured directly on
  Postgres 16.14 before writing any schema — a plain `UNIQUE (a, b, c)` accepts
  two rows whose `c` is NULL (2 rows), `UNIQUE NULLS NOT DISTINCT` collapses
  them (1 row) and makes `ON CONFLICT` actually fire. Mutation-verified the way
  it matters: removing the clause fails the null-instrument RE-IMPORT test and
  only that test. An insert-path test would not have caught it, because the
  first insert succeeds either way.

- **§4.3 asks for a composite PK Postgres cannot create.** `PK is (person,
  group, instrument)` with `instrument` nullable — a primary key forbids
  nullable columns. Resolved as a surrogate uuid `id` plus a UNIQUE constraint
  carrying the identity rule, matching every other table here. Flagged rather
  than silently substituted; the rule §4.3 wants is preserved, only its
  mechanism differs.

- **A batch upsert needs `excluded`, not the local variables.** The two existing
  upserts in this codebase (`cache.ts`, `market-cache.ts`) write ONE row and can
  name their values directly. `saveMemberships` writes many in one statement, so
  each conflict must take its own incoming values — `sql\`excluded.began_year\``
  rather than the variable. Naming variables would write one row's values over
  every conflicting row, a bug that only appears once an artist has more than
  one membership.

- **The FK conformance test caught the addition, as designed.** Its comment says
  an exhaustive list "is the only way to notice an ADDITION", and it noticed.
  Both new FKs cascade toward `artists` for `artist_influences`' reason — an
  edge to a deleted artist is meaningless, and NO ACTION would make artist
  deletion fail on an FK violation. Recorded in the list with that reasoning
  rather than silently appended.

- **The fresh-clone migration test failed for the same reason as last time:**
  untracked migration and snapshot files. It copies only git-tracked files, so
  a new migration is invisible to it until staged while the journal already
  references it. Second occurrence — `git add drizzle/` belongs in the schema
  unit checklist, not in the debugging that follows.

## Step 11 unit 4a — artists.name is no longer unique

- **RULE: when a query\'s CONTRACT stops being true, delete it rather than adapt
  it.** `findArtistByName` returned one row because the schema guaranteed one
  row. After migration 0008 it would have returned an arbitrary row of N —
  same name, same signature, silently different meaning, and five callers still
  trusting the old contract. Replaced by two functions that ask answerable
  questions: `findArtistByMusicbrainzId` (identity) and `findArtistsNamed`
  (an array, count included). Deleting it made the compiler enumerate every
  caller, which is the enumeration a rename would have hidden.

- **The five callers wanted four different things**, which is why one function
  serving all of them was wrong:
    prefill  -> a suggestion; now prefills NOTHING when N > 1 and says why
    POST     -> "does anyone have this name"; now returns a count too
    PATCH    -> same as POST; `artistNameTakenByOther` deleted, since it
                enforced a constraint that no longer exists and would have made
                PATCH stricter than POST
    2 recovery paths -> the winner of a race on the NAME constraint. Both dead
                after 0008; deleted rather than left unreachable.

- **The asymmetry with labels and genres is deliberate and now commented.** They
  keep unique names because a label IS its name; two bands genuinely share one.
  Without the comment the next reader sees artists re-reading by Discogs id
  while labels re-read by name and assumes one is a bug.

- **A test helper depended on the constraint invisibly.** `import-then-own.test.ts`
  used `ON CONFLICT (name) DO UPDATE` to find-or-create an artist — a
  four-test failure in a file this unit never opened. Its comment said the
  intent was REUSE, not uniqueness; rewritten as select-then-insert, which
  depends on no constraint at all. Cross-file break of exactly the kind
  CLAUDE.md §10 describes.

- **HONEST LIMIT: the ordering of `findArtistsNamed` is not fully testable.**
  It matches exactly, so every row it returns shares one name — which makes
  `ORDER BY name`, `ORDER BY created_at` and NO ordering mutually
  indistinguishable on a small table. Two mutations confirmed it: a name sort
  and removing the clause entirely both pass. The test asserts the property
  that matters (the first row is the earliest by `created_at`) and its comment
  says plainly that it does not prove the ORDER BY causes it. Recorded rather
  than dressed up as coverage.

- **Two non-discriminating fixtures caught by mutation**, both fixed: asserting
  `findArtistByMusicbrainzId(\'\')` returns undefined against a table where
  nobody holds `\'\'` (the query finds nothing either way — now a row holds one),
  and the ordering case above.

## Step 11 unit 4b — artist resolution

- **RULE: when the failure is silent and permanent, test the SECOND operation.**
  A first import against an empty table succeeds under almost any rule — match
  on name, match on nothing, create unconditionally all pass. Only the second
  import of a DIFFERENT MusicBrainz artist sharing a name can tell those apart.

  The asymmetry is what makes it worth stating: attaching an MBID to the wrong
  local artist means every LATER import matches the id that was attached in
  error, so the mistake stops presenting as a name collision and starts
  presenting as settled fact. Nothing throws at any point.

  Mutation M1 — claiming a name-matched row instead of creating a new one, the
  silent merge itself — fails 3 tests, all of them second-import tests.

- **Four cases, and only one of them is ambiguous.** The distinction that took
  the most care:
    MBID matches             -> that row. The id identifies an artist.
    name matches, no MBID    -> AMBIGUOUS. Create, report the candidate.
    name matches, other MBID -> a KNOWN DIFFERENT artist, not a candidate at
                                all. MusicBrainz has already answered the
                                question a review would ask, and offering it
                                for merge invites the exact mistake.
    nothing matches          -> create.

  The third is the one an implementation would most easily collapse into the
  second. Mutation M2 does exactly that and fails.

- **The resolver REPORTS candidates rather than persisting them**, because unit
  5 owns the table. An array, not a single id: a name can match two hand-entered
  rows and one field would silently drop one — the version-table badge bug in a
  new place, where a field held what was really a list. Mutation M3 confirms it.

- **A resolver that created null-MBID rows would generate its own future
  ambiguity** — the row would be indistinguishable from a hand-entered one, and
  the next import would find it by name and face the same question. Refused at
  the entry point instead.

- **`ArtistInput` did not carry `musicbrainzId`.** Caught by the compiler rather
  than by a silent drop, which is the argument for the write going through the
  typed query layer instead of raw SQL.

## RULE: a field holding what is really a list

Three instances now, and the tell is identical each time: **the singular case is
the common one, so the plural only surfaces with real data.** Every fixture, every
manual test and usually the first month of use shows exactly one — and the design
that holds one looks correct until it silently drops the second.

| Instance | The singular assumption | What the plural was |
|---|---|---|
| Version-table ownership badge | one badge per row says something | every row carried the same badge; the signal was the one row that differed |
| `artist_match_candidates` | a column on `artists` for "possible match" | a name can match TWO hand-entered rows |
| `resolveArtist` return | one `candidateId` | same: two local Discharges, both MBID-less |

The failure is always the same shape and always silent: no error, no warning, the
extra values simply do not exist downstream. Nothing distinguishes "there was
one" from "there were three and we kept one" once the data is written.

**The check, before choosing a scalar:** ask what makes this value unique — a
constraint, or a coincidence of the current data? A name is not unique (§4.1). A
row can have several matches. An ownership tier applies to many rows at once. If
the answer is "nothing enforces it", the field is a list and the scalar is a
truncation waiting for a second row.

Related but distinct from the absent-versus-unknown family: those confuse "no
value" with "unknown value". This confuses "one value" with "the first of
several", and it is harder to notice because the data looks complete.

## Step 11 unit 5 — the duplicate-artist review

- **"Distinct" is durable, not just available.** The query filters on
  `resolved_at` rather than on `resolution`, so a pair answered "different
  artists" is as permanently closed as one answered "same artist". A mutation
  filtering on `resolution != 'merged'` — which looks equivalent — reopens every
  declined pair on the next import and fails 2 tests.

  That mutation is the whole unit in miniature: if declining did not persist,
  the only way to permanently silence a pair would be to MERGE it, and the
  review would become a merge button with extra steps. The dangerous outcome
  arrived at through the UI rather than through the code.

- **The review cannot use names as evidence, by construction.** A pair is a
  candidate BECAUSE the names are identical. The screen shows record count
  first (an artist with eleven records is the one being collected; a freshly
  imported row with none is new), then formed year, country and MBID. A
  mutation returning names without record counts fails.

- **An E2E "the panel is absent" test was order-dependent.** It asserted
  `match-review` had count 0, which only held if no other test had seeded a
  candidate — it passed or failed on worker ordering. Rewritten to seed its own
  pair and assert THAT pair leaves the review once answered. Same defect class
  as the flake findings above: a test whose result depends on what else ran.

- **The FK conformance test caught the addition again**, as it did in unit 3.
  Third time it has earned its exhaustive-list design. Both new FKs cascade;
  recorded with the reasoning rather than appended silently.

## Step 11 unit 7 — merging artists

- **RULE: when a schema-level failure injection turns contrived, use a seam and
  say so.** Three attempts to force a mid-transaction failure through the schema
  each failed honestly: an out-of-range year the seed itself could not write, a
  null byte the tooling refused, a want-list overflow needing a swallowed catch.
  Every attempt left a test whose COMMENT described a mechanism the code did not
  implement — the decorative test this project has shipped before.

  The primitive now exposes an `afterMoves` seam, called inside the transaction
  between the moves and the delete. It is honest about being a seam, it fails
  where a real error would, and the assertions are about the ROLLBACK, which is
  the behaviour under test. Mutation M1 (removing the transaction) fails it.

- **RULE: "it will be gone by COMMIT" is wrong for unique indexes.** Copying the
  loser's `musicbrainz_id` onto the survivor while the loser still held it put
  the value on two rows at once and threw `duplicate key value violates unique
  constraint "artists_musicbrainz_id_key"` — even though the loser is deleted
  three statements later, inside the same transaction.

  **A unique index is checked per STATEMENT, not at commit.** The intermediate
  state has to be legal, not just the final one. That reasoning — "the conflict
  resolves before anyone can see it, so it does not matter" — is what would have
  shipped this, and it is wrong for every non-deferrable constraint. Postgres
  supports `DEFERRABLE` for exactly this, but the simpler fix is ordering:
  release the loser's unique ids before copying them.

  Generalises to any move-then-delete across a unique column: swapping two
  values, reassigning a slug, transferring an external id.

- **§4.3's own list omitted `artist_genres`, and it was the dangerous omission.**
  It cascades, so a merge that skipped it would strip UK82 from a band with no
  error and no trace — §8's genre-flattening realised by accident. Found by
  enumerating the nine FKs pointing at `artists` rather than working from the
  list.

- **Every junction has a composite key, so every move can collide.** Both
  artists tagged "punk" makes a plain `UPDATE SET artist_id` throw. Each move is
  an insert-on-conflict-do-nothing followed by a delete, and the discarded count
  is REPORTED so the confirmation can name it.

- **Edges between the two are deleted, not moved.** "A influenced B" stops being
  a statement when A and B turn out to be one artist. Three CHECKs forbid
  self-reference, so moving them would fail anyway — but the reason to delete is
  semantic, not constraint-driven.

- **A third order-dependent E2E test, found by the full suite.** My own review
  test used `.first()` and asserted zero candidates GLOBALLY, so it passed only
  when no other test had one open. Scoped by name. That is now three instances
  of the same defect in this file — worth treating `.first()` on a shared testid
  as a smell in its own right.

## Merge confirmation — naming the survivor

- **"The duplicate will be deleted" is not a decidable sentence here.** Both rows
  are called Discharge — that is why the pair is in the review — so the
  confirmation has to name the survivor by the facts that separate them, the
  same ones the review uses: record count, formed year, country, MBID. "Keeping
  the artist with 1 record. The one with 0 records · formed 1977 · GB will be
  deleted."

- **An optional argument that changes what the copy MEANS is not a
  convenience.** `sides` was optional at first, so a caller omitting it got a
  confirmation with no survivor sentence at all — silently losing the only line
  that says which row is kept, on the screen whose entire premise is that names
  cannot say. Made required; the compiler then found every call site.

- **Two sentences saying one thing reads as two things happening.** `keeping`
  ends with "…will be deleted" and `moves` began with "The duplicate artist row
  will be deleted", which together implied two rows were going. Caught by
  reading the rendered string in a failing E2E assertion, not by the unit tests
  — each function was correct in isolation.

- **A mutation survived because the assertion paraphrased the copy.** The test
  for "does not claim the id moves" matched `/will be kept|moves across|gains/i`
  while the sentence says "moves to" — so it could not fail, and a mutation
  showing the line unconditionally passed. Assertions about copy must quote the
  copy, not describe it.

- **A `sed`/python mutation with a broken anchor printed "13 passed" again.**
  Nested quotes defeated the replacement; the assert caught it. Third time this
  guard has earned itself.

## RULE: assertions about copy quote the copy

Matching a regex of SYNONYMS against a string that says something else is
unfalsifiable — it cannot fail, so it constrains nothing.

The instance: a test asserting the confirmation does not claim the MusicBrainz id
moves matched `/will be kept|moves across|gains/i`, while the sentence says
"moves to". None of the three alternatives appear in the copy under any
condition, so the assertion passed against correct code, against broken code, and
against a mutation that rendered the line unconditionally.

**The reason it slips is that it feels MORE robust, not less.** Listing synonyms
looks like defending against harmless rewording, and quoting looks brittle. The
opposite is true: a quote fails when the copy changes, which is exactly when a
human should look at it, while a synonym list silently stops matching and never
fails again.

- Assert on the words the code actually produces.
- If a test would break on a harmless rewording, that is the test working — the
  fix is to update the quote, not to loosen it into a paraphrase.
- The tell: could this pattern match the string under ANY branch? If not, it is
  asserting the absence of something that was never there.

Same family as the assertion-that-cannot-constrain entries above: the version
spread's settle window, the vacuous empty-state check, and the ordering that no
fixture can discriminate. This one is specific to text.

## RULE: a one-sentence step entry has gaps proportional to what it did not examine

Step 11's §12 entry was one sentence. Building it surfaced THREE spec gaps, all
found by reading the data source rather than the spec:

| Gap | Found by | Would have been |
|---|---|---|
| MusicBrainz has no influence relationship at all | fetching the artist-rels vocabulary | `artist_influences` filled with a fabricated 1-5 `strength` |
| `artists.name UNIQUE` makes two same-named bands impossible | reading §4.1 against a real payload with two Discharges | one artist, two bands' lineups fused |
| No table for artist-keyed cache payloads | looking for where a 90-day cache would live | relation payloads written into a release-keyed table |

**The common cause is that the step was scoped before its data source was
examined.** "Band membership and side-project relationships, pulled
automatically" is a reasonable sentence to write about an API nobody has called
yet — and every assumption inside it (that influence is available, that a name
identifies an artist, that an existing cache fits) turned out to be wrong in a
way only the payload could reveal.

**Steps 12, 13 and 14 are specified the same way** — one sentence each, written
before their data sources were examined. Expect the same shape:

- Step 12 (graph endpoint + D3 visualization): §8.1's `weight` comment already
  omits `shared_member`, which is a known gap.
- Step 13 (shelf order): the algorithm is described but its inputs are not
  bounded — what happens with one artist, or a thousand.
- Step 14 (suggestions, LLM-assisted): the prompt is the whole feature and
  §12 gives it a clause.

The practical rule: **before building a step, fetch or read the real thing it
consumes, and reconcile the spec against it BEFORE writing tests.** Three
one-hour investigations here each prevented a defect that would have been
invisible after shipping.

## Step 11 unit 6a — the lineup walk

- **Partial failure decided before building, not after.** The client already
  retries a 503 three times with backoff, so an error reaching the walk means
  MusicBrainz refused FOUR times — down or hard-limiting, not blinking. Hence:
  stop rather than continue, commit what was resolved, and report honestly.

- **The asymmetry that took the most thought: partial data is worth keeping in
  the DATABASE and worth NOT keeping in the CACHE.** Nineteen members is real
  data and discarding it wastes nineteen seconds of a one-per-second budget. But
  caching the band after a cut-short walk would serve an incomplete lineup for
  ninety days — the next walk would read the cached band, find its members
  already recorded, and never discover the ones the refusal cut off. So the
  band's cache write is deferred until the walk completes; members are cached as
  they are fetched, because each member's own payload IS complete.

- **Two mutations survived on non-discriminating fixtures**, both fixed:
  - TTL 90 → 7 days passed, because every test ran against fresh entries. Added
    boundary fixtures at 60, exactly 90 and 120 days — the only values where the
    two rules disagree.
  - Skipping `saveMemberships` on a partial walk passed, because the test
    asserted the ARTIST existed and `resolveArtist` writes artists as a side
    effect of resolving them. The membership rows were never checked.

  Both are the same shape: an assertion adjacent to the behaviour rather than on
  it.

- **`getMusicBrainzClient` did not exist.** Unit 1 built `createMusicBrainzClient`
  and its tests injected everything, so nothing ever needed the shared accessor
  or the `MUSICBRAINZ_CONTACT_EMAIL` env var. Both added here. A module fully
  tested through injection can be unreachable from application code without any
  test noticing.

- **FLAKE COUNT — observation 3**, and the first two conditions for
  investigating are now met: three observations, three different spec files
  (`record-form`, `manage`, `collection-filters`), all load-dependent, all
  passing in isolation. Worker measurement started per the standing rule —
  measure contention, not the spec that happened to fail.

## RULE: a module fully tested through injection can be unreachable

`createMusicBrainzClient` was built and tested in unit 1 with fifteen passing
tests. Every one of them injected its own `fetch`, clock and sleep — so nothing
ever called a shared accessor, and `getMusicBrainzClient` did not exist until
unit 6a needed it. Neither did `MUSICBRAINZ_CONTACT_EMAIL`. The module was
correct, well covered, and unreachable from application code.

**Injection makes this invisible rather than merely unnoticed.** The related
finding — `/api/discogs/import` implemented, tested and never called — was at
least visible as an unreferenced route. Here every test supplies its own
instance, so the accessor's absence produces no unused export, no dead branch and
no failing test. The coverage is real; the wiring is missing; nothing
distinguishes them.

**The check:** for a module whose tests all inject their dependencies, ask what
the APPLICATION would call and whether that path is exercised anywhere. If the
answer is "the tests construct it directly", the production entry point may not
exist at all.

## RULE: partial data belongs in the database, not in the cache

A cache entry asserts completeness for the whole of its TTL. Writing a partial
result makes the next attempt read a LIE rather than retry — and for the ninety
days of the MusicBrainz TTL, nothing would ever discover the missing members.

The walk splits on exactly this:

- **Members are cached as they are fetched.** Each member's own payload IS
  complete — one request, one full answer.
- **The band's cache write is deferred to the end.** Its payload is complete but
  its WALK was not, and the cache entry stands for the walk. A cut-short walk
  earns no entry, so the next one tries again.
- **Both are written to the database.** Nineteen resolved members are real data;
  discarding them wastes nineteen seconds of a one-per-second budget and makes
  the next walk pay for it again.

The general form: **cache what is complete, persist what is true.** A row can be
partial and honest — the walk reports "20 of 32" alongside it. A cache entry
cannot, because nothing reads its provenance.

## Flake resolution — workers 3 → 2 (mitigation, not diagnosis)

Three observations accumulated across three units, each in a DIFFERENT spec file
(`record-form.spec.ts` matrix test, `manage.spec.ts` genre selects,
`collection-filters.spec.ts` chip clearing). All load-dependent, all passing in
isolation. Per the standing rule from the worker-saturation round: measure
contention, do not investigate the spec that happened to fail.

Measured 2026-08-14, full suite each run:

| workers | runs | flaky | wall clock |
|---|---|---|---|
| 3 | 2 | **2** — a different spec each time | 5.1m |
| **2** | **3** | **0** | 6.0-6.3m |

Taken. About a minute per run against a flake on every run is worth paying.

**Recorded as mitigation rather than a fix, deliberately.** Three different specs
failing under load means something is genuinely SHARED between concurrent
workers — most likely test data in the single database they all use. Reducing
concurrency makes collisions rarer, not impossible. A flake here later is not a
surprise and not a refutation of this measurement.

Note the evidential symmetry: one clean run at workers=2 would have been as
uninformative as one flaky run at workers=3, which is why three were run before
changing anything.

**UPDATE, same day: a flake at workers=2**, in `stats.spec.ts` ("reachable from
the nav") — a FOURTH spec file, after four clean runs. Recorded rather than
re-tuned, because it is exactly what "mitigation, not diagnosis" predicted:
fewer workers makes collisions rarer, not impossible.

This does not refute the measurement (2 of 2 flaky at three workers, 0 of 4 at
two) and it does not justify workers=1 — the standing decision was that a flake
here is not a surprise. What it does confirm is that the shared resource is
still shared. **The real diagnosis is test-data isolation in the single database
every worker uses** — most likely per-worker schemas or a per-worker database, a
change to `test/helpers/db.ts` and `global-setup.ts` rather than to a spec.

**Scheduled: step 15, unit 1** (decided 2026-08-20 after R5's remediation
measured 7 and 5 hard failures in two of three full runs, all `[mobile]`). See
"Per-worker test-data isolation — DECIDED" below.

## Step 11 unit 6b — the lineup endpoint

- **The endpoint has two outcomes by design**, because every artist in the real
  collection is hand-entered with no MBID. Verified against Neon: all six of
  Adam's artists are `NO MBID`, so the name-search path is the ONLY path that
  runs in practice — the id path exists for second and subsequent walks.

- **The gap threshold is in the code as an explicit guess**, in `WIDE_RATIO`'s
  terms: fitted to Hot Tuna (100 vs 78) and Carpenters (100 vs 66), no negative
  case where the answer is known, not to be tuned to fit. Two Discharges both
  score 100 and the rule refuses, which is the behaviour it exists for.

- See the rule below: a test of mine asserted the wrong thing and the code was
  right.

- **A mutation removing the sort survived** because the fixture had its two
  perfect scores adjacent — sorted and unsorted agreed. Fixed by moving the weak
  match BETWEEN them. The discriminating-power rule again, on ordering.

- **`z.string().uuid()` validates the version nibble, not just the shape.**
  `11111111-1111-1111-1111-111111111112` is rejected; a v4-shaped
  `11111111-1111-4111-8111-111111111111` is accepted. Cost two attempts at a
  "not found" fixture that kept returning 400 — the endpoint was right both
  times.

## RULE: when a test fails, which of the two is wrong is a DECISION

The reflex is to change the code. It is right often enough to become automatic,
and that is what makes the exception dangerous.

**The instance.** I wrote `pickDisambiguated([100, 50, 100])` expecting the
second perfect score to be ignored — "it is third in the array". The code ranks
by SCORE, so those two 100s are the top two and it correctly refused to choose.
The test failed. The code was right.

Had I changed the code to match the test, the rule would have accepted a
same-scoring artist **whenever the payload happened to list a weak match between
the two perfect ones** — which is precisely the case the rule exists to guard,
arrived at by making a test pass.

**The check, before touching either side:** state in one sentence what the code
does, and what the test expects, and which one describes the behaviour you
actually want. If the test's version would be a defect, the test is wrong. Write
the reason into the test when you fix it, so the next reader does not re-derive
it — the corrected test now carries a paragraph explaining what it originally
claimed and why that was worse.

Related to the fixture rules above but distinct: those are about tests that
cannot fail. This is about a test that fails correctly and is still wrong.

## Step 13c unit 1 — the snippet column and the ownership rule

The migration A4 implied and never produced, plus §7.8's rule as pure state. **No
LLM in this unit**, by design (§12): every other failure in this feature is
recoverable, and silently overwriting text the user wrote is not.

**The migration's verification is a command, per CLAUDE.md §2's carve-out**, and
the objects were checked rather than the exit code: test database reset to empty,
16/16 applied, both columns present as `text` and `timestamptz`, nullable, no
defaults, 23 tables.

### What the tests constrain, proved by mutation

13 query-layer tests and 12 route tests. Seven mutations, all caught:

| mutation | caught by |
|---|---|
| M1 ownership guard removed | 2 tests |
| M2 delete also clears `snippet_edited_at` | 2 tests |
| M3 confirmed replace keeps the timestamp | 1 test |
| M4 edit does not set the timestamp | 4 tests |
| M5 `not_found` collapsed into `user_owns_snippet` | 1 test |
| M6 `.strict()` removed from the edit schema | 1 test |
| M7 DELETE ignores not-found | 1 test |

M1 is the one that matters: it is the permanent-damage case, and the test asserts
BOTH that the refusal is reported and that the text is unchanged — a function can
return a refusal and still have written, and the write is what does the damage.

### The refusal and the write are one statement

`WHERE snippet_edited_at IS NULL` sits in the UPDATE rather than in a preceding
SELECT. A read-then-write is check-then-act: an edit committed between the two
would be overwritten by a regeneration that read a null timestamp and believed
it. Small window, permanent loss — the same combination as §7.3's acquire flow
and §9.2's limiter. **Zero rows updated IS the refusal**, and the caller learns
the outcome from what the database did.

### A test that was wrong, said so rather than adjusted quietly

Two route tests failed with `expected 400 to be 404`. The cause was the test, not
the code: `MISSING` was the nil uuid `00000000-...`, which `isUuid` correctly
rejects as malformed — the pattern requires a version digit and a variant nibble
— so it exercised the 400 path and never reached the 404 one. Replaced with a
well-formed v4 that matches no row, and the reason is recorded in a comment above
the constant so the next person does not "simplify" it back.

### Two cross-file failures, in files this unit never opened

Both found by the full-suite rule (CLAUDE.md §10), both real:

1. **`migrations-complete` failed because 0015 was UNTRACKED.** The journal is
   tracked and was modified; the SQL and snapshot were new and unstaged. That
   test copies TRACKED FILES ONLY, so the simulated clone got a journal entry
   pointing at a migration file that did not exist. **This is R1's
   untracked-migration defect, caught again by the test written for it.** Staged;
   passes.
2. **`neon-transactions` failed because the Neon branch was five migrations
   behind** — inserts now name `snippet`, which that branch lacked. Not caused by
   this unit; this unit is what made it visible, being the first change to add a
   column those tests write through. Its own entry above.

### Verification

vitest **2721 passed, 1 skipped, 172 files**. Neon gate **10 passed, 1 skipped**
(the skip is the gate's own marker correctly not firing). typecheck, lint, build
clean. Full E2E **237 passed, 2 failed, 3 flaky** — both failures login-stage on
`wall-scene.spec.ts`, which contains zero references to snippet; see the
contention correction above.

**Unit 2 (the generation path) and unit 3 (the panel UI) are NOT built.** `POST
/api/records/:id/snippet` is specified in §5.2 and deliberately absent from the
route file, which says so.

## Step 13c unit 2 — the generation path, and R5's finding 4 decided

### Finding 4: the two callers needed DIFFERENT limits, which is the finding

`client.ts`'s `MAX_TOKENS = 4000` was shared and commented "short by
construction: §9.2 wants a handful of suggestions, not an essay". R5's live run
contradicted the comment — 34 suggestions, 2994 output tokens, `stop_reason:
end_turn`. The model finished; it did not hit the ceiling. So 4000 is not
"short", it is where a full gap analysis happens to fit, and "a handful" was the
only place in the codebase a count was written down.

**Measured, then split:**

| caller | natural bound | budget |
|---|---|---|
| §9.2 gap analysis | **none in the spec** | `GAP_ANALYSIS_MAX_TOKENS = 4000` (unchanged) |
| §10b snippet | "two or three sentences" ≈ 200–400 chars ≈ **100 tokens** | `SNIPPET_MAX_TOKENS = 400` |

The shared constant was ~40x what a snippet can use. **A ceiling 40x larger than
any correct response is not a safety net** — a runaway answer looks exactly like
a normal one and costs forty times as much.

**§9.2 still has no count limit, deliberately.** Nothing in §9.2 or §5.8 bounds
the number of suggestions, and a server-side slice would discard output the
account was already billed for. If a count is ever wanted, the honest place is
the PROMPT. Recorded in `client.ts` rather than fixed, because 34
grouped-by-genre suggestions were judged good on the one real run there has been.

**That §10b has a bound and §9.2 does not is the substance here.** A spec that
says "two or three sentences" has already answered the question; a spec that says
nothing has left it open, and the shared constant hid the difference.

### What is ENFORCED versus INSTRUCTED, stated rather than implied

§10b: "It never contradicts entered data. It does not state a pressing, a year,
or a price." **That is an instruction to a model, and no parser can check it.** A
snippet asserting "released in 1982" for a 1981 pressing is valid prose, and the
app cannot check a claim about music against the world — CLAUDE.md §8's worst
shape, confidently misleading.

So the module states the split in a table rather than letting the prompt read as
a guarantee (A29d is the precedent — an amendment claimed the genre validation
enforced a rule it could not, and three files repeated it):

| mechanism | kind |
|---|---|
| **the record's own facts are NOT SENT** | **enforced** |
| the prompt forbids years, pressings, prices | instructed |
| the prompt asks for omission over guessing | instructed |
| the output is labelled generated (unit 3) | enforced, but mitigates rather than checks |

**The only enforced mitigation is withholding**, and it is structural: the model
cannot contradict a year it was never told. `findRecordSubject` selects `artist`
and `title` and nothing else, and lives in `snippet.ts` beside the rule rather
than in `records.ts`, so no caller has to remember what not to send. A sentinel
test asserts no year, price, label or matrix reaches the prompt even when extra
keys are spread into the subject.

**Sending the year "so the model can avoid contradicting it" is the trap** — it
hands over the exact value most likely to be repeated back as an assertion.

### Unit 1's refusal is consumed, and mutation found where that was not true

The route checks ownership BEFORE claiming a slot and before calling, which
reverses §9.2's order deliberately: §9.2's failures are only knowable after the
call, while this refusal is knowable from a column. Generating first would bill
the account and burn one of ten hourly slots to produce text thrown away.

**The pre-check is an optimisation, NOT the guard.** Unit 1's write refuses
atomically in the same statement as the write, and that is what makes the
pre-check safe to be advisory.

**M12 proved the tests did not know that.** Making the route pass
`confirmReplace: true` to the write — defeating unit 1's guard completely —
**passed all twelve route tests**, because every one exercised the sequential
case the cheap pre-check already catches. Two rules that can disagree, and only
the race distinguishes them.

The window is real: R5 measured 44s for a gap-analysis call. A user editing their
snippet in that window would have their text overwritten by a generation that
read a null timestamp before they typed.

Fixed by a test that commits the edit **from inside the mocked client** — the
only place genuinely between the pre-check and the write. M12 is now caught.
**Same shape as the limiter's concurrency test in unit 4a: a sequential test
passes with the guard removed, and only a barrier at the right point proves the
code relies on it.**

### Verification

vitest **2746 passed, 1 skipped, 174 files**. typecheck, lint, build clean.
Mutations M8–M12 all caught (M12 only after the race test was added).

**Unit 3 (the panel UI) is NOT built.**

## Step 13c unit 3 — the panel UI, and step 13c closes

### The wall is for looking, the detail page is for editing

§10b says the snippet "sits in the panel beside the record", and that panel is
the wall's `FactsPanel` — DOM beside a WebGL canvas, with no form controls. The
edit, delete and confirmation affordances went to `/records/[id]` instead, which
is where the snippet's siblings already live: journal entries, prices, images.
**A19e drew this line first** by putting the facts in DOM rather than canvas so
they could be read; editing is one step further along it, and §7.8 makes an
edited snippet the user's own text.

The wall still shows the snippet, **read-only and with the same label**. §10b's
point is that it sits where liner notes would, so it must not read as liner
notes.

### The label is the mitigation, so it cannot be optional

`FactPanel.snippet` is `{ text, generated } | null`, never a bare string. Pairing
them makes it impossible to render the text without its label — a
`snippet: string | null` would have allowed exactly that. Nothing in the pipeline
verified this text; unit 2 established that WITHHOLDING the record's facts is the
only enforced mitigation, so the label carries what the code cannot.

**`generated` is false once the user has edited it.** Their writing attributed to
the model is the same misattribution as the model's writing presented as fact,
reversed.

### One producer, per the standing rule

`hydrateRecord` already carried `snippet` and `snippetEditedAt` — it uses
`select()` — so the detail page needed nothing. The WALL did: `ShelfRecord` now
selects both in `shelf.ts`, beside `spine_colour`. Two producers of the same
field is the shape NOTES records under `genreSubtree` and `hasGatefold`, and the
wall already loads every record it draws.

The type change surfaced all three call sites at compile time rather than at
runtime, which is the argument for the field being on the type rather than
fetched where needed.

### A case the first implementation got wrong: the DELETED snippet

`snippetView` initially returned `confirmBeforeRegenerating: false` whenever
`snippet` was null — treating "no text" as "nothing to lose". Wrong: §4.2 says
"a deliberate deletion is an edit", so **the user owns the ABSENCE**, and
generating over it would silently overrule the choice they just made.

**Ownership and presence are separate questions**, and `kind` and
`confirmBeforeRegenerating` are separate fields because of it — the panel shows
nothing while the action still asks. Deriving one from the other collapses
exactly this state. It also needs its own sentence: "your version will be lost"
is false when nothing is lost, so the deleted case says "You deleted the snippet
for this record. Write a new one?"

Caught by writing the test before assuming the two-state model was complete.

### A31a's two rules, as implemented

- **Confirmation only where there is something to lose.** Never for an absent or
  generated snippet, always for an edited or deleted one. Same reasoning as the
  cover notice firing on `failed` and never on `none`: confirming every
  regeneration trains the user to dismiss the one that matters.
- **The confirmation names the text, not the rule.** Pinned by tests asserting
  both directions — it must say what is lost, and it must never contain
  `snippet_edited_at`, `timestamp`, `column`, `null` or `409`.

### The E2E found a real inconsistency, not just a test problem

The confirm-dialog specs hung for 30s waiting for a button that never rendered:
the control was gated on `configured` and `.env.test` has no `ANTHROPIC_API_KEY`
(§11 forbids live calls). **The panel dropped the button silently** — while
`GapAnalysis` names the same situation, for a reason it states: "a button that
silently does nothing reads as broken; saying which credential is missing turns a
mystery into a deployment task."

That is A31a's own argument about hiding a capability, applied to the deployment
case, and the panel was inconsistent with the app's existing answer. Now named
rather than absent, and the E2E asserts the named state — which this environment
genuinely has.

**The confirmation itself is covered where it is REACHABLE**, and the spec file
says so, so nobody adds a browser assertion back and watches it hang:
`snippet-view.test.ts` pins when it fires and what it says;
`record-snippet-post.test.ts` pins the server-side refusal and the
edit-during-generation race.

### Verification

vitest **2765 passed, 1 skipped, 175 files**. typecheck, lint, build clean. Full
E2E **246 passed, 0 failed, 0 flaky**.

**STEP 13c IS COMPLETE** — all three units. With §9.1, §9.2 and the snippet
built, **step 14 closes.** Next is step 15, whose FIRST unit is per-worker E2E
test-data isolation (see the decision above), before any mobile screen work.

## The Neon test branch has NO supported migrate command — the tooling has no path

Found 2026-08-20, 13c unit 1. **Third database-behind-its-schema instance this
session**, and this one is not a lapse: nothing anybody could have run would have
kept it current.

**Measured.** `drizzle.config.ts` calls `parseEnv` then `resolveDriver`, which
select between `DATABASE_URL` and `TEST_DATABASE_URL`. **`NEON_TEST_DATABASE_URL`
appears nowhere in `drizzle.config.ts`, `env/schema.ts` or `connection-string.ts`
as a migration target.** `npm run db:migrate` cannot address the branch, and
`TEST_DATABASE_URL=<neon-url> npx drizzle-kit migrate` is refused by
`assertLocalTestDatabase` — correctly, since that variable is what integration
tests TRUNCATE, and pointing it at a remote database aims a truncate at it.

So the guard is right, the config is not wrong exactly, and between them there is
no route. **The branch drifted three times because the tooling has no path, not
because anyone forgot.** That distinction matters for the fix: a checklist item
would not have helped.

**State when found:** ledger 11 rows against journal 16, with 0011–0013's schema
ALREADY PRESENT and unrecorded — the same ledger-versus-schema divergence dev
had, one migration further behind. A plain `drizzle-kit migrate` would have died
on 0011 or 0012 inside drizzle's single wrapping transaction, rolled back, and
printed "migrations applied successfully". Checked BEFORE running anything, on
the developer's instruction, which is what stopped a command that would have
reported success and changed nothing.

**Repaired by recreating the branch from empty** rather than by backfilling the
ledger, which is available here and was not available for dev: the branch is
explicitly "the throwaway test branch" (`neon-test-branch.ts`), holds no data
anyone needs, and `truncateAll` clears it between tests anyway. One clean run
against an empty database applies all 16 and records all 16 — no completeness
audit, no backfill, no risk of recording a half-applied migration. **Recreating
beats repairing whenever the data is disposable**, and it verifies the migrations
run clean from empty on Neon, which is R6's question anyway.

The command used, for the next person: a `drizzle.config.neon-test.ts` written
INSIDE the repo (drizzle-kit resolves its modules from the config file's
location, so a temp-dir config cannot load it — `migrations-complete.test.ts:129`
documents the same constraint), reading `process.env.NEON_TEST_DATABASE_URL`
directly. It never touches `TEST_DATABASE_URL`, so the guard is not bypassed —
it is simply not on that path.

**One thing verification turned up that the exit code would not have.** After
migrating, the branch's ledger holds **17 rows against 16 journal entries**. The
extra is `created_at=1786715119768` — matching no journal entry, one millisecond
after 0010 — **the byte-identical orphan row the dev database carries.** Two
independent databases, the same stray timestamp: the branch was almost certainly
created FROM dev after that row existed, which also explains how it inherited
dev's divergence. It is inert (below the high-water mark, so it can never gate a
migration) and is left alone on both. The correct ledger assertion is "every
journal entry has a row with a matching hash", not "the row count equals the
journal length" — my first verification script asserted the latter and failed on
a healthy database.

**R6 item, and the serious version is production.** R6 owns deploy readiness. The
same divergence against the production Neon database is materially worse: the
repair used here depends on the data being disposable, and production's is not,
so the only route there is dev's — verify each drifted migration is COMPLETE,
backfill the ledger, then migrate. That worked on dev by luck rather than by
guarantee; a production database whose schema half-moved has no cheap recovery.
R6 should establish (a) whether production has the same drift, (b) what command
is supposed to migrate it and whether that command exists, and (c) a check that
notices within one deploy rather than three steps later.

**Trigger: R6, before the first deploy.**

## An amendment is a claim about the DOCUMENT, not about the database — and nothing checks the difference

Noticed 2026-08-20, planning 13c unit 1. **Second instance this session**, which
is what makes it a pattern rather than an incident.

**A4 added `snippet` and `snippet_edited_at` to §4.2 and the columns were never
created.** Measured before planning anything on top of them:

| location | `snippet` / `snippet_edited_at` |
|---|---|
| SPEC §4.2 (lines 157–158, 164) | **present**, with the full §7.8 rationale |
| `src/db/schema.ts` | **absent** |
| all 15 `drizzle/*.sql` | **absent** |
| dev Neon `records` | **absent** |

The spec has described these columns — including a careful paragraph on why
`snippet_edited_at` is a timestamp rather than a boolean — through every step
since A4 was written. Nothing referenced them, so nothing failed.

**The two instances differ in mechanism and share a cause:**

1. **The dev database three migrations behind** (R5): the migration EXISTED and
   had not been applied. Caught only because the feature was run for real.
2. **A4's columns** (here): the migration was never WRITTEN. Caught only because
   13c was about to build on them.

Neither was caught by a test, and neither would have been. `schema-conformance`
checks that tables in the schema obey conventions; `migrations-complete` checks
that migrations apply. **Nothing walks the other direction — from what §4 CLAIMS
to what the database HAS.** A column described in the spec and absent everywhere
else is invisible to every check this project runs.

**Why the shape recurs.** An amendment is written as a documentation edit — it
says "ADD this row to §4.2's table" — and applying it is a documentation action.
The implementation is a separate act, in a separate session, often several steps
later. A4 in particular was a *decision* amendment ("storage for §10b's
snippet"), written as forward planning, and forward planning that lands in a
normative table is indistinguishable afterwards from a description of what
exists. §4.2 does not mark which of its rows are built.

**This is the prose-and-code pattern with the prose in the SPEC**, which R5 also
met at A29d — an amendment claiming the prompt supplied a genre hierarchy it did
not supply. Three instances now, all the same: **a spec sentence asserting a
mechanism, and nothing between the sentence and the truth.**

**What would catch it.** A repo test that reads §4's column tables and asserts
each named column exists in `src/db/schema.ts`. It would have failed the day A4
was applied, and it fails loudly rather than waiting for someone to build on the
claim. Not built here — 13c unit 1 creates these two columns, which closes the
instance but not the class.

**Deferred with a trigger: R7** (the whole-codebase audit), whose stated job
includes "the spec against the app — which sections describe something that no
longer exists, or that exists differently." This is that question asked
mechanically instead of by reading, and R7 is where the answer is worth the
tooling. Recorded here so R7 inherits the mechanism rather than rediscovering it.

## The E2E flake is ACCUMULATION, not worker contention — the prescription was wrong

Diagnosed 2026-08-20, step 15 unit 1. **This overturns a deferral carried through
eleven sightings**, and the prescription it carried would have looked like a fix
while leaving the failures in place.

### What NOTES said, and why it was wrong

Every entry above says the shared resource is "test data in the one database
every worker uses" and prescribes **a schema or database per Playwright worker**.
That was written from the SYMPTOM — failures move between runs, so something must
be shared — and the diagnosis was never done, only mitigated by halving the
workers.

**Per-worker isolation would not have fixed this.** The cause is accumulation
WITHIN a run, and one worker alone accumulates just as fast.

### The measurement

**Every failure sits in the last quarter of the run.** Across three full runs,
by test index out of 262:

| run | failing indices |
|---|---|
| F2 run 1 | 222 228 230 231 232 234 236 241 243 254 256 265 267 268 269 270 271 |
| F2 run 2 | 220 222 231 233 238 239 240 246 256 258 267 268 269 |
| 13c unit 1 | 194 201 205 206 207 208 213 |

**Earliest failure: 194 of 262. Not one failure in the first 190 tests, across
roughly 800 executions.** That rules out per-test contention outright — a
collision between two workers would strike anywhere, and this strikes only late.
It also crosses projects (run 3's were all `[chromium]`), so it is not a mobile
property either.

**The cause.** `globalSetup` truncates ONCE per run and nothing cleaned up after
each spec, so a full run accumulated **724 records** — measured directly against
the test database after a run. `/` is a server component that awaits
`shelfRecords`, `records` and `facets` before responding, and every spec's
`login()` ends with `expect(page).toHaveURL('/')`, which waits for that render.
Early in a run it is fast; by test ~200 it exceeds the 5s default and the login
"fails" — in a spec that never got as far as its own assertions.

So the failure is reported against whichever spec happened to be running when the
collection got big enough, which is exactly why the failure SET moved between
runs and read as contention.

### Ruled out by measurement, not by argument

- **bcrypt.** Cost 10, measured at **68ms** per compare — ~74 concurrent logins
  to exhaust a 5s timeout. At two workers it is not the mechanism.
- **`The destination stream closed early` / `Error: aborted`.** Present in the
  logs, but occurring during PASSING tests, so incidental.

### The fix, and what it measured

`e2e/cleanup.ts` deletes the records a spec created, called from an `afterEach`
rather than a `finally` at each of sixteen call sites — the hook cannot be
forgotten and still runs after a FAILING test, which is NOTES' requirement that
bulk-seeding specs clean up on failure so one failure does not cascade.

Records deleted BEFORE the artist: §7.4 refuses to cascade a reference row in use
(409 with a count), which is correct behaviour and not something to work around.
Paginated at `pageSize=200`, because §5 CLAMPS rather than rejects a larger
value — asking for 250 would silently return 200 and leave the rest.

Measured on `wall-scene.spec.ts`, the heaviest seeder:

| | records in the test database |
|---|---|
| after a full run, before | **724** |
| after `wall-scene` alone, with cleanup | **1** |
| all 16 OTHER chromium specs, with cleanup | **103** |

So `wall-scene` contributed roughly 620 of the 724 on its own, and the remaining
floor is 103. 17/17 wall-scene tests still pass.

### Per-worker isolation stays OPEN, on evidence rather than prescription

Not declined. It answers a question cleanup does not: NOTES records four
CROSS-SPEC collisions — two projects seeding identical titles, a shared pressing
keyed by `discogs_release_id`, a page-1 assumption broken by another spec's 110
rows. Those are collisions between workers, not accumulation within one, and they
are currently invisible because accumulation is louder.

### MEASURED: five runs at `--retries=0` after the fix

| run | result | wall clock | note |
|---|---|---|---|
| 1 | **246 passed, 0 failed** | 7.0m | |
| 2 | **246 passed, 0 failed** | 7.1m | |
| 3 | 4 failed, 242 passed | **37.8m** | **discarded — stalled machine, see below** |
| 4 | **246 passed, 0 failed** | 7.0m | |
| 5 | 1 failed, 245 passed | 7.0m | pre-existing hydration flake, see below |

Against a baseline of **14 hard failures across five runs**, all login-stage,
that is the accumulation mechanism closed.

**Run 3 is discarded, and the reason is measurable rather than convenient.** All
four of its failing tests took **12.4–16.9 MINUTES against a 30-second
timeout**. A test cannot exceed its own timeout by 30x through slow queries —
Playwright kills it at 30s — so the timer itself fired late, which only happens
when the process is starved of CPU. The whole run took 5x longer than the two
either side of it. The failure kinds differed too: only 2 of 4 were login-stage,
the others `page.goto` and `locator.waitFor`.

**What could not be established is WHAT starved it.** Some short commands were
run during that window and are too small to plausibly explain a 30x stall; other
machine activity cannot be ruled out. Recorded as unexplained rather than
attributed, and runs 4 and 5 were taken with nothing else running.

**Run 5's single failure is a DIFFERENT, pre-existing flake.**
`collection-filters.spec.ts:421` failed on
`toHaveValue('releaseYear:desc')` receiving `""` — the `<select>` exists and its
value is empty, which is the **hydration window** NOTES documents at the top of
this file, not a login timeout. Verified as pre-existing: the same spec failed in
BOTH pre-change runs (`e2e-f2`, `e2e-f2b`). So it is neither residue from
accumulation nor introduced by the cleanup.

### THE RESIDUE: nothing surfaced, so isolation's case is NOT made

Across the four valid post-fix runs (1, 2, 4, 5 — roughly 1,000 test
executions), the complete list of failures is:

    1 x e2e/collection-filters.spec.ts:421   (the pre-existing hydration flake)

**Not one cross-spec collision appeared.** The noise floor dropped by an order of
magnitude and nothing was revealed underneath it.

That is the evidence the decision was waiting for, and it points the other way
from the prescription. **Per-worker isolation is DEFERRED, not built** — the
four collisions NOTES records were each found while investigating something else,
they remain theoretically possible (they collide on CONTENT, which cleanup does
not touch), and they are not currently happening at a rate any measurement can
see. Building a schema-per-worker harness against a defect that four runs cannot
observe is exactly the "mitigation before diagnosis" this entry was written to
correct — one level up.

**Trigger: a cross-spec collision that is actually observed.** The signature to
watch for is a failure whose cause is another spec's DATA rather than the volume
of it — a duplicate title, a shared `discogs_release_id`, an assertion about page
1. That is a different shape from the login timeout and will be recognisable.
`--retries=0` is what makes it visible; keep using it when measuring.

**The honest summary of this unit:** the deferral was carried for eleven
sightings on a prescription that would not have worked, the actual cause was
found by asking where in the run the failures sat, and the fix is one `afterEach`
in one spec file. The expensive harness change was never needed.

**Next: read the residue.** If cross-spec
collisions surface once the noise floor drops, that is isolation's case made on
evidence. A single clean run proves nothing at the measured rate — the standard
NOTES set the last time this was measured was three consecutive runs, before and
after.

**Why the four collisions are orthogonal to this fix, stated so the next reader
does not assume cleanup covered them.** They collide on CONTENT, not on volume:

| collision | does cleanup touch it? |
|---|---|
| two projects seeding identical titles | **no** — both still seed the same string, concurrently |
| a shared pressing keyed by `discogs_release_id` | **no** — §4 makes pressings found-or-created and SHARED by design |
| `beforeAll` seeding with `afterAll` cleanup, removing a row a parallel worker was using | **no** — and cleanup adds a teardown, so this class gets slightly larger |
| the no-live-call guard not firing because another spec had seeded the release | **no** — the cache answers regardless of how many rows exist |

Cleanup lowers the VOLUME, which is what made the login render slow. It does
nothing about two workers writing the same name at the same moment. Those four
were each found while investigating something else and each presented as a
different bug — so the honest expectation after this fix is that some of them
become visible rather than that they were fixed.

The third row is worth flagging as a risk this unit introduces: `afterEach`
cleanup is a teardown that deletes rows while another worker may be reading them.
It is scoped to the artist the spec created, so a collision needs two specs
sharing an artist id, which the `suffix()` naming makes unlikely — but "unlikely"
is what the four instances above were each called before they happened.

## Per-worker test-data isolation — DECIDED: step 15, unit 1 (was deferred to step 16)

The E2E flake rate is mitigated (workers 3 → 2) but not diagnosed. Four spec
files have now flaked under load — `record-form`, `manage`,
`collection-filters`, `stats` — which means the shared resource is the single
test database every worker uses, not any individual spec.

**The real fix is per-worker isolation**: a schema or database per Playwright
worker, created in `e2e/global-setup.ts` and selected in `test/helpers/db.ts`.
That is a substantial harness change and does not belong in a feature step.

Current rate: 1 flaky in 5 full runs at workers=2, versus 2 in 2 at workers=3.
Low enough that a regression would still stand out. **Revisit only if the rate
climbs** — recorded here so the next person does not re-investigate the spec
that happened to fail.

### THE TRIGGER HAS FIRED — 2026-08-20, R5's remediation. Move this to step 15.

**The rate climbed, and the failure CHARACTER changed.** Three full runs during
R5's remediation:

| run | hard failures | flaky |
|---|---|---|
| after F1 | **0** | 2 |
| after F2, run 1 | **7** | 3 |
| after F2, run 2 | **5** | 3 |

The baseline above is "1 flaky in 5 full runs" with **zero hard failures**. Two
runs in three now produce five to seven tests that exhaust their retries. A flaky
test costs a retry; a hard failure means the suite cannot answer the question it
was run to answer.

**Every hard failure fails at LOGIN** — `toHaveURL('/')` receiving `/login` —
before reaching any assertion. The failure set MOVES between runs (eleven
distinct specs across the two F2 runs, one overlap), which is what identifies it
as contention rather than regression, per the moving-failure rule.

**CORRECTION, two runs later: it is not mobile-only.** This entry first said
"every hard failure is `[mobile]`, zero on chromium", which was true of the two
runs then measured and false as a general claim. 13c unit 1's full run failed
**2 on `[chromium]`** (`wall-scene.spec.ts:900` and `:956`), same login-stage
signature, in specs containing zero references to the code that unit changed.

Five full runs during R5's remediation:

| run | failures |
|---|---|
| after F1 | 0 |
| after F2 run 1 | 7 mobile |
| after F2 run 2 | 5 mobile |
| after finding 3 | 0 |
| after 13c unit 1 | 2 chromium |

**14 hard failures: 12 mobile, 2 chromium.** The mobile skew is real and large,
which is why the step 15 argument holds — but "zero on chromium" was an artefact
of a small sample, and a claim that the contention CANNOT reach chromium would
have been wrong. The shared resource is the one test database every worker uses,
which is not a per-project resource; the mobile project simply runs more of the
specs that collide.

**This does not weaken the step 15 decision, and slightly strengthens it.** The
argument was never that chromium is immune — it was that step 15 has no
independent project to cross-check against, because the project it exercises is
the subject. A contention that reaches both projects makes "does it also fail on
chromium?" a weaker diagnostic everywhere, not a stronger one.

**Why the deferral to step 16 should move to step 15, before step 15 starts.**

Step 15 is "Mobile pass across all screens. E2E #10" — a step whose verification
is almost entirely mobile E2E, on the exact project where 100% of these failures
land. Running it against this instrument means every real defect arrives mixed
with five to seven false ones, and the tell for a genuine mobile regression —
"tests fail on mobile" — is indistinguishable from the noise floor.

**This is R5's own lesson repeating.** The review's manual half was blocked by a
dev database three migrations behind: the check could not fail informatively
because the instrument was wrong, and fixing the instrument came first. A
mobile-focused step measured by a mobile suite that fails a dozen mobile specs
per run is the same shape. **Fix the instrument before the step that depends on
it.**

Also note 13b ("arrow navigation between records") is already triggered on step
15, so step 15 is carrying feature work as well as a sweep — more reason for its
measuring instrument to be trustworthy.

### THE DECISION: per-worker isolation is step 15's FIRST unit

**Agreed and recorded 2026-08-20.** This is no longer a step 16 deferral. It is
the first unit of step 15, to be built BEFORE any mobile screen work.

**The argument is indistinguishability, and step 15 is the one step where it is
fatal.**

A genuine mobile regression presents as *"tests fail on mobile."* The contention
presents as *"tests fail on mobile."* They are the same observation. Everywhere
else in the build that ambiguity is tolerable, because mobile E2E is incidental
to what the step changes — a failure there is one signal among several, and the
chromium project gives an independent read.

Step 15 is the exception on both counts. **Mobile is what it changes, and mobile
E2E is how it is verified.** There is no second project to cross-check against,
because the whole point of the step is the project that flakes. So the one
diagnostic that would distinguish a real regression from the noise — "does it
also fail on chromium?" — is unavailable exactly where it is needed, and five to
seven false failures per run sit on top of however many real ones the step
introduces.

That is not a slower step; it is a step whose results cannot be read.

**Scope.** A schema or database per Playwright worker, created in
`e2e/global-setup.ts` and selected in `test/helpers/db.ts`. A harness change, not
a spec change. It does not belong in a feature step — but it belongs even less
AFTER the step whose results it would have made legible.

**The alternative was already measured and rejected.** Reducing workers trades
wall clock for a symptom: 2 of 2 runs flaky at workers=3, and workers=2 still
produced 7 and 5 hard failures during R5's remediation. Fewer workers makes
collisions rarer, not impossible, which is what "mitigation, not diagnosis"
predicted.

**Precedent for the ordering.** R5's manual half was blocked by a dev database
three migrations behind: the check could not fail informatively because the
instrument was wrong, and the instrument had to be fixed first. Same shape, and
the cost of getting it wrong is higher here — a stale database announced itself
with `relation "llm_requests" does not exist`, while a noisy test suite announces
itself as a passing-looking run with some failures somebody will attribute to
flake.

**Also relevant:** 13b (arrow navigation between records) is triggered on step
15, so the step carries feature work as well as a sweep. More reason for its
measuring instrument to be trustworthy.

**Not built in R5's remediation** — R5 is a review, and this is step 15's first
unit. Recorded with the measurement so it is not re-investigated from scratch.

## Step 11 unit 6c — the lineup trigger, picker and progress

- **The score-gap rule was replaced by a name-identity rule**, and the reason is
  worth keeping because the wrong rule looks more sophisticated. MusicBrainz
  ranks by how well documented an artist is, so among four groups called
  Discharge the famous d-beat band scores 100 and the others 83, 82, 82. A gap
  rule auto-accepts exactly the case it was written to catch. The new rule:
  accept only when no other result carries the same name.

  **The old rule's justification in SPEC.md was a measurement nobody took** —
  "both Discharges score 100", true of a `country:GB`-filtered query and false of
  the one the code sends. Found by measuring before building the picker.

- **Progress is derived from rows the walk already writes**, not from a progress
  table. That required making the walk save each membership as it resolves one
  rather than batching at the end — a change to an approved unit, and a better
  one: a process killed mid-walk previously lost every row. The partial-failure
  path handled a REFUSAL and could not handle a crash.

  Tested by counting rows from INSIDE the mock, between the first and second
  member fetches. Asserting after the walk cannot distinguish incremental from
  batched — both end with the same rows.

- **The picker shows what the name could not.** Disambiguation comment first,
  then type · country · life-span: "UK hardcore punk/d-beat band · Group · GB ·
  1977–" against "UK punk band, only one release · Group · GB · 1978–1980". The
  name appears nowhere on the cards, because the name is why they are there.
  Release counts were considered and rejected — one extra request per candidate
  at 1/sec, and they say less than a life-span.

- **A mutation checking only the runner-up survived** the four-Discharge fixture
  because the duplicates were adjacent. Fixed by putting a differently-named
  artist between them, which is the real shape: "Discharge" returns four
  same-named artists interleaved with "Amphetamine Discharge" and "Triple
  Discharge".

## For step 12: tribute acts are noise, side projects are the feature

Adam's distinction, and it should shape the graph's filtering rather than the
walk's depth:

**A side project is interesting because it might have records worth buying. A
tribute act never does.** That is a difference the data can express, and it is a
sharper rule than anything about graph distance.

Measured after the first live walks — 2 lineup imports created 36 distinct
groups and took the artist list from 6 to 71:

| Artist | as_group | as_person | reached via |
|---|---|---|---|
| Dire Straits | 9 | 0 | requested directly |
| Dire Straits Experience | 1 | 0 | Chris White's other bands |
| Dire Straits Legacy | 1 | 0 | Alan Clark's other bands |
| Mark Knopfler's Guitar Heroes | 2 | 0 | Knopfler + Fletcher |

**A depth limit was considered and rejected.** All the noise arrives on the
depth-2 hop — but so does the entire feature: §12 step 11 asks for "side-project
relationships", and §4.3's `shared_member` edge exists only because of that hop.
Cutting to depth 1 gives a member list and no graph. The noise is not depth, it
is that 36 groups are equal in a flat list when a handful matter.

**Tools available to step 12, none of which need the import to change:**

- **MusicBrainz's own `tribute` relationship type** — `normalizeRelations`
  already discards it, so a tribute act only appears here because its members
  are real people who also played in the real band. The relation exists on
  MusicBrainz and could be fetched to mark the group.
- **Shared-member count as an edge weight** (§8.1's `shared_member`, whose
  weight the spec still does not define). Dire Straits Experience shares ONE
  member with Dire Straits; a genuine side project usually shares more, and a
  tribute act's overlap is often a single hired player.
- **Whether the group has records at all.** The strongest signal for "worth
  buying" is the one the collection already answers.

A group connected by one member who also plays in a tribute act looks identical
at import time and quite different in a graph weighted by shared members. That
is why this belongs in step 12 and not in the walk.

## `openResource` navigates, so a caller cannot navigate first

Found while making the /manage artist filter green. The two step 11 lineup tests
both failed, and the first fix — changing their `page.goto('/manage')` to
`?artists=all` — did nothing at all, because `openResource` does its OWN
`page.goto('/manage')` and silently overwrote it. The second run failed
identically to the first.

**What gave it away was the page snapshot, not the stack.** The error context
showed the string "more from lineup imports" — the summary variant that only
renders when `showingAll` is FALSE. The param had not survived to the server
component, which pointed at navigation rather than at the query or the filter.

`openResource` now takes a `search` argument and owns the only `goto`. Worth
knowing generally: **a helper that navigates makes every caller's own navigation
dead code**, and it fails by silently showing the default page rather than by
erroring — which reads as "the feature is broken" instead of "the URL was
discarded".

A related latent flake, fixed in passing: the progress test clicked the lineup
button with no prior wait for the row to exist, unlike the picker test beside
it. It passed only because the row happened to render fast enough.

## Ordering by uuid makes a test a coin flip (unit 12b)

`shared_member` orders its pair by artist id (§8.1), and artist ids are random
uuids. A test that expected `source: a1, target: a2` — insertion order — was
therefore asserting a 50/50 outcome. **It passed when the file ran alone and
failed in the full suite**, which reads like cross-test pollution and is nothing
of the kind: same test, same data, different uuids.

The fix was to sort the pair in the expectation, the same rule the code follows.
Worth generalising: **whenever output ordering is derived from a generated id,
the test must derive its expectation the same way rather than from the order
rows were inserted.** Insertion order is the intuitive guess and it is wrong
half the time, which is the worst possible failure rate — frequent enough to
break CI, rare enough to look like a flake.

I re-ran the file six times after fixing it, because one green run of a coin
flip is not evidence.

## Two open questions for 12c/12d, not acted on

- **Genre nodes are unfiltered by ownership in one respect.** `buildGraph`
  emits a genre node for any genre tagged on an owned record, which is correct,
  but a genre whose only records fall outside a `genreId` subset still needs
  checking against the real data once the screen exists.
- **`member_of` weight is the person's own owned-record count**, per §8.1's
  "count of records linking the pair". For a membership that is the reading
  that makes sense, but it means a prolific solo artist has a heavy edge to a
  band he played one session for. Worth looking at on the rendered graph before
  deciding it is wrong — which is exactly the tribute-act instruction: build it,
  look at it, then decide.

## zod 4's `.uuid()` rejects a hand-written uuid (unit 12c)

`11111111-2222-3333-4444-555555555555` is uuid-SHAPED and not a valid uuid: zod
4 enforces the version and variant nibbles. The "unused id" constant in the
route tests was therefore rejected at validation and never reached the query,
turning a test written to assert *200 with an empty result* into an assertion
about a 400.

It failed loudly and immediately, so it cost nothing — but the same constant in
a test asserting a 404 or a 400 would have PASSED, for entirely the wrong
reason. Any test that needs a well-formed-but-unmatched id should use a real v4
(`3f2504e0-4f89-41d3-9a0c-0305e82c3301` here) rather than a readable pattern of
repeated digits.

## An unrelated mobile flake in stats.spec.ts, not fixed (unit 12c)

`the stats screen is reachable from the nav, not only by URL` failed once on
mobile during a full E2E run — `toHaveURL` timed out at 5s after clicking the
nav link. It is not caused by unit 12c, which added an API route and no nav or
screen: verified by stashing the unit's two files and watching it pass, then
restoring and running it six times (green), then running the full suite again
(green, 310 passed).

**Recorded rather than fixed, and deliberately not called fixed.** It reproduces
only under full-suite load, so the six-run check is weaker evidence here than it
was for the uuid coin flip — a single full-suite pass afterwards does not prove
absence. The likely shape is the default 5s `toHaveURL` timeout being tight for
a mobile nav click when workers are saturated; the neighbouring assertions in
that file pass `timeout: 15_000` explicitly. Worth watching for a second
occurrence before touching it.

**Second sighting, unit 12g** — same signature, different file:
`graph.spec.ts`'s nav test, mobile only, `toHaveURL` timing out after a nav
click, flaky under full-suite load and 12/12 green in isolation. Two files now
share it, so it is a pattern rather than one bad test.

A mechanism that fits both: `AppHeader`'s nav is `overflow-x-auto` and now
carries SIX links. At 390px the later ones start outside the scroll container,
Playwright auto-scrolls to reach them, and under load the click can land
mid-scroll. Both failing tests click a nav link near the end of that row.

Mitigated in graph.spec.ts with an explicit `scrollIntoViewIfNeeded()` before
the click — the assertion is untouched. **Called a mitigation, not a fix**: it
only ever reproduced under full-suite load, so the evidence is one clean full
run, which is weak.

## FOR STEP 15's MOBILE PASS: six links in a scrolling nav

The flake above is a symptom; this is the finding. `AppHeader` now carries six
links — Collection, Want list, Look up, Stats, Graph, Manage — in a single
`overflow-x-auto` row.

**Measured at 390px, not assumed:** the nav needs `scrollWidth` 394 in a
`clientWidth` of 237, and **three of the six links are entirely off-screen** —
Stats (right edge at 409), Graph (466) and Manage (535), against a 390px
viewport. They sit behind a horizontal scroll with no affordance indicating
there is anything there.

That is a real usability problem, not a test-timing one. §10 makes mobile an
equal priority and describes the phone case as "standing in a record store" —
and half the app is invisible there. The test flake was the cheap symptom; a
user simply does not discover the tail of that list.

Worth noting it predates this step, and this was measured too rather than
assumed — the Graph link was temporarily removed and the page re-measured. At
five links: `scrollWidth` 337 in the same 237px container, with Stats and Manage
already off-screen. **Step 12 took it from two hidden links to three.** The
Graph screen did not create the problem, it made it measurable.

Not acted on, because it is a §10 navigation change rather than anything step 12
called for. Options worth weighing at step 15: a wrapping two-row nav on narrow
widths, a scroll affordance (fade or chevron), or moving the rarely-in-store
screens (Stats, Manage, Graph) behind a menu. **Adding a seventh link before
this is addressed will make it worse.**

## DOM presence is not visibility (unit 12g)

**Recorded with the assertion-shape class above, as its fourth instance** — same
cause as the `toContainText` variant, so it belongs in that table rather than
standing alone. Short version: two E2E tests counting `graph-node` elements
passed on mobile while the canvas was hidden by CSS.

A related cost, noted at the swap in page.tsx and not fixed: because it is CSS
rather than a gate, a phone still mounts the canvas and runs its 300-tick force
simulation to produce a picture nobody sees. That is wasted work on the device
least able to afford it. Fixing it properly needs a client-side width check,
which trades a hydration concern for a performance one — worth doing only if the
graph grows enough for the simulation to be felt.

## Two bugs the tests passed and the screenshot caught (unit 12d)

Both were found by rendering the graph and looking at it. Neither would have
been caught by any test in this repo, and the first is the more instructive.

**Clicking a node did nothing.** `onPointerDown` called `setPointerCapture`,
which swallows the click that follows — so §8.1's click-to-filter, the whole of
§11 flow #6, silently did not work in a browser. What made it diagnosable was
that KEYBOARD activation navigated correctly: same handler, same route, so the
fault had to be in pointer handling rather than in the navigation. Capture is
now deferred until the pointer has actually moved a pixel.

**Three of seven nodes were drawn outside the canvas.** A fixed 900×560 viewBox
clipped whatever the charge force pushed beyond it. The tell was in the render
itself: the header read "7 nodes" while four were visible — the count and the
picture disagreeing, which is the kind of internal contradiction worth building
into a UI deliberately, because it is what made a silent bug loud.

The viewBox is now fitted to the settled layout. **This is not layout tuning
against §8.1** — no node moves, the camera is pointed at where the simulation
put them. Framing a photograph, not staging one. `boundsFor` and `radiusFor`
moved into `graph-layout.ts` with unit tests, per §2's rule that the probe which
found a bug becomes a test.

**The general lesson: a graph screen cannot be verified by assertions alone.**
Every E2E test passed while the node click was dead, because they asserted node
COUNTS. Flow #6 caught it only once it clicked a node and followed the URL.

## Artist nodes are all one colour, and it shows (unit 12d, for 12e or later)

§8.1 says "colour by top-level ancestor genre", but the §8.1 payload gives an
artist node no genre — only genre nodes carry `parentGenreId`. So artists render
neutral grey and the palette only ever appears on genre nodes.

Visible in the screenshot: two genre nodes are red and blue, and all five
artists are identical grey. Colour is doing almost no work on the screen the
user actually reads, since artists are most of the graph.

Fixing it needs a decision, not code: either the payload gains an artist→genre
association (a shape change to §8.1) or artists inherit colour from a linked
genre node in the client. Not acted on — flagged, as with the `member_of`
weight and the tribute acts.

**Resolved in unit 12e as a MISSING LINK TYPE, not a colour problem.** The
proposed fix — "artists inherit colour by walking artist → genre → root" —
turned out to be unexecutable: §8.1's four link types all connected artist↔artist
or genre↔genre, so there was no artist→genre hop to walk. Checking that before
building on it is what turned a cosmetic ticket into the real defect: the genre
nodes were ORPHANS, drawn and connected to nothing, while §8.1's own claim that
clusters emerge from "shared genres" went unmet.

§8.1 now specifies `has_genre` (weight: the artist's owned records in that
genre). Measured on a seeded graph: connections went 2 → 5 and two real clusters
formed — Discharge + The Varukers around UK82, Dire Straits + DS Legacy around
Rock — where previously every genre node floated alone. An artist whose records
carry no genre still sits alone, which is the §8.1 sparseness rule holding in the
same picture that shows the clusters.

## An inert mutation is not a passing test (unit 12e)

While mutation-checking `has_genre` I wrote a mutation meant to leak want-list
genres into the graph, and the suite stayed green. The obvious read is "the test
is decorative" — but the mutation was INERT: it only joined want-list rows with
an `acquired_record_id`, which the test's row does not have. It changed no
behaviour, so nothing could catch it.

A second mutation that actually introduced the leak failed the test immediately.
**When a mutation does not fail a test, check that the mutation does what you
think before concluding the test is worthless** — otherwise the conclusion is to
delete a test that was working, which is worse than the decorative test it was
meant to find.

## Sibling genres get different colours (unit 12f) — FIXED in 12f-fix

UK82 and US Hardcore are both children of Punk, so §8.1's "colour by top-level
ancestor" should give them one colour family. On the rendered graph they came
out blue and amber. Recorded as an `it.fails` test in `graph-colour.test.ts`, so
the defect is asserted rather than described — it turns red the moment the fix
lands.

**The cause is in the payload, not the walk.** `buildGraph` emits a genre node
only for genres with directly-tagged owned records (12b's deliberate no-rollup
rule). A Punk that has children with records but none of its own is therefore
absent, and `topLevelAncestors` applies its dangling-parent guard — which is
CORRECT for a `genreId` subset, where following a filtered-out genre would key
colour to an invisible node, and WRONG here, where the parent exists in the
hierarchy and merely owns nothing.

The two cases are indistinguishable from the payload: both look like "parent id
not among the nodes."

**It is also not only a colour bug.** `genre_parent` edges break at the same
places, so the hierarchy §8.1 claims to draw is broken wherever an intermediate
genre has no direct records.

The fix worth considering: have `buildGraph` emit ancestor genre nodes for any
emitted genre, so Punk appears whenever UK82 does. That contradicts nothing in
§8.1 — the node would carry `ownedCount: 0` honestly, and 12b's no-rollup rule
is about COUNTS, not about which nodes exist. But it does put zero-count nodes on
screen, which is what the people-are-edges rule deliberately avoided, so it is a
decision rather than a cleanup. Not acted on.

**Resolved: `buildGraph` now emits ancestors** via a recursive CTE from the
owned genres upward. Measured on the same seed that exposed it — the whole punk
family (UK82, US Hardcore, Discharge, Varukers, Black Flag) is now one blue tree
joined through a Punk node, where before UK82 and US Hardcore were separate blue
and amber islands.

**Why zero-count genres are emitted while zero-count artists are not**, since
the rules read as contradictory and the code says so at the query: the
difference is what the node is FOR. A session player at count zero is a dot
nobody would click, so it collapses into an edge. Punk at count zero is a genre
the user navigates by, and it is what its children hang from. The count stays
honest either way — zero means nothing is tagged Punk directly, which is true,
and §7.1's rollup deliberately still does not apply.

One consequence worth knowing: **the fix did not make the walk's dangling-parent
guard dead.** A `genreId` subset can still drop a parent, so that branch is now
covered by its own test rather than by the sibling case that used to reach it.

## An `it.fails` must be written against the layer where the fix will land

The sibling-colour defect was recorded as an `it.fails` in the COLOUR unit tests.
When the fix landed it did not flip to red — because that test calls
`artistGenreAncestors` directly with a hand-built genre list omitting the parent,
so it exercises the walk in isolation while the fix was in the PAYLOAD. The walk
was never wrong.

**An expected-fail that cannot observe its own fix is a false record of an open
bug**: it sits green forever, describing a defect that no longer exists, and the
next person reads it as live. Write the `it.fails` at the layer the fix will land
— here, an integration test against `buildGraph` — or don't write one.

The better half of the same finding: checking whether the walk's dangling-parent
guard had become dead showed it had NOT. A `genreId` subset can still drop a
parent. That branch had only ever been reached incidentally by the sibling case,
and it now has a test of its own.

## The Neon transaction tests need live credentials, and they expired mid-session

`test/integration/neon-transactions.test.ts` began failing 9/9 with `password
authentication failed for user 'neondb_owner'`. **Not a regression** — verified
by stashing all working changes and reproducing the identical failures on a
clean tree. It passed earlier the same day, so the credential rotated or expired
between runs.

Worth knowing for anyone reading a red suite: this file is the §2 driver-caveat
test and is the ONE part of the suite that talks to a real network service. Every
other integration test runs against local Postgres via Docker. A failure here
says nothing about the code under test.

**This credential has now expired twice.** `NEON_TEST_DATABASE_URL` was replaced
and the suite went green again (10 passed, 1 skipped, confirmed by running it,
not assumed). The pattern is worth naming because the failure mode is
misleading: **nine red tests in an otherwise hermetic suite, arriving with no
code change, that look exactly like a regression.** The tell is the error text —
`password authentication failed for user 'neondb_owner'` — not an assertion
failure. Before debugging code against a red `neon-transactions.test.ts`, check
the credential and re-run; and stash local changes to confirm the failures
predate them, which is what distinguished environment from regression both times.

---

# Steps 8–12 adversarial review — remediation

Six units, one per defect class. Three claims were re-verified by probe against
the local test database before any fix was written, because the fixes depend on
being right and a probe is cheap. All three reproduced.

## Unit 1 — `mergeArtists` failed on two of three composite keys

**Measured before the fix**, each with the transaction rolled back and the two
artists left split:

- `artist_memberships_person_group_instrument_key` — two duplicate rows for one
  person, both members of the same band on the same instrument.
- `artist_influences_source_artist_id_target_artist_id_pk` — two duplicate rows
  for one artist, both influenced by the same third artist.
- Control: the `artist_genres` path SUCCEEDED on its own duplicate, which is
  what showed the hazard was known and handled once out of three times.

**The shape worth carrying.** `merge-artists.test.ts:168` already tested the
genre collision and explained the mechanism correctly in its docblock. The same
mechanism applied verbatim to two neighbouring tables in the same function, and
neither had a test. A test that pins one instance of a general hazard reads, to
the next person, as though the hazard is handled — the docblock is written in
general terms while the coverage is specific. When a comment explains a CLASS of
bug, check every member of the class.

**Why these two are worse than genres.** Both are the ordinary case for the
duplicates the merge exists to resolve: a lineup walk that resolved one person
to two rows writes them into the same band on the same instrument, which is the
duplicate the user is merging. So the feature failed on its own reason for
existing, and only under the data that makes it necessary.

**`IS NOT DISTINCT FROM`, not `=`, in the membership collision predicate.** The
constraint is `UNIQUE NULLS NOT DISTINCT`, so two null instruments DO collide —
but `null = null` is null, which a WHERE clause reads as false. A predicate
using `=` would report "no duplicates" and then fail on the insert, which is
worse than not checking: the plan would have promised the merge was safe.
Asserted by its own test rather than assumed to follow from the named-instrument
case.

**Both membership columns are rewritten in ONE statement.** The loser may be the
person or the group; a row where it is both has already been deleted as a
self-edge. Two sequential UPDATEs could collide with their own intermediate
state, which a single CASE per column cannot.

**`DO NOTHING`, so the survivor's `strength` wins.** It is a 1–5 judgement the
user entered on the row they chose to keep, and taking the loser's would
overwrite a curated value with one arriving from elsewhere (§8).

## The 409 that dressed a fault up as a decision

`PATCH /api/artists/match-candidates/:id` caught EVERY throw from `mergeArtists`
and returned `409 MERGE_REFUSED` with `error.message` verbatim. So the constraint
violations above reached the user as

    Failed query: INSERT INTO artist_memberships (…) VALUES (…)

styled as a considered business answer, while the 409 told the caller nothing
was wrong with the server. A rule and a fault are different things and the
status code is the place that must not conflate them.

Fixed with a typed `MergeRefused`: only that becomes a 409, everything else
rethrows to `withErrorHandling` for a 500 with no internals in the body.

**This endpoint had no tests at all** — that is why its error handling was
wrong. `test/integration/api/artist-match-candidates.test.ts` now covers
CLAUDE.md §2's four cases plus the rule-versus-fault distinction. The fault test
asserts the response body does not contain `INSERT INTO`, which is the property
that actually matters and which a status-code assertion alone would not catch.

## Pre-existing E2E flake, not caused by this work

`e2e/stats.spec.ts:145` (`[mobile]`, "reachable from the nav") failed once and
passed on retry during the Unit 1 verification run: the nav link click did not
navigate within 5s. Unit 1 touched only merge, match-candidates and
merge-summary, so this is unrelated — recorded here so the next reader does not
attribute it to the merge work. Worth a look during the deferred test pass.

## Deferred deliberately, not forgotten

**The pass-4 ceremony findings**, to be done as ONE considered pass rather than
folded into defect work: ~19 near-identical auth stanzas across integration
files; `e2e/tags-auth.spec.ts`'s 18 tests × 2 projects for one middleware
matcher; the uniform 2× Playwright matrix where SPEC §11 flow 10 scopes mobile
to collection + lookup only; and the file-text tests
(`every-page-has-nav.test.ts:41` asserting `toContain('<AppHeader />')`,
`drizzle-config.test.ts:44` asserting an import statement,
`neon-gate.test.ts:55` asserting a comment). These cost runtime rather than
correctness. Mixing them into defect commits would make the defect diffs hard to
review, which is the actual reason to keep them apart.

**`LookupClient.tsx` at 561 lines, and the market rendering implemented twice**
(`MarketPanel.tsx` versus the inline block in `LookupClient.tsx`, both calling
`marketSummary`). Real duplication — `MarketPanel`'s own docblock warns that
building it per-screen "produces three implementations that drift", and `/lookup`
then does exactly that. Deferred because refactoring a working screen in the
middle of a remediation sequence is how a regression hides in a diff nobody can
read cleanly.

## Unit 2 — `genreSubtree`: three implementations, and which one was right

**The decision was made from measurement, not from recency.** One fixture,
`Punk > UK82 > Oi!`, with a single record and a single want-list item tagged
only with the LEAF `Oi!`, filtered at each of the three levels:

| implementation | leaf `Oi!` | parent `UK82` | grandparent `Punk` |
|---|---|---|---|
| `records.ts:247`   | 1 | 1 | 1 |
| `want-list.ts:54`  | 1 | 1 | 1 |
| `graph.ts:73`      | 4 nodes | **0** | **0** |

**Records and want-list were byte-identical** — genuine duplication with no
behavioural disagreement, exactly as the earlier deferral described. **The graph
was the sole departure**, using flat equality `rg.genre_id = $1`, so it matched
only the exact genre and returned an ENTIRELY EMPTY payload for any ancestor —
not a smaller graph, nothing at all.

§7.1 settles it: "a record tagged with a child genre is implicitly a member of
all ancestor genres for filtering **and graph purposes**." One sentence binds
all three callers. The two identical copies implement it; the third did not.
So the subtree walk was extracted to `src/lib/db/queries/genre-hierarchy.ts` and
the graph changed to match, in both places it filtered — `collectedArtists` and
the `owned_genres` CTE.

**Nobody was relying on the graph's behaviour**, which is worth stating since a
behaviour change needs that check. `/graph`'s genre dropdown is populated from
`listGenres` — a flat list of ALL genres with no hierarchy filter — so selecting
any parent genre was a reachable path to a blank canvas. It was a user-visible
bug, not a contract.

**Two other recursive walks are NOT copies and were left alone**, which matters
because "five recursive CTEs over `genres`" looks like five copies of one idea:

- `genreRollup` (`records.ts`) walks UPWARD from records to ancestors, for
  §5.2's facet counts. Different direction, different question.
- `wouldCreateCycle` (`genres.ts`) walks down for cycle detection and returns a
  boolean.

Consolidating those into the same helper would have been the churn CLAUDE.md §4
warns about — they share a shape, not a meaning.

**The comment that made the defect invisible.** `graph.test.ts:302` read
"Filtering by Punk returns UK82 records because the question is 'show me punk'"
as a plain statement of fact, sitting above a test about `ownedCount`. It was
true of the collection list and false of the code it sat in. Someone reading
that block — the one place in the graph tests where §7.1 is discussed — would
conclude the hierarchy was handled and the no-rollup rule was the only
subtlety. It now states both rules explicitly, says which is rolled up and which
is not, and records that the sentence was previously false.

**Same shape as Unit 1's finding, from the opposite direction.** There, a
comment explaining a general hazard sat above coverage of one specific case.
Here, a comment describing the correct rule sat above an implementation that did
not follow it. Both times the prose was right and load-bearing in the reader's
mind, and both times it was doing the work the code was supposed to do.

**One test pins the two answers against each other** rather than each against
its own expectation ("agrees with the collection list on the same fixture"). A
future divergence fails there, at the seam, instead of in a screenshot.

## Unit 3 — the market cache recorded a ladder it never fetched

`GET /api/discogs/market/:id` built `layersFetched: ['floor', 'ladder']` as a
hardcoded literal and wrote it on every response that was not a TOTAL failure.
The two layers are settled independently with `Promise.allSettled`, so a
transient 503 on `price_suggestions` stored a row claiming a ladder that had
never been fetched. `cacheCovers` then answered `true` for seven days, and every
reader was served `conditions: []` as though it were the measured truth.

Measured before the fix: `cacheCovers(payload, ['floor','ladder']) === true`
with `conditions.length === 0`.

**The consequence was worse than the mislabelling.** Because the row read as
complete, nothing retried — one blip cost a week of layer 2 on that release
rather than being corrected on the next request.

**A 404 counts as fetched; a rejection does not.** This is the distinction the
fix turns on, and it is not the same as "did we get data":

- `price_suggestions` 404 is §10a's DOCUMENTED normal state — the token's
  account has no seller settings. That is Discogs ANSWERING: this account cannot
  see a ladder for this release. A settled fact, worth caching, and re-asking
  every time would spend budget to be told the same thing.
- A 503 is Discogs failing to answer. The empty ladder means "we do not know",
  and it must expire on the next request.

Both produce `conditions: []`. They are indistinguishable in the payload, which
is exactly why the marker has to carry the difference — the payload cannot.

**`rangeUnavailable` deliberately did NOT change**, and the two fields now
answer different questions on purpose:

- `rangeUnavailable` answers the READER's question, "is there a range to show
  me?" — false in both cases, so `conditions.length === 0` is right.
- `layersFetched` answers the CACHE's question, "may I serve this again?" — and
  only there does fact-versus-unknown change the behaviour.

The route's own comment previously claimed "`rangeUnavailable` already says
which part is missing", which was true for the reader and false for the cache.
Same shape as Units 1 and 2: prose that was correct about one layer, sitting
above code that needed it to be correct about another.

**Both directions are asserted, not just the one that was broken.** The marker
is built from two independent settlements, so a fix could get the ladder right
and the floor wrong. The floor direction matters to the SPREAD, which reads
these rows for layer 1 only: a row claiming a floor it never fetched would make
`cachedLowestPrice` return null and be believed as "nobody is selling it",
dragging a master's spread toward a low end that does not exist.

**The floor test passed the moment it was written**, which CLAUDE.md §2 treats
as a defect in the test until explained. Mutation-verified rather than assumed:
replacing `floorAnswered` with `true` — the old literal's behaviour — fails it
with `expected true to be false`. It constrains the code; it was green because
the fix was symmetric from the start.

**The spread's writer was checked and is correct.** It writes
`layersFetched: ['floor']` INSIDE the try, after the fetch has returned, so its
marker is always truthful. The market endpoint was the sole offender — worth
recording, since "two writers to one table" was the shape that made this
suspicious and only one of them had the bug.

## Mobile E2E flake, second sighting — load-dependent, not a regression

Unit 1's run flagged `e2e/stats.spec.ts:145` `[mobile]`; Unit 3's flagged
`e2e/collection-filters.spec.ts:408` `[mobile]`. Different specs, same project,
neither touched by the unit that surfaced it. `collection-filters` passes 30/30
under `--repeat-each=3 --project=mobile` in isolation, so this is contention in
the full parallel run rather than a defect in either spec.

`playwright.config.ts` sets `retries: 1`, which is why these surface as "flaky"
rather than red — and that is the same masking the Unit 5 traps depend on. Worth
diagnosing during the deferred test pass, with the two sightings as evidence
that it is the mobile project under load rather than any one spec.

### Asserting BOTH directions found a defect the review had not

The review found the ladder half: a row marked as carrying a ladder it never
fetched, serving `conditions: []` as measured truth. The floor half was not in
the review and was found only because the marker is built from two independent
settlements, so the fix was written symmetrically and then tested symmetrically.

**It is the worse of the two.** `cachedLowestPrice` reads the floor from these
rows, and a row claiming a floor it never fetched returns `null` — which the
spread does not treat as "unknown". `summariseSpread` filters nulls out of the
price list, so the version silently leaves the sample, and if enough versions
carry that marker the remaining low end is whatever happened to be fetched. That
is **layer 3's verdict corrupted through layer 1's cache**: "which pressing you
get matters more than the price" is a conclusion about a range, computed from a
range that a cache marker quietly narrowed.

Layer 3 is explicitly the judgement §10a says "no single release can supply",
and it degrades in the one direction §10a warns is unsafe — a narrow sample
reading as conclusive when the unchecked versions are the ones that would have
widened it.

**The general rule:** when a marker is derived from N independent outcomes,
test N directions, not the one that was reported. The reported direction is
evidence the shape is wrong, not a description of its extent.

## Unit 4 — six smaller defects, and two tests that encoded them as correct

### Blob orphans on record delete (the worst of the six)

`images.record_id` is `ON DELETE CASCADE`, so deleting a record removed the
image ROWS and never touched the blobs. The single-image endpoint accepts
exactly this wreckage deliberately — "blob with no row" is the cheap failure —
but there it is LOGGED with the URL. Here it happened silently, in bulk, and
**unrecoverably**: the cascade destroys the rows holding the URLs, so nothing
could enumerate the orphans afterwards.

`deleteRecord` now reads the URLs BEFORE the delete and returns them, and the
route deletes the blobs best-effort with the same row-first precedence. The
query layer returns them rather than deleting them itself: blobs are an HTTP
concern with their own failure handling.

**The comment that hid it** was `api/records/[id]/route.ts`: "images,
journal_entries, price_history and both junctions CASCADE and are correctly
absent from REFERRERS." Entirely true of the ROWS. The database side was
complete and correct, so nothing prompted the reader to ask about the bytes.

### The chart counted an asking price as evidence of value

§7.6 excludes `asking` from estimated value — "a price someone wants but nobody
has paid" — and `value-statement.ts` says in as many words that including it
"would inflate this headline figure". The sparkline plotted all three types as
one series and `priceRange` bounded across all three, so used $8.00 / asking
$120.00 / used $9.50 rendered "3 observations, $8.00 to $120.00" over a chart
spiking to $120 — in the visible text and the aria-label both.

The per-row list underneath was always right; every row says what its type
MEANS. It is the summary and the shape, read FIRST, that were not. The list
still shows all three, because an asking price is worth seeing — it just is not
evidence of worth.

The count moved with the bounds: "2 sales", not "3 observations", or the
sentence would describe a range computed from two of the three it counted.

### `priceTypeMeaning` rendered `undefined` into the page

`MEANINGS[type]` with no fallback, reached through an unchecked
`as PriceType` cast on a value typed `string`. An unknown type produced
`undefined`, React rendered nothing, and the row became "2026-01-14 $120.00" —
a bare sum with nothing saying what it is, which is the `$120.00 best dig`
misreading (CLAUDE.md §8) arriving through a missing branch.

**The gap failed OPEN**, toward the confident-looking output. The fallback names
the type, so the row stays diagnosable and reads as a gap in this app's
vocabulary rather than a fact about the record.

### The lineup MBID collision escaped as a 500

`artists.musicbrainz_id` is unique when present and the endpoint wrote it with a
bare `updateArtist`. Reachable through the app's own behaviour, not just by
hand: the walk's `resolveArtist` CREATES rows carrying MBIDs for every band and
member it meets, so walking one artist can mint a row for some group, and a
later "Lineup" on a hand-entered row for that group confirms an id already
attached elsewhere. Now a 409 naming the holder, per §5.4's rule that every
DUPLICATE carries `existingId`. Both write sites are covered — a fix applied to
one would have left the other throwing.

### `lifeSpan`: declared by the client, produced by nobody

`LineupAction.tsx` typed it, rendered it through `lifeSpanText`, and explained
in its docblock why it mattered — "1977–ongoing against 1978–1980 identifies the
two Discharges at a glance". `normalizeSearchHits` never extracted it, so the
helper returned `''` for every candidate.

**The worst possible place for it.** The picker exists ONLY because two or more
results share a name — §4.3 sends the user there precisely when the name has
failed — so the screen withheld the one fact that could settle it.

Three things made it invisible: the field was OPTIONAL on the client type, so
`undefined` typechecked; the client RESTATED the shape rather than importing it,
so the two could disagree in silence; and `normalizeSearchHits` had no tests at
all. MusicBrainz spells it `life-span`, hyphenated — the spelling a plausible
camelCase lookup misses forever while typechecking perfectly.

`Candidate` is now `ArtistSearchHit` via `import type`, which is erased at
compile time so no `server-only` module reaches the client bundle — verified by
`npm run build`, not assumed.

### `isBlobConfigured` guarded one of three call sites

`BLOB_READ_WRITE_TOKEN` is optional by design, so the absence must be detected
where it is USED. Only the upload route checked. `attach-cover.ts` went straight
to the SDK and reported `reason: 'failed'`, which the UI rendered as "The cover
art could not be fetched from Discogs… you can add an image below" — **both
halves wrong**: Discogs answered fine, and the upload fails on the same missing
token. The one action offered was the one guaranteed to fail.

Now `reason: 'unconfigured'`, with its own sentence, checked BEFORE the fetch so
it does not spend shared Discogs budget on bytes it cannot store. The image
DELETE route was the third site: it logged an ERROR naming a leaked blob on a
deployment that never stored anything, sending the operator after a bill that
cannot exist.

### Two E2E specs had encoded the defects as expected behaviour

The full-suite run (CLAUDE.md §10) turned up four failures in files this unit
never opened — the cross-file break that rule exists for.

- `record-detail.spec.ts:392` asserted "2 observations". A wording change, and
  correct to update: both its prices are `used`, so only the noun moved. A new
  test beside it covers the mixed case the old one could not reach.
- **`images.spec.ts:242` is the interesting one.** It asserted
  `reason: 'failed'` while its OWN docblock said this environment has no
  `BLOB_READ_WRITE_TOKEN`. The spec was documenting the bug as the contract —
  it described the cause correctly one paragraph above the assertion that got it
  wrong. `'failed'` was simply the only reason that existed, so the test could
  not have said anything else.

**That is a third variant of the pair.** Unit 1: prose describing a general
hazard above coverage of one case. Unit 2: prose describing the correct rule
above code that ignored it. Here: prose describing the correct CAUSE above an
assertion that named the wrong one. In all three the sentence was right and the
thing beside it was wrong, and the sentence is what stopped anyone looking.

### One test-harness change, and why it is not a test edited to pass

Six pre-existing `discogs-cover` tests began failing once `attachDiscogsCover`
checked `isBlobConfigured`, because no real token exists in the test
environment — correctly. The fix stubs the CHECK, exactly as
`images-delete.test.ts` already does for the upload route, rather than faking
the environment. The tests assert the same behaviour as before; they just now
have to say which deployment they are describing.

# The rule: when prose and code disagree, the prose is what stops anyone looking

Three instances in this remediation, each a correct sentence beside a wrong
thing. That is the whole pattern — not "comments go stale", but that an ACCURATE
comment can be the reason a defect survives, because it satisfies the reader's
question before they reach the code that answers it differently.

| Unit | The prose | What sat beside it |
|---|---|---|
| 1 | `merge-artists.test.ts:168` explained composite-key collisions in general terms | Coverage of one of the three tables that have them |
| 2 | `graph.test.ts:302` stated §7.1's hierarchy rule correctly | A graph that used flat equality and matched no descendant |
| 4 | `images.spec.ts:242`'s docblock named the missing token as the cause | An assertion saying `reason: 'failed'` |

The third is the sharpest, because the test could not have been written any
other way: `'unconfigured'` did not exist yet, so the only available name was
the wrong one. The docblock knew more than the type system allowed the
assertion to say. **When a comment explains a cause more precisely than the
adjacent assertion can express, that gap is the bug.**

Practical form of the rule, for reviews:

- A comment describing a CLASS of hazard is a prompt to check every member of
  the class, not evidence the class is handled.
- A comment stating a rule correctly says nothing about whether the code below
  follows it. Read them as two independent claims.
- A comment naming a cause the assertion cannot name is a missing case in the
  type, not a stylistic mismatch.

## Corollary: three weak concealments beat one strong one

`lifeSpan` was invisible for an entire build step, and no single cause would
have hidden it:

1. **Optional field on the client type** — `lifeSpan?:` meant `undefined`
   typechecked perfectly, so the compiler had nothing to say.
2. **Restated shape rather than an imported one** — `LineupAction.tsx` declared
   its own `Candidate` type, so the client and the server could disagree without
   any single file being wrong.
3. **No tests on the normalizer** — `normalizeSearchHits` had none at all, so
   nothing asserted what it produced.

Any one alone would probably have been caught: a required field fails the build,
an imported type fails the build, a tested normalizer fails its test. Together
they left a rendered-but-empty field on the one screen that exists to
disambiguate. **When looking for this shape, look for the combination — an
optional field whose only producer is untested and whose consumer restates the
type.**

## Unit 5 — a quarantine that did not exist, and a title the test never asserted

### The false quarantine

`e2e/manage.spec.ts` carried a docblock saying two genre specs were
"skipped honestly", with "do not un-skip without a diagnosis". **There was no
`test.skip` anywhere in the file.** Both ran on every invocation, and
`playwright.config.ts` sets `retries: 1`, so a test that failed once and passed
on retry reports as "flaky" while the run still exits 0.

**That is worse than either honest option.** A skipped test is visibly absent
from the count; a red one stops the build. A test believed skipped, actually
running, with its failures absorbed by a retry, gives false readings in both
directions at once — nobody trusts it, and nobody sees it fail either.

**Re-measured rather than assumed stale**, in both directions:

- `--retries=0` across the FULL suite: 326 passed / 0 failed, twice.
- `--repeat-each=4`, this file, chromium: 48/48.
- `--repeat-each=3`, this file, both projects, no retries: 72/72.

The documented flake does not currently reproduce. The docblock now says what
was measured and when, keeps the disproven serialization hypothesis as a live
warning, and states the honest move if it returns: `test.fixme`, which actually
skips, rather than a comment claiming it does.

### The assertion that never asserted its title — and a correction

The review reported `toHaveValue(/.+/)` as matching the unchanged value. **That
is not right, and it is worth recording because the real defect is narrower and
more interesting.** `value` is `node.parentGenreId ?? ''`, so a top-level genre
holds the empty string and `/.+/` correctly REJECTS it. A no-op move handler
does fail the old assertion — measured.

What `/.+/` could not see is WHICH genre the child moved under. Three mutations,
all run:

| mutation | old assertion | new |
|---|---|---|
| handler → no-op | FAILS | FAILS |
| handler → always `parents[0]`, one candidate parent | PASSES | PASSES |
| handler → always `parents[0]`, with a decoy parent | **PASSES** | FAILS |

Row three is the defect: a test titled "moves a genre under another" passed
while the child was moved under an unrelated genre.

**Row two is why the fixture changed.** With one candidate parent on screen,
"moved under the right genre" and "moved under any genre" are the same
observation — no assertion can separate them, however tightly written. The test
now creates a decoy named to sort first, so a handler taking the first option
takes the wrong one. **The discriminating power was in the FIXTURE, not the
matcher**; tightening the assertion alone would have left the test just as blind.

The test also now asserts `aria-level` on both rows, because the select is a
control and the tree is the outcome — a value that stuck locally without
reaching the server would pass a select-only assertion.

Checked for the same shape elsewhere: no other catch-all regex assertions
(`toHaveValue(/.+/)`, `toContainText(/.+/)`, etc.) exist in `e2e/`.

### Fourth sighting of the mobile contention, and what retries: 1 hides

Running the full suite at `--retries=0` surfaced three `[mobile]` failures —
`collection-filters`, `stats`, `want-list` — none in the file this unit touched.
All 25 of those specs pass in isolation on the mobile project. The same run
under the project's own config reports "2 flaky" and exits 0.

That is the same masking the false quarantine depended on, demonstrated
directly: **`retries: 1` is why nobody had to decide whether these tests were
broken.** Sightings so far: `stats.spec.ts` (Unit 1), `collection-filters`
(Unit 3), and now three at once under retries=0.

For the deferred test pass: the diagnosis wants `--retries=0` as the default for
investigation, since the current config cannot distinguish "passes" from
"passes on the second try". Worth considering whether CI should run retries=0
and let flakes be red, with retries reserved for local runs.

# The fixture rule, sharpest instance: when no matcher can separate two outcomes

Unit 5's mutation table has a row worth extracting, because the instinct it
defeats is entirely to fix the assertion.

    handler → always parents[0], ONE candidate parent    old PASSES   new PASSES

With a single parent on screen, "the child moved under the RIGHT genre" and "the
child moved under ANY genre" are **the same observation**. No assertion can tell
them apart — not a tighter regex, not an exact id, not a stricter matcher —
because the two outcomes produce identical DOM. Tightening `toHaveValue(/.+/)`
to `toHaveValue(parentId)` reads far stricter and is exactly as blind.

The discriminating power was in the FIXTURE: a second, decoy parent named to
sort first, so a handler taking the wrong option takes a *visibly* wrong one.

**The general form.** Before strengthening an assertion, ask whether the fixture
can produce the failure the assertion is meant to catch. If the wrong behaviour
and the right behaviour yield the same state, the test is under-fixtured, not
under-asserted — and a stricter matcher makes it *look* rigorous while changing
nothing. A test is only as discriminating as the difference its setup can create.

Cheap check: mutate the code to the plausible wrong behaviour and run. If the
test still passes, adding assertions will not help; add a case to the fixture
that makes the two outcomes diverge.

This is the same family as the earlier "name the line of source it would fail
against" rule, one level earlier: that rule asks whether the assertion touches
the code, this one asks whether the setup can make the code be wrong.

# The retries demonstration, and how the deferred pass should be run

Shown rather than argued, in one run:

- `npx playwright test --retries=0` → **3 failed** (`[mobile]`:
  collection-filters, stats, want-list)
- the same suite under `playwright.config.ts` → **"2 flaky", exit 0**
- those same specs alone on the mobile project → **25/25**

So the current config cannot distinguish "passes" from "passes on the second
try", and that is precisely what let `manage.spec.ts` document a quarantine that
did not exist: the failures it described were real and were being absorbed.

**Settled for the deferred test pass:** investigate at `--retries=0`. Open
question for that pass, not decided here — whether CI should run retries=0 with
flakes red, keeping retries for local runs only. The argument for is that a
retry is a decision not to know; the argument against is that genuine
infrastructure contention then blocks a merge. Four sightings now
(stats/Unit 1, collection-filters/Unit 3, three-at-once/Unit 5) all point at the
mobile project under parallel load rather than at any spec.

## Unit 6 — deletions, and the one that was a spec defect rather than dead code

### `GET /api/graph`: two mandates in tension, and the spec was wrong

The endpoint was correctly implemented, correctly integration-tested, and called
by nothing. That is not ordinary dead code:

- **§5.6 required it.** §14 requires every §5 endpoint "implemented and
  integration-tested" — both were true.
- **§8.1 required the thing that made it unreachable.** `/graph` is a server
  component calling `buildGraph()` directly, because a client fetch "would
  reimplement a server concern and show an empty canvas while it resolved".

Both requirements were followed and they could not both produce a live
endpoint. The server component won on merit, so §5.6 was amended and the route
and its test deleted.

**The option not taken is worth recording.** The alternative was keeping the
endpoint with a docblock explaining it is spec-mandated, has no caller by
design, and should not be "cleaned up" — a careful, accurate comment whose only
function is to stop someone deleting code that does nothing. That is the
prose-doing-the-code's-work pattern a third time, and this instance would have
been *self-inflicted*: writing the comment that makes the next reviewer look
away. When the justification for keeping something is a paragraph explaining why
it looks wrong but isn't, check whether the requirement it satisfies should
exist.

### The Hot Tuna fixture: kept, and the test now loads it

Orphaned, and the review recommended deleting it. Kept instead, because
`identical-versions.test.ts` hand-built its `BASE` from ids taken OUT of that
fixture — so the payload was the evidence and the test was a paraphrase of it.

**The orphaning had already cost something, which is how the decision settled.**
The test's docblock claimed FIVE identical versions "measured against the live
API". The committed capture has THREE, plus a fourth differing only by
`Repress`. Nothing could contradict the claim because nothing read the file. The
fixture README's own argument — "a hand-written fixture encodes what we EXPECT
the API to return" — applied exactly, and deleting the fixture would have
removed the thing that exposed it.

The test now loads the capture through `normalizeVersion` (not as raw JSON: the
collapse acts on `NormalizedVersion`, so a normalization change must be able to
break it) and asserts three properties the hand-built rows could not:

1. the master really does contain a group of indistinguishable versions;
2. the `Repress` near-miss is NOT collapsed into it — real data supplied a
   discriminating neighbour nobody would have thought to construct;
3. the Japanese pressings stay separate.

Mutation-verified: emptying `formats` out of `comparisonKey` fails the fixture
test, and its failure is the more informative one — it reports the group count
changing on real data rather than two keys matching.

**The hand-built tests stayed**, deliberately. They probe rules the real payload
has no example of: a genuine zero count beside a null, a 1971 year. Fixture
proves the hazard is real; unit tests prove the rules handle it. Neither
subsumes the other.

### `artist-minor-threat.json`: deleted, and the citation is why

It IS cited — `normalize-relations.test.ts` names it as a **negative**:
"Discharge and Minor Threat are 100% `member of band` — against those, a
normalizer that filtered nothing at all would pass every test." It was captured,
found non-discriminating, and replaced by Black Flag, which carries five
relation types.

So the citation is the reason to delete rather than to keep: the fixture's
recorded property is that it proves nothing. The sentence explaining that is
what has value, and it stays in the test.

### The other two

- **`?? 'used'`** on the record detail page. Verified unreachable —
  `is_nullable = NO` in Postgres, `.notNull()` in Drizzle — and wrong in the
  inflating direction if it ever fired, since `used` is the one type §7.6 sums
  into estimated value.
- **`RecordDetail`'s docblock**, which called the gallery, journal, sparkline
  and edit form "DELIBERATELY ABSENT" and named the steps that would add them.
  All four ship and `page.tsx` renders every one. It was accurate when written
  and went false without being touched, because the code it described moved to a
  sibling file. The rule it justified — no placeholder sections — is still live
  and was kept.

### One build note

Deleting a route handler leaves a stale reference in `.next/types/validator.ts`,
so `typecheck` and `build` both fail with `Cannot find module
'.../api/graph/route.js'` until `.next` is removed. Not a source error, and the
message points at a file that no longer exists — worth knowing before debugging
it as one.

## Unit 7 — four defects from the review that were wrong data, not cleanup

### The journal date was wrong in BOTH directions

`RecordJournal.todayIso()` used `toISOString()`, which converts to UTC first. For
a user west of Greenwich every evening reads as tomorrow: **20:30 Friday the 15th
in New York is 00:30 Saturday the 16th in UTC**, so a note written on Friday
night was captioned Saturday. Measured, not reasoned about.

The second direction was hiding behind it and is the reason the fix is two
changes rather than one. Fixing the client to send the LOCAL calendar date —
which is right, because a journal date is a human fact about the user's day, not
a machine timestamp — immediately breaks the server bound, because east of
Greenwich the local date is routinely a day AHEAD of UTC. `09:00 on 16 August in
Sydney` is `23:00 on the 15th` in UTC, and `value <= todayIso()` rejects the
user's genuine today on a form whose own date input offered it.

So `boundedDateSchema` now allows one day of slack. **Slack, not a timezone
conversion**: the server cannot know the client's zone and must not guess one,
but it can say that no zone is more than a day from UTC — a date one day ahead
is somebody's today, two days ahead is a typo. §4.1's purpose is keeping
`2126-04-11` out, not adjudicating midnight.

Two existing tests encoded the strict bound and both were rewritten rather than
relaxed: the unit test now asserts the day AFTER tomorrow is refused, and the
New Year clock-injection test compares two days out, because one day out is now
acceptable on New Year's Eve and would no longer prove the bound moves.

### `isNothingRecorded` conflated three facts

`Number(amount) === 0` treated a real zero, an empty string and unparseable
garbage as one case — except it did not, and that is the defect:

    '0.00'      real computed zero   -> "no prices recorded"     correct
    ''          driver returned none -> "no prices recorded"     right, by luck
    'nonsense'  something broke      -> NaN === 0 is FALSE, so it
                                        was passed through and rendered

The third put an unparsed string inside "Estimated value of what is on the
shelf: …". Absent-versus-unknown in a money field, and the guess ran toward the
confident output again. Now `Number.isNaN(value) || value === 0`.

Not reachable from `recordStats` today — it returns `'0.00'` for an empty
collection — and guarded anyway, because §5.7's cron is a writer and
`NUMERIC(10,2)` arrives from node-postgres as a STRING. This guard should not be
the one place that assumes they parse.

### `formatMoney` put the sign in the wrong place

`$-12.50`, because the minus stayed inside the string the grouping regex reads
as digits. Conventional form is `-$12.50`: the minus governs the amount, not the
digits after the symbol.

`moneySchema` is `^\d{1,8}…` with no sign, so the API refuses a negative, and
there is no CHECK on `records.purchase_price` (verified). It arrives only from a
value corrected by hand in psql — ordinary for a personal tool — and this is the
app's single money formatter.

### The empty state promised a refresh that cannot run

"No prices recorded yet. The weekly refresh adds what the market says." §5.7's
cron is **step 16 and does not exist**; the only writer to `price_history` is
`POST /api/records/:id/prices`, which no screen calls. The sentence described a
mechanism that could not run, and an E2E test asserted it, holding it in place.

**The obvious rewrite was the same defect in a new costume.** "Use the market
panel above" is false whenever the record has no Discogs release id, because
`MarketPanel` returns `null` without one — which is the common result of §10's
quick in-store entry. Pointing at a control that is not on screen is exactly
what the old copy did. So the empty state is conditional, and `page.tsx` passes
`hasMarketPanel` from the same id the panel is built from rather than the
component re-deriving it: two readings of "is there a panel" are two things that
can disagree.

### A JSX trap worth knowing

A `{/* comment */}` as the FIRST child of a ternary branch is not a comment —
`cond ? {/* … */} : …` parses as an object literal and fails with
`TS1128: Declaration or statement expected` pointing at the END of the file,
which is nowhere near the mistake. Put the comment above the conditional.

### The run

Full E2E at `--retries=0`: **326 passed, 0 failed** — the first fully clean
retries-off run recorded here, so the mobile contention did not appear this
time. It is load-dependent, not gone.

# Triggers added to deferrals that had none

REVIEW-PLAN.md's triage rule: **a deferral without a named trigger is a decision
never to do it.** Audited every open deferral in this file; most already name
one (step 14, step 7, step 16). Three did not, and one turned out to be closed.

## 1. The acquired-state UI dead end (recorded at step 5+6 review)

`WantListRow` shows the "Acquired" badge but guards "View record" on
`acquiredRecordId !== null`, so a row in the unconstrained state announces an
acquisition and offers no way to reach it. The note ends "Prefer the CHECK; §4 is
where invariants belong" and then stops — a preference, not a trigger.

**Trigger: the next migration touching `want_list`, whenever that happens.**
Verified still open — `pg_constraint` shows no CHECK on `want_list` today. The
constraint is three lines and belongs in a migration that is already being
written; opening one solely for it is the reason it keeps being skipped. If step
16 arrives first with no such migration, it goes in there, because a deploy is
the last point at which schema changes are cheap.

## 2. The `cause`-chain log leak (recorded at step 7 security review)

A nested `cause` could carry a URL, a header set or a connection string into a
log line. The note says "the fix, when it happens" and names it precisely —
redacted projection, plus a test planting a secret in a nested cause — but names
no when.

**Trigger: R6, deploy readiness.** It is latent today for a stated reason
(nothing puts a credential in a `cause`, the token travels in a header the client
never logs) and it stops being latent the moment logs leave the laptop and are
retained by someone else. R6 already attacks "every secret's path from
`.env.local` to Vercel", which is the same question from the other end.

## 3. `/manage`'s 200-row assumption

Fetches every reference resource with `{ limit: 200, offset: 0 }`. Fine for one
person's collection and silently wrong past 200 of anything.

**Trigger: R8, once the collection is real (~100 records).** That is the review
that measures the app against actual data, and it is the only cheap way to know
whether 200 is a real ceiling or a number nobody will ever reach. Adam's artist
count went 6 → 71 on a single lineup walk, so genres and labels are the ones to
measure. If any resource passes ~150 before then, fix it immediately rather than
waiting — the failure is silent truncation, which is the worst kind.

## Closed, not deferred

**Two want-list items pointing at one record** is RESOLVED, and the entry should
not be read as open. Migration `0004_want_list_one_fulfilment.sql` created the
partial unique index the note asked for. It named step 7 as its trigger and step
7 acted on it, which is the process working.

# Test-quality pass — what mutation testing overturned

Four areas were scoped from the R4 audit. **Two of the four were wrong**, and
mutation testing is the only reason that is known.

## Removed: 18 per-endpoint auth stanzas (17 by script, 1 by hand)

`routeAuthMode` returns `'session'` for any path outside two hardcoded sets, so
`expect(routeAuthMode('/api/x')).toBe('session')` in each endpoint's test
restated a default rather than testing that endpoint.

Mutation: making every path public (`return 'public'`) is caught **36 times** by
`routes.test.ts` and `middleware.test.ts` alone. The per-endpoint copies added
nothing. 846 → 828 integration tests.

One kept in `influences.test.ts`: it covers three distinct path SHAPES including
the two-param `/api/influences/:sourceId/:targetId`, which no other test walks.
The removal script was written to skip any stanza carrying other assertions and
reported the one it skipped, rather than trusting a regex over 18 files.

## KEPT, against the audit: `e2e/tags-auth.spec.ts`

Called ceremony — "18 tests × 2 projects for one middleware matcher, already
owned by the unit suite". **The unit suite does not own it.**

Mutation, exempting a single resource (`/api/pressings` added to
`PUBLIC_PATHS` — what a real auth regression looks like):

| | result |
|---|---|
| `src/lib/auth/routes.test.ts` | **53/53 passed** |
| `e2e/tags-auth.spec.ts` | **2 failed**, on exactly that resource |

The unit suite asserts the RULE (`routeAuthMode` defaults to session); the
exemption changes the DATA the rule reads. Only a real cookie-less request
through real middleware distinguishes them.

**And the file's own docblock argued for its deletion.** It says `/api/tags`
"covers the class rather than only this path, because the five that follow are
covered by the same middleware matcher and the same routeAuthMode default" —
then loops over six more resources anyway. The prose was wrong and the loop
beneath it was right. Same pattern as the three code instances, pointed at a
test.

## KEPT, against the audit: `neon-gate.test.ts`'s file-text check

Listed as "asserts a comment". It greps `neon-transactions.test.ts` for the gate
test's name. Mutation — renaming `Neon verification gate` — showed it is the
**only** thing that catches the gate being removed: the behavioural sibling,
which runs vitest and greps the output, PASSES, because the warning text it
matches is unchanged.

**A file-text assertion is right exactly when the property is about a file** —
that a test still exists, that a generated block has not been appended — and
wrong when it stands in for behaviour that can be observed. No behavioural test
can notice that another test was deleted.

## Removed: `drizzle-config.test.ts`'s import assertion

Genuinely redundant. Mutation — replacing the `parseEnv` import with a
hand-rolled stub — fails the sibling test that loads the config and checks the
RESOLVED target. The text check added nothing.

## Replaced: `every-page-has-nav.test.ts` → `e2e/every-page-has-nav.spec.ts`

The file-text version did `expect(readFileSync(page)).toContain('<AppHeader />')`.
It encodes a real bug — `/manage` shipped with no way back to the collection —
and that is precisely why it had to assert what a user can REACH rather than
what a file contains.

Two mutations, run against both versions:

| mutation | old (file-text) | new (E2E) |
|---|---|---|
| delete `<AppHeader />` from `/manage` | FAILS | FAILS |
| `{false && <AppHeader />}` | **11/11 PASSED** | **FAILS** |

The second is the case that matters: the string is still in the file, so the
grep is satisfied, and no nav renders. Same family as DOM-presence-is-not-
visibility, which this suite has been caught by before. The new spec asserts
`toBeVisible` on the `Main` navigation landmark, plus that it contains a link —
a nav that renders and goes nowhere does not solve the problem either.

The directory walk was kept as a **vacuity guard**: it counts `page.tsx` files
and fails if a screen is added without being listed, which was the one real
advantage the file-text version had. And `/login`'s exemption is now asserted
rather than assumed, so the reason it differs is recorded where a test can see
it.

## The matrix, narrowed — and what cannot be proven

`playwright.config.ts` ran all 15 specs on both projects to satisfy §11 flow 10,
which names two. Now scoped to five, split by justification in the config
comment: three SPEC-MANDATED (collection-filters, collection-widths,
lookup-flows) and two EVIDENCE-BASED (graph, manage) that assert
viewport-dependent behaviour internally.

**The asymmetry is stated in the config because it governs future edits.** The
auth stanzas could be proven redundant — break the rule, watch which tests fail.
There is no equivalent for "this spec does not need mobile": a spec only fails on
mobile if a mobile-specific defect exists, and none does today. So exclusion
rests on the absence of viewport-dependent assertions, which is weaker evidence.
`CollectionList` once had a dead band at 640–767px, and the uniform matrix is
what would have caught it anywhere. **Re-adding a spec needs no justification;
removing one needs evidence.**

Runtime: ~7m → ~5m. 326 → 228 executions.

## Sixth sighting of the mobile contention — and narrowing did NOT fix it

Baseline BEFORE narrowing, deliberately: two consecutive `--retries=0` runs of
the full matrix, 326 passed, 0 failed both times.

After narrowing: one run failed 1, the immediate re-run passed 228/228. Also
seen during this pass: a mobile-project-only run failed 1 of 162, clean on
re-run.

**So a cleaner run after narrowing is not evidence the contention is resolved**,
and this is now positive evidence it is not — the failures continue at reduced
parallel load. Fewer workers is exactly what would mask it, which is why the
baseline was taken first. Sightings: stats (Unit 1), collection-filters (Unit 3),
three-at-once (Unit 5), mobile-only run and post-narrowing run (this pass).

The investigation stays open on its own terms, at `--retries=0`.

## Step 13 unit 0 — the `gatefold` enum value, and three Postgres/drizzle facts

§10b makes a fold-out sleeve a third state. This unit only makes the value
STORABLE — the affordance comes with the shelf, and §10b is explicit that it
appears only where an inner image exists, with no generated stand-in.

Three things were measured rather than assumed, and **the first two contradicted
what I expected**:

**1. `ALTER TYPE ... ADD VALUE` works inside a transaction.** I flagged this as a
likely problem because drizzle-kit wraps each migration file. The restriction was
lifted in Postgres 12; on the 16.14 this project runs, adding a value to a
pre-existing type inside `BEGIN`/`COMMIT` succeeds. Migration 0005's
create/swap/drop dance was needed because it REMOVED a value, which is genuinely
impossible in place — adding one needs none of that.

**2. The new value cannot be USED in the same transaction.** That restriction is
real: `ERROR: unsafe use of new value "d" of enum type`. So a migration that
added `gatefold` and backfilled rows to it in one file would fail. This one only
adds the value; a later migration writing `gatefold` rows must be its own file.

**3. Hand-writing a migration file silently does nothing.** I wrote
`0011_*.sql` and appended a journal entry by hand. `drizzle-kit migrate`
reported **"migrations applied successfully"** and applied nothing, because
`meta/NNNN_snapshot.json` was missing. Caught by checking `enum_range` afterwards
rather than trusting the success line — the same absence-as-success shape this
project keeps meeting, this time in the tooling.

The fix is to run `drizzle-kit generate`, which writes SQL, snapshot and journal
entry together, then rename the random tag and add the reasoning as comments.

**A fourth, worth its own line: `npx drizzle-kit migrate` does not load
`.env.test`.** It exits 1 with NOTHING on stderr, having applied nothing, which
reads exactly like a broken migration — and I spent several steps debugging my
own SQL because of it. The same command succeeded against an identical scratch
database whose URL was passed explicitly. `npm run db:migrate` has the same gap.
Use `TEST_DATABASE_URL=... npx drizzle-kit migrate`.

The detour also left the test database briefly inconsistent, because I applied
the statement directly via psql to see its error, which advanced the schema
without advancing `__drizzle_migrations`. Rebuilding from empty was the fix and
is cheap; **applying DDL by hand to diagnose a migrator is how the two get out of
step**, so re-run against a scratch database instead.

**A FIFTH, found during R5 and the most dangerous of the set: when the ledger
falls behind a schema that has already moved, EVERY `db:migrate` is a silent
no-op, forever.** Noticed: R5, 2026-08-20, on the DEV database.

**Two wrong reconstructions preceded the right one, and both are recorded because
each was plausible and each would have justified a different repair.** The
standing rule — verify before fixing — is what caught them, applied to a
reviewer's own finding rather than to someone else's.

*What is measured:*

- Dev's ledger holds **12 rows against a 15-entry journal**, and its twelfth row
  carries `created_at=1786715119768` — one millisecond after 0010 and matching
  **no journal entry at all**. Dated 2026-08-14, three days before 0011 was
  written.
- 0011, 0012 and 0013's effects are all PRESENT and COMPLETE in the schema:
  `records.spine_colour` is text/nullable/no-default; `enum_range(image_type)`
  is exactly `cover, back, gatefold_left, gatefold_right, label, matrix, other`
  in that order; `images.image_type` is still `USER-DEFINED/image_type` rather
  than stranded as text; no shadow type survives; the 3 `cover` rows are intact.
- 0014's `llm_requests` is **absent**.
- Drizzle's gate is `lastDbMigration.created_at < migration.folderMillis`
  (`pg-core/dialect.js:62`), so with the high-water mark at `...768` it computes
  pending as **0011, 0012, 0013, 0014** — four files, not three.
- **The whole batch runs in ONE transaction** (`dialect.js:60`), ledger inserts
  included.
- Replaying that exact batch against dev inside a rolled-back transaction dies at
  **0012 statement 1: `42701 column "spine_colour" of relation "records" already
  exists`**. 0011 succeeds first; Postgres 12+ allows `ALTER TYPE ... ADD VALUE`
  in a transaction so long as the value is not USED there, so 0011 is not the
  blocker.

*Therefore:* the transaction aborts at 0012, everything rolls back including
0011's DDL and every ledger insert, and `drizzle-kit migrate` **prints
"migrations applied successfully" and exits 0**. The ledger never advances, so
the next run recomputes the identical batch and dies identically. **The state is
self-perpetuating and nothing in the output ever says so.**

*What is NOT established:* which command applied 0011–0013's schema without
ledger rows. It predates this session — the ledger's mystery row is dated
2026-08-14 — and a `drizzle-kit push`, or hand-applied DDL during step 13, both
fit. Recorded as unknown rather than guessed, because the two candidate stories
imply different preventions.

**The two reconstructions that were wrong:**

1. *"An interrupted `db:migrate` applied 0012 and 0013 without the ledger."*
   Refuted by `dialect.js:60`: the batch is one transaction, so an interruption
   rolls the DDL back too. It cannot leave schema ahead of ledger.
2. *"0011's `ALTER TYPE ... ADD VALUE` fails inside drizzle's transaction."*
   Refuted by replay: it succeeds. The restriction is on USING a new value in the
   same transaction, which NOTES already records above and which I misread as a
   ban on adding one.

The three earlier entries in this list fail from a clean start or apply nothing.
This one runs against a database whose schema has drifted AHEAD of its ledger,
which no amount of re-running can resolve.

### The absence-as-success family gains its worst member, and this one is PERMANENT

NOTES already records two: a hand-written migration with no snapshot ("migrations
applied successfully", applied nothing) and `drizzle-kit migrate` not loading
`.env.test` (exit 1, silent). Both are ONE-OFF — the run fails, and the next run
with the defect corrected succeeds.

**This one never clears itself.** The inputs to drizzle's decision are the ledger
and the journal, and a failed run changes neither. So:

    every run recomputes the SAME pending batch
      -> dies on the SAME 42701
        -> rolls back, ledger unchanged
          -> prints "migrations applied successfully", exit 0

There is no run count at which this improves, and no signal that anything is
wrong. A CI step, a deploy hook or a developer doing the obvious thing — running
it again — all get the success line, forever, while the database stays exactly as
broken as it was. That is what makes it worse than a failure: a failure stops
somebody.

**The generalisation this earns, beyond drizzle:** *a tool that reports success
by default and derives its work from state its failures do not change cannot
report a persistent problem.* Verify the OBJECTS, not the exit code —
`information_schema` for tables and columns, `enum_range` for enums, and
`count(*)` on `drizzle.__drizzle_migrations` against the journal length. That
check is three queries and it is the only thing that would have caught this.

CLAUDE.md §7 requires migrations to "run clean on an empty database". An empty
database is where this defect CANNOT occur — it needs a schema that has drifted
ahead of its ledger. **The rule as written verifies the one case that is safe.**

### Open question for R6: what applied three migrations' schema without ledger rows?

**Unresolved, and deliberately not guessed.** 0011, 0012 and 0013's effects were
present and complete in dev with no `__drizzle_migrations` rows, and the ledger's
unexplained twelfth row is dated 2026-08-14 — three days before 0011 was written.
Whatever did it predates this session **and is still available to do it again.**

Two candidates, and they need different preventions:

1. **`drizzle-kit push`.** Diffs the schema files against the live database and
   applies the difference DIRECTLY, writing no ledger row — by design. It would
   produce exactly this state: correct schema, silent ledger. If this is it, the
   prevention is a rule (never `push` at a database `migrate` owns) plus removing
   the temptation.
2. **Hand-applied DDL during step 13.** NOTES already records this happening once
   on the TEST database, diagnosing a migrator via psql, with the same
   schema-ahead-of-ledger result and the same fix (rebuild from empty). If this
   is it, the prevention is the rule that entry already states, applied to dev
   where rebuilding from empty is not cheap.

**What would distinguish them:** `push` applies the FULL diff between schema files
and database, so it would have brought across everything pending at that moment,
not a selective subset — whereas hand-applied DDL brings exactly the statements
someone typed. The dev schema can be diffed against `0013_snapshot.json` to see
which it looks like: an exact match points at `push`, while a match on 0011–0013
with some other pending change missing points at hand-application. Neither
candidate is confirmed and the shell history for those days is the other evidence
worth checking.

**Why R6 owns it.** R6 is deploy readiness, and the same divergence against
PRODUCTION Neon is a materially worse day: the repair used here (verify
completeness, backfill the ledger, re-run) depends on the drifted migrations
being verifiably complete, which was true on dev and is luck rather than
guarantee. A production database whose schema half-moved has no equivalent cheap
recovery. R6 should establish which tool did this, whether it can still reach
production, and what check would notice within one deploy rather than three steps
later.

**Trigger: R6, before the first deploy.**

---

## R5's live run — §9.2 returned a bare 500, and the genre test DID NOT RUN

Recorded 2026-08-20, against the DEV database with the hierarchy built.

### What happened

`/suggestions` renders correctly and §9.1 works on real data — Broken Bones
"shares 4 members with Discharge", Demon 2, plus three Dire Straits side projects
each with its own reason clause. **The shared-member term is doing exactly what
§9.1 specified**, on a real collection, which is the first evidence of that.

§9.2's "Ask Claude" returned **500, rendered as "Internal server error"**.

### The cause, from the server's stderr rather than from the status

    [api.suggestions.ai.POST] 401 {"type":"error","error":{"type":
    "authentication_error","message":"API key is invalid."},"request_id":null}

**The key is PRESENT but INVALID.** `.env.local`'s `ANTHROPIC_API_KEY` is 160
characters, begins `sk-ant-` and ends `here` — a placeholder of the
`...-put-your-key-here` shape, not a credential. So:

- `isAnthropicConfigured()` returned true, because it only tests non-empty.
  `notConfigured` could not fire.
- A slot WAS claimed. `llm_requests` holds 1 row: **9 of 10 remaining, spent on a
  call that never reached the model and cost the account nothing.**
- The payload was built and sent. The SDK threw on the 401,
  `withErrorHandling` caught it, and it became `500 INTERNAL_ERROR`.

### This is F1, reproduced live

F1 was raised from a probe with a MOCKED 401 before the run. The live path
produced the identical status, the identical body and the identical slot
consumption. The finding was a hypothesis; it is now measured on the real code
path.

**It is also the `isBlobConfigured` shape exactly, one integration over** (see
"isBlobConfigured guarded one of three call sites"). Both: a credential optional
by design, an is-configured predicate too weak to catch the real failure, and a
user shown "Internal server error" for a deployment problem the app could name.
The Blob variant offered an action guaranteed to fail; this one offers no action
at all.

### What the user should have been told

Not "Internal server error". The app knew, at the moment it logged, that
Anthropic rejected the credential. A truthful message names the credential and
the fact that it is the DEPLOYMENT that is wrong, not the request:

> Gap analysis is not available: the Anthropic API rejected this deployment's
> credential. Check `ANTHROPIC_API_KEY`.

Two properties that message has and the 500 does not: it sends the reader to the
env var rather than to application logs, and it does not imply retrying will
help. A 401 is not transient and the UI's "Try again." is actively wrong advice.

The status should be 502 alongside `LLM_UNREADABLE` — the failure is upstream,
not ours — or a distinct `LLM_UNAUTHORIZED`. And **an auth failure should not
spend a slot**: unlike an unreadable response, the call was never billed. The
current behaviour lets ten clicks against a bad key exhaust the hour for requests
that never happened.

### What this means for the review

**THE GENRE-ACCURACY TEST HAS NOT RUN.** The one thing R5 exists to measure is
still unmeasured. The case that can fail is now BUILT and verified — Punk is a
parent with 0 records, UK82 has 15 and US Hardcore 6, and the vocabulary the
prompt sends is `AOR, Black Metal, Heavy Metal, Punk, Rock, Rock & Roll, UK82,
US Hardcore` — so the run needs only a working key. Everything else is in place.

F2 remains untested against a real model, and F2 is the finding that says the
validation backstop would not catch a flattening even if the model produced one.

**RESOLVED 2026-08-20**, same session: a valid key was supplied and the run
completed. §9.2 has now executed. See the run below.

---

## R5's live run, SECOND ATTEMPT — §9.2 EXECUTED, and the genre test PASSES

2026-08-20, dev database, hierarchy in place. `POST /api/suggestions/ai 200 in
44s`. **The first successful execution of §9.2 in any environment.**

### Conditions

| | |
|---|---|
| model / effort | `claude-opus-5`, effort `high`, max_tokens 4000 |
| tokens | in 2944, out 2994 |
| `stop_reason` | `end_turn` — **not truncated** |
| markdown fences | **none** — the model obeyed "JSON only" |
| vocabulary sent | `AOR, Black Metal, Heavy Metal, Punk, Rock, Rock & Roll, UK82, US Hardcore` |
| hierarchy | Punk = parent, **0 records**; UK82 15; US Hardcore 6 |

Captured out-of-band with a script that rebuilds the SAME summary from the SAME
four queries and the SAME prompt text, because §9.2's results are ephemeral by
design and the server logs the status, not the body.

### THE RESULT: 0 of 34 suggestions flattened to `Punk`

    by genre: Black Metal 4, Heavy Metal 6, UK82 4, US Hardcore 5,
              AOR 5, Rock & Roll 5, Rock 5
    Punk-tagged: 0

**The requirement CLAUDE.md §8 calls the most important one is met on real
output.** Nothing is tagged `Punk` although `Punk` was offered in the vocabulary
and would have validated. The reasons stay inside their scenes, and the model
draws distinctions FINER than the hierarchy demands:

- within US Hardcore — DC ("the DC record that codified the scene"), Californian,
  South Bay melodic;
- within Black Metal — Swedish proto- vs Norwegian second wave vs its symphonic
  wing;
- within Heavy Metal — NWOBHM vs epic sword-and-sorcery vs occult.

Adam's verdict on the material: canonical, no hallucinations visible.

### Full output, verbatim

 1. **Bathory — Under the Sign of the Black Mark**  `Black Metal`
    > The collection is deep in second-wave-styled black metal (Nattskog, Vargnatt, Kaldrsjor, Ulvenatt) but lacks the Swedish proto-black-metal record that defined that scene's template.
 2. **Mayhem — De Mysteriis Dom Sathanas**  `Black Metal`
    > With a dozen Norwegian-styled black metal acts on the shelf (Vinterlys, Nordvarg, Fimbulvinter), the founding Norwegian black metal document is a conspicuous gap.
 3. **Darkthrone — A Blaze in the Northern Sky**  `Black Metal`
    > The raw, cold Norwegian black metal aesthetic that Frostmark, Grimfrost and Ravenfrost all descend from starts with this record.
 4. **Emperor — In the Nightside Eclipse**  `Black Metal`
    > Fills the symphonic wing of the Norwegian black metal scene the collector already covers heavily with Dimmerlight and Vinterlys.
 5. **Iron Maiden — The Number of the Beast**  `Heavy Metal`
    > The NWOBHM canon is missing entirely despite a whole shelf of galloping trad-metal acts like Ironclad, Nightblade and Steelwind.
 6. **Judas Priest — British Steel**  `Heavy Metal`
    > The twin-guitar British heavy metal blueprint behind Blackanvil, Hellforge and Bonecrusher is absent.
 7. **Saxon — Wheels of Steel**  `Heavy Metal`
    > A core NWOBHM record that sits directly alongside the working-class trad metal of Bastion, Dreadnought and The Gauntlet.
 8. **Diamond Head — Lightning to the Nations**  `Heavy Metal`
    > The most-covered NWOBHM album and a foundational reference point for the Axe of Kings / Warlord Sky style of trad metal here.
 9. **Manowar — Hail to England**  `Heavy Metal`
    > Epic sword-and-sorcery heavy metal is well represented by Axe of Kings, Warhammer Sky and Titan Fall but its standard-bearer is missing.
10. **Mercyful Fate — Don't Break the Oath**  `Heavy Metal`
    > The occult-themed heavy metal link between the trad metal shelf (The Wyrm, Doomhold) and the black metal shelf is unrepresented.
11. **The Exploited — Punks Not Dead**  `UK82`
    > UK82 is collected heavily (Blank Signal, The Rotters, Curfew) yet the record that names and defines the scene is missing.
12. **GBH — City Baby Attacked by Rats**  `UK82`
    > A cornerstone UK82 album from the same Birmingham axis as the studded street-punk bands (The Kerb Crawlers, Spit & Sawdust) already owned.
13. **Blitz — Voice of a Generation**  `UK82`
    > One of the defining UK82 LPs, sitting squarely with the terrace-punk of The Agitators and Panic Merchants.
14. **Chaos UK — Chaos UK**  `UK82`
    > The noisier UK82 wing that complements the Discharge record already in the collection.
15. **Minor Threat — Out of Step**  `US Hardcore`
    > US Hardcore here (Static Youth, Riot Shield, Exit Wound) lacks the DC record that codified the scene's fast, terse style.
16. **Black Flag — Damaged**  `US Hardcore`
    > The founding LP of American hardcore and the obvious anchor for the Bin Day / Council Estate / Tin Pot shelf.
17. **Bad Brains — Bad Brains**  `US Hardcore`
    > The fastest and most influential early US hardcore record, absent from a collection with several US Hardcore bands.
18. **Circle Jerks — Group Sex**  `US Hardcore`
    > A foundational Californian US Hardcore LP that pairs directly with the short-sharp bands already collected.
19. **Descendents — Milo Goes to College**  `US Hardcore`
    > Rounds out the US Hardcore shelf with the melodic South Bay side of the same scene.
20. **Toto — Toto IV**  `AOR`
    > The AOR shelf (Silver Lining, Skyline, Velvet Coast, Midnight Avenue) is missing the definitive session-musician West Coast AOR album.
21. **Foreigner — 4**  `AOR`
    > A cornerstone of polished radio AOR that the Gold Standard / Vanguard / Sunset Boulevard entries all echo.
22. **Journey — Escape**  `AOR`
    > The archetypal arena-AOR record and an obvious gap beside Neon Harbour, Harbour Lights and The Westside.
23. **Steely Dan — Aja**  `AOR`
    > The sophisticated studio-craft end of AOR that Silk Road Radio, Nightporter and The Casablanca Set clearly draw from.
24. **Boston — Boston**  `AOR`
    > A foundational AOR debut whose layered guitar-and-harmony sound underpins the Chrome & Velvet / Cabana Club side of the shelf.
25. **Chuck Berry — One Dozen Berrys**  `Rock & Roll`
    > The Rock & Roll shelf of Wildcat Wilson, The Chevrons and The Fuel Injectors has no Chess-era originator on it.
26. **Eddie Cochran — Singin' to My Baby**  `Rock & Roll`
    > Core late-fifties rock & roll that sits directly behind the rockabilly-leaning entries like The Rockabilly Kings and Tex Marlow.
27. **Gene Vincent — Bluejean Bop!**  `Rock & Roll`
    > A foundational rockabilly LP for a shelf that already has The Hepcats, The Bobbysoxers and Sonny Blaze.
28. **Little Richard — Here's Little Richard**  `Rock & Roll`
    > The wildest of the original rock & roll albums, missing from a Rock & Roll shelf built on Duke Rio, Johnny Reno and Ricky Vance.
29. **Buddy Holly — The "Chirping" Crickets**  `Rock & Roll`
    > The band-format rock & roll template behind Del Ray & The Rays, The Starlites and The Silvertones.
30. **Bruce Springsteen — Born to Run**  `Rock`
    > The heartland-rock touchstone for a Rock shelf full of place-name Americana acts like Gravel Road, Low Country and Iron Bridge.
31. **Tom Petty and the Heartbreakers — Damn the Torpedoes**  `Rock`
    > Straight-ahead guitar rock that connects the Amber Hollow / Weathervane / The Wreckers side of the collection to its source.
32. **Creedence Clearwater Revival — Cosmo's Factory**  `Rock`
    > Roots-rock bedrock for the swamp-and-river flavoured Rock entries such as Salt Marsh, Cold Harbour and The Blackwater Band.
33. **Neil Young — After the Gold Rush**  `Rock`
    > The rustic songwriter end of Rock that Fable & Crow, Standing Stones and Marlowe & Sons plainly draw on.
34. **Dire Straits — Brothers in Arms**  `Rock`
    > The collector already owns Dire Straits and this is the band's most essential later album, bridging their Rock and AOR shelves.

### Three findings from the run

**1. A suggestion names an artist the collector already owns, and the spec does
not say whether that is wrong.**

#34, Dire Straits — *Brothers in Arms*, whose reason states it outright: "The
collector already owns Dire Straits". Measured against the payload: **1 of 34**
suggestions names an owned artist; Dire Straits is owned (1 record).

The prompt says "Do not recommend anything they already own", and **§9.2 does not
define whether that means the ARTIST or the RECORD.** The model read it as the
record and said so in the open. That is defensible — a different record by an
owned artist is a reasonable gap, and it is arguably the best-supported kind of
suggestion — but it is UNDEFINED rather than decided, and the ambiguity is in the
spec before it is in the prompt.

Note it is exactly CLAUDE.md §8's live distinction one level up: *a pressing is
not an album*, and here *an album is not an artist*. The app cannot check either
way — §9.2 sends artist names, not titles, so **the model could not avoid
suggesting an owned RECORD even if the rule said to**. Whichever reading is
chosen, only the artist-level rule is currently enforceable from the payload.

(NOT the first suggestion, and not Discharge — the first is Bathory. The
Discharge mention is inside #14's reason, referring to an owned record as
context, which is correct.)

**2. Thirty-four suggestions came back, and §9.2 has NO limit.**

§5.8 gives §9.1 `limit` (default 10). §9.2's row carries only "Rate-limited to
10/hour". Searched: **no count limit exists anywhere in §9.2 or §5.8**, the
prompt does not ask for a number, and neither the route nor the parser caps the
array. `max_tokens: 4000` is the only de facto bound — and `client.ts` calls it
"Short by construction: §9.2 wants a handful of suggestions, not an essay",
which this run contradicts: 34 suggestions, 2994 output tokens, and it stopped
because the model finished rather than because it hit the cap.

That comment is the prose-beside-wrong-code shape again, and it is the only place
"a handful" is written down.

Whether 34 is wrong is a judgement, not a defect. Against it: the UI renders one
bordered card each, so 34 is a very long page from a single click, and a
gap-analysis list nobody reads to the end is weaker than ten considered ones.
For it: they are grouped by genre and genuinely canonical, and truncating server-
side would discard model output the user paid for. **Recorded as undecided.** If
a limit is wanted, the honest place is the PROMPT (ask for N) rather than a
server-side slice, because slicing throws away work already billed.

**3. A29d's validation never fired, which is F2 confirming itself from the other
side.**

`dropped: 0`, so no discarded-count line appeared. Nothing needed rejecting —
every genre was one of the user's own, at a leaf.

**This is the sharpest possible statement of F2.** The mechanism A29d calls "the
mechanism that enforces the genre-accuracy requirement" has now run against real
model output and done NOTHING, because there was nothing to do. Had the model
flattened to `Punk`, F2 shows it would have been ACCEPTED — `Punk` is in the
vocabulary. So:

- the genre accuracy is real, and it comes ENTIRELY from the prompt and the
  model, not from the validation;
- the validation's only demonstrated power is against a genre outside the
  collection entirely (e.g. "Britpop"), which this run gave it no chance to show;
- **the backstop is untested in production conditions and F2 says it would not
  catch the specific failure it was built for.**

The run is the strongest evidence for the feature and it removes none of F2's
force. A29d's claim about its own mechanism remains wrong even though the feature
works.

## R5 remediation — F1 and F2

### F1: every Anthropic failure was a bare 500 — FIXED

Reproduced first, per the standing rule: nine tests written before any change,
all observed failing (`expected 500 not to be 500`; `expected [{…}] to have a
length of +0 but got 1`; `expected 'AI suggestions are not configured. Se…' not
to match /ANTHROPIC_API_KEY/`).

Four parts, three named in the review and **one found while verifying**:

1. **`isAnthropicConfigured` now rejects placeholders**, not only absence. Six
   narrow patterns (`your-key`, `put-your`, `replace-me`, `key-here`, `<…>`,
   `xxx|placeholder|changeme|todo`). Paired with an INVERSE test on two
   real-shaped keys, because a predicate that rejects a valid credential turns a
   working deployment into a dead feature — worse than the bug. It still cannot
   verify a key and does not try; a revoked-but-real key is caught downstream.
2. **A 401/403 is `LLM_UNAUTHORIZED` at 502**, naming the credential and giving
   NO retry advice. A rejected key is not transient, so "try again" sends the
   user round the same loop. Verified the UI's "Try again after" is gated on
   `retryAt`, which only the 429 carries.
3. **An unbilled call refunds its slot.** `claimLlmRequest` returns its row id;
   `releaseLlmRequest(id)` deletes **by id, never by recency** — pinned by a test
   with two claimants in flight, since deleting "the newest row" would delete a
   CONCURRENT caller's claim. Refund is narrow: 401/403 only. Two inverse tests
   confirm an unreadable response and a 529 keep their slots.
4. **THE ONE THE REVIEW MISSED.** `errors.ts`'s docblock for `notConfigured`
   requires that the message "never name the environment variable, which reaches
   a browser and describes the deployment's shape". The images route obeys it
   ("Add a Vercel Blob store"); `/api/suggestions/ai` said "Set
   ANTHROPIC_API_KEY." **R5's own write-up proposed the same violation** — the
   fix was found by reading the module's contract, not from the live run. Both
   paths now obey it.

### F2: the prompt sent a flat list where A29d claimed a hierarchy — FIXED

Reproduced at both layers before changing anything: the prompt rendered
`Punk, UK82, US Hardcore, Rock`, and `collection-summary.ts` never referenced
`parent_genre_id` at all.

`buildCollectionSummary` now selects each genre's parent via a self-join — not
`genreSubtree`'s recursive CTE, which answers a different question (every
descendant of one node) when what is needed is each genre's immediate parent.
The prompt renders it as:

    GENRES THEY ORGANISE BY:
    - Punk
    - Rock
    - UK82 (a kind of Punk)
    - US Hardcore (a kind of Punk)

A flat collection still reads as a plain list — pinned by a test, since most
collections are flat and the common case must not become noisier.

**`Punk` stays in the vocabulary.** The plausible wrong fix was sitting next to
the right one: removing parents would make every suggestion invalid for a
collection legitimately organised at the top level. A test now pins that a parent
genre is ACCEPTED, with a comment saying it is a decision rather than an
oversight.

### The decision R5 was asked to make: what does the validation check?

**It stays a vocabulary check. Rejecting a parent is deliberately NOT a rule.**

The two mechanisms answer two different failures and neither backs up the other:

- **The prompt** prevents FLATTENING, now that it can show which term is a
  parent. It asks for "the most specific genre that fits" rather than forbidding
  parents.
- **The parser** catches an INVENTED genre — "Britpop" against a collection with
  no such genre.

Why not enforce it in the parser: **"nothing is tagged Punk" is a fact about the
collection today, not a rule about it.** A user may tag at a parent tomorrow, and
a validation keyed to current tagging would silently delete correct suggestions
on a state change nobody made. Being wrong in the prompt costs a weaker
suggestion; being wrong in the parser deletes a good one. The asymmetry decides
it.

### Three prose corrections, because the false claim had propagated

A29d's text, `parse-suggestions.ts`'s docblock and `client.ts`'s docblock all
asserted that the vocabulary makes flattening "mechanically detectable". All
three now state what is actually caught (an invented genre) and what is not (a
parent term), and name the prompt as the thing that addresses flattening.

**This is the prose-beside-wrong-code pattern with the prose in the SPEC.** The
amendment described a mechanism the code did not implement, and three files
repeated it downstream.

### Verification

vitest **2694 passed, 1 skipped, 170 files** (from 2667). typecheck, lint, build
clean.

**Full E2E run TWICE, and the first read was reported wrong.** Run 1 was
initially summarised here as "233 passed, 3 flaky" from the tail; the run had
**7 failed** — the count sits above the region that was read. Corrected
immediately, and worth keeping as an instance of the rule it breaks: read the
whole result, not the summary.

| run | passed | failed | flaky |
|---|---|---|---|
| 1 | 233 | 7 | 3 |
| 2 | 234 | 5 | 3 |

**All twelve failures are login-stage** (`toHaveURL('/')` receiving `/login`),
all `[mobile]`, none reaching an assertion about the changed code. **The failure
SET moved between runs**: eleven distinct specs, one overlap
(`manage.spec.ts:510`, which touches neither genres nor suggestions and also
failed at login). Per NOTES' moving-failure rule — the rule works on the set, not
the run — that is the mobile contention already tracked here at six sightings,
now seven. Run 2 also logged `⨯ Error: The destination stream closed early` from
the dev server, a server-side symptom consistent with contention.

An isolated re-run of the three affected spec files on the STASHED pre-change
tree passed 37/37, but that proves little: mobile-only against three files is not
the full parallel load, and the comparable evidence is the moving set across two
full runs on the changed tree.

### Finding 3: "already owned" is now an artist-level rule — FIXED (A29g)

**Verified before amending, and the verification sharpened the finding.** The
payload carries want-list titles but NOT owned-record titles:

    artists:  SELECT a.name, COUNT(DISTINCT r.id), ARRAY_AGG(g.name)   -- no title
    wantList: SELECT a.name AS artist, w.title, w.priority             -- title

So the prompt's single sentence — "Do not recommend anything they already own or
that is already on their want list" — contained two clauses with DIFFERENT
enforceability, which the review had not noticed:

| clause | payload carries | enforceable at record level |
|---|---|---|
| already own | artist names only | **no** |
| already on want list | artist AND title | **yes** |

The prompt now states only what the data supports: a different record by an owned
artist is explicitly welcomed (and the model is asked to say so in its reason),
while the want-list prohibition keeps its record-level form. **The asymmetry is
the finding**, and it is why this is a decision rather than a wording fix.

**The alternative was available and declined:** sending owned record titles would
make a record-level rule enforceable, at the cost of putting every title in the
collection on the wire for a constraint that buys little — §9.2's disclosure
boundary is deliberately narrow, and the live run showed the model already avoids
obvious repeats. Recorded in A29g so it is not re-proposed as an obvious gap.

**The Dire Straits case was a good suggestion, not a defect.** An artist with
records on the shelf is demonstrably collected; naming another is the gap this
feature exists to find.

Verified: vitest **2696 passed, 1 skipped, 170 files**; typecheck, lint, build
clean; full E2E **242 passed, 0 failed, 0 flaky**.

**That clean E2E run is itself evidence for the contention entry above** — the
same tree that produced 7 and 5 hard failures on the two previous runs produced
zero here, with no code change to the E2E surface between them. The variance is
in the harness.

### PROVENANCE: the dev genre hierarchy is TEST DATA, built for this review

**Read this before treating the Punk tree as real structure.** Created
2026-08-20 by R5, in the DEV database only, specifically so the genre-accuracy
check could fail. It is deliberately LEFT IN PLACE — it is better data than the
flat `Punk` it replaced — but it was not built by anyone curating a collection.

What was done:

1. `Punk` (already existed, flat, 21 records) became a PARENT with two children
   created beneath it: **UK82** and **US Hardcore**.
2. All 21 records tagged `Punk` were re-tagged at a LEAF and the `Punk` tag
   removed, leaving **Punk with 0 records**. Without that the check is inert:
   "Punk" IS the punk genre, so nothing can be flattened into it.
3. The UK82 / US Hardcore split was made by R5 on the FEEL of the band names.
   It is a plausible split, not a researched one.

**UK82 (15):** Blank Signal — No Fixed Address; Broken Glass Club — Last Bus
Home; Curfew — After Dark; Dead Letters — Return to Sender; **Discharge — Grave
New World**; Panic Merchants — Everything Is Fine; Sirens — Blue Light Special;
Spit & Sawdust — Public Bar; The Agitators — Wind Up; The Flyposters — Bill
Stickers Will Be Prosecuted; The Kerb Crawlers — Saturday Night Fever Dream; The
Nihilists — Nothing Doing; The Offcuts — Cheap Thrills; The Rotters — Compost;
The Vacant Lot — Concrete Sunrise.

**US Hardcore (6):** Bin Day — Municipal Waste Disposal; Council Estate — Right
to Buy; Exit Wound — Bandage; Riot Shield — Twelve Inches of Trouble; Static
Youth — Nothing Ever Happens Here; Tin Pot — Dictator.

**THE ARTIST NAMES IN THIS SET ARE SYNTHETIC.** Of the 21, only **Discharge** is
a real band; the other 20 are generated test data, as is most of the 125-record
dev collection. This matters for reading the live run: the model reasoned about a
collection of largely non-existent bands and still produced canonical, correctly
scened suggestions — which strengthens the GENRE conclusion (that is independent
of whether it recognises the names) and weakens any conclusion about SUGGESTION
QUALITY against a real shelf. **R8 is where suggestion quality gets judged, on
Adam's actual records.**

Also note the US Hardcore six are, by name, plainly British — "Council Estate",
"Bin Day", "Right to Buy". The model still described them as a US Hardcore shelf
because that is how they are TAGGED, which is correct behaviour given the payload
and worth knowing before anyone reads those five reasons as evidence about the
bands.

**The rule this earns:** *a migrator's exit code is not evidence. Verify the
OBJECTS.* `information_schema` for tables and columns, `enum_range` for enums,
and `count(*)` on `drizzle.__drizzle_migrations` against the journal length.
CLAUDE.md §7 already requires migrations to "run clean on an empty database";
what this adds is that a POPULATED database needs the objects checked too,
because the failure mode there is silence rather than a failure.

**And a workflow gap, not just a tooling one.** No step in CLAUDE.md's loop
checks that dev matches the journal, so a feature can be committed green — 2667
tests passing against the local Docker database — while being unrunnable in dev
for want of a table. That is exactly what happened to §9.2: `f48bc99` shipped a
feature whose first action is a write to `llm_requests`, and dev had no such
table. **Deferred to R6 with a named trigger** (deploy readiness), which will
meet the same divergence against production Neon, where the recovery options are
worse.

### Two cross-file tests caught it, which is what they are for

- `test/integration/schema.test.ts` asserts `image_type`'s values AND their
  `enumsortorder`. It failed on the addition, in a file this unit never opened.
  Position matters as much as membership: a bare `ADD VALUE` appends, and an
  appended `gatefold` would file the sleeve's own artwork behind close-ups of
  the dead wax everywhere the order is used.
- `test/repo/migrations-complete.test.ts` copies only GIT-TRACKED files and
  migrates from empty. It failed because the new `.sql` and snapshot were
  untracked while the journal referenced them — precisely the "new developer
  clones the repo and migrations fail" scenario. `git add` fixed it, and the
  failure was the test doing its job.

### Seventh sighting of the mobile contention

Full E2E at `--retries=0`: 2 failed, immediate re-run 228/228 clean. This unit
touches an enum and a gallery ordering; no E2E-covered path changed. Unrelated,
and the investigation stays open.

# The enum-value restriction a later migration WILL hit

Recorded separately from unit 0's log because the error message does not point
at the cause, and the next person to meet it will be writing a migration that
backfills `gatefold` rows.

**You may add an enum value inside a transaction. You may not USE it in the same
transaction.**

    BEGIN;
    ALTER TYPE image_type ADD VALUE 'gatefold';   -- fine
    UPDATE images SET image_type = 'gatefold' ...  -- ERROR
    -- ERROR:  unsafe use of new value "gatefold" of enum type image_type
    -- HINT:   New enum values must be committed before they can be used.

Measured on Postgres 16.14. drizzle-kit wraps each migration FILE in a
transaction, so the rule in practice is: **adding a value and writing rows with
it must be two migration files.** 0011 adds the value and deliberately does
nothing else.

**The correction this replaces.** I expected `ALTER TYPE ... ADD VALUE` to fail
inside a transaction at all — that restriction was real and was lifted in
Postgres 12. Carrying the old rule forward would have produced 0005's
create/swap/drop dance for no reason, rewriting a column to add one label. The
restriction that survives is the narrower one above, and it is easy to conflate
the two because both are "ADD VALUE and transactions".

# Two more absence-as-success instances, both in the migration toolchain

This family keeps arriving. Two new members, and the second cost the most time.

**1. A hand-written migration reports success and applies nothing.** Writing
`drizzle/0011_x.sql` and appending an entry to `meta/_journal.json` is not
enough: drizzle-kit also needs `meta/0011_snapshot.json`. Without it,
`drizzle-kit migrate` prints

    [✓] migrations applied successfully!

and applies nothing. The success line is unconditional on the file being found.

*Tell:* the applied count in `drizzle.__drizzle_migrations` does not move. Check
the SCHEMA after a migration — `enum_range`, `\d table` — not the success
message.

**2. `npx drizzle-kit migrate` does not load `.env.test`, and fails silently.**
The worse of the pair. It exits **1** with an empty stderr, having applied
nothing, because it resolved no usable database URL. That reads exactly like a
broken migration, and I debugged my own SQL for several steps — running the
statement by hand against the test database, where it succeeded, which made it
look like a drizzle bug rather than a connection one.

*What resolved it:* the identical command against a scratch database with the
URL passed explicitly exited 0. The variable, not the SQL.

    TEST_DATABASE_URL=postgresql://... npx drizzle-kit migrate   # works
    npx drizzle-kit migrate                                       # exit 1, silent

`npm run db:migrate` is a bare `drizzle-kit migrate` and has the same gap.

**And a process rule from the detour.** Diagnosing the migrator by applying its
DDL directly through psql advanced the schema WITHOUT advancing
`__drizzle_migrations`, leaving the test database in a state neither the
migrator nor the tests expected. Rebuilding from empty was the fix and took
seconds. **Diagnose a migrator against a scratch database, never against the one
under test** — the diagnostic itself is a write.

## Step 13 unit 1 — choosing the spine-colour algorithm by measurement

§10b: "a spine's colour is the average colour of its cover". Four candidates were
run against the THREE REAL COVERS in the dev database — Discharge *Grave New
World* (near-monochrome dark airbrush), Dire Straits (pale cream border, sepia
painting), Luther Vandross *Never Too Much* (warm brown portrait) — and rendered
as spines in a row.

| | Discharge | Dire Straits | Vandross |
|---|---|---|---|
| A — mean, sRGB | `#2f281f` | `#c6b9a7` | `#7a4b29` |
| B — mean, linear light | `#363028` | `#d8cbb7` | `#92603c` |
| C/D — dominant bucket | `#1b130a` | `#fff2da` | **`#070101`** |

**Chosen: B.** Averaging gamma-encoded sRGB under-weights bright pixels; B is
measurably lighter on every cover, and on Dire Straits — where the cream border
is most of the sleeve — it is the more faithful answer.

### The screenshot earned its place: dominant-bucket is WRONG, not just different

`#070101` for Vandross. The most populous colour bucket is the leather jacket, so
a cover that reads warm brown gets a near-black spine. That is a wrong answer
about a real record, and it was **invisible in the hex column and obvious in the
row** — `#070101` beside `#1b130a` looks like two dark values until they are
spines next to a cover you can see.

The rule: for anything whose output is a colour, a position or a size, render it
at the size the user sees it. A table of values shows that the numbers differ,
never whether they are right.

### When a measurement looks suspiciously uniform, test the INSTRUMENT first

All three covers landed within **11° of hue** (25°, 34°, 36° — orange-brown).
That is exactly what a broken averager looks like: everything converging on mud.

Two explanations fit the same evidence — *the covers are brown* and *the
algorithm destroys colour* — and they are indistinguishable from the output
alone. So the instrument was tested on inputs whose answer is known: a synthetic
red sleeve, and a blue one.

    red sleeve  -> #a7191d   (clearly red)
    blue sleeve -> #8394c2   (clearly blue)

The mean preserves strong hues. The brown is the collection, not the code.

**Carry this past this instance.** A uniform result is evidence about the
measurement as much as about the data, and the cheapest way to tell them apart is
a control input with a known answer. Without those two controls, "the covers are
brown" was a guess that happened to be right.

### Declining a saturation boost — §8 in a place that was easy to miss

The obvious next move, once the shelf reads brown, is to push saturation so it
looks livelier. **That is inventing colour the record does not have**, and it is
CLAUDE.md §8's confidently-misleading rule arriving somewhere it does not
announce itself: not a wrong price or a wrong pressing, just a shelf prettier
than the sleeves on it. A spine is a claim about a cover.

### Lightness is what distinguishes the spines, and that is where to look later

Measured on the chosen algorithm:

| | hue | saturation | lightness |
|---|---|---|---|
| Discharge | 34° | 15% | **18%** |
| Vandross | 25° | 42% | **40%** |
| Dire Straits | 36° | 30% | **78%** |

Hue clusters within 11°; lightness spreads 18/40/78%. **The row is legible
because of lightness, not hue.**

Recorded because three records cannot answer whether thirty muted sleeves read as
a shelf or as a smear. If it turns out to be a smear, this says where to look:
the RENDERING — spacing, edge highlights, a dividing rule between genre sections
— not the colour. The stored hex would not change, so that fix stays cheap.

### Implementing it: two things the measurement had not exposed

**1. `sharp` was declared, not added.** It was already in the tree as a
transitive dependency of Next 16 and already loadable, so `npm ls` reports it
`deduped` and the lockfile did not change. What was missing was the declaration —
and undeclared, a minor Next release dropping it would break §10b's shelf with a
module-not-found from a package nobody chose. Pinned to `0.35.3`, the version
already present, with the reasoning in a `dependencyNotes` field in
`package.json` because JSON takes no comments and someone will otherwise see a
heavy native dependency for one colour computation and try to remove it.

**2. `.removeAlpha().resize()` does not do what it reads as, in EITHER order.**
The obvious pipeline is wrong and the wrongness is invisible:

    removeAlpha only          -> {200,30,35}                       correct
    removeAlpha THEN resize   -> {0,0,0, 201,30,35, 200,30,35, …}  wrong
    resize THEN removeAlpha   -> same
    kernel: 'nearest'         -> same

sharp premultiplies during resampling, so a transparent neighbour contributes
nothing to the numerator while still counting — introducing pixels of `0,0,0`
that were never in the image and dragging the average dark. Reordering does not
help and neither does a nearest-neighbour kernel; both were tried.

The fix is to keep the alpha channel (`ensureAlpha`) and weight by it in our own
loop: a fully transparent pixel contributes nothing at all, a half-transparent
one contributes half, and no synthetic colour is introduced. Flattening onto
white or black would each invent a background the sleeve does not have.

**Found by a test that failed for the right reason.** The alpha case was written
because §5.9 accepts PNG and a transparent cover is possible, not because
anything suggested a bug. It failed, and the failure was real code rather than a
wrong expectation — unlike the sibling failure in the same run, where I had
written `#0c8c5a` for rgb(20,140,90) because 20 is `0x14`, not `0x0c`. Two
failures, one test wrong and one implementation wrong, and only checking each
told them apart.

**Verified against the real covers afterwards**, since synthetic images cannot
confirm the values the algorithm was chosen for. The module reproduces the
measurement within one bit per channel — `#363129` / `#d8cbb8` / `#92603d`
against the probe's `#363028` / `#d8cbb7` / `#92603c`, the difference being
sharp's resampler versus the BMP-based probe.

### The Neon branch needed the columns applied by hand

`test/integration/neon-transactions.test.ts` failed 4/4 after the migration:
the local database had `spine_colour`, the remote branch did not, and Drizzle
generates `INSERT` column lists from the schema.

`TEST_DATABASE_URL=<neon> npx drizzle-kit migrate` is REFUSED by
`assertLocalTestDatabase` — correctly, since that variable is the one
integration tests truncate from, and pointing it at a remote host is exactly the
accident the guard exists for. So the two DDL statements were applied directly
to the throwaway branch.

**Worth knowing for every future migration:** the Neon branch's schema is
maintained out of band and will drift silently. The tell is `neon-transactions`
failing with a column list mentioning something the branch lacks, which reads as
a transaction bug and is not.

# sharp premultiplies during resize, so `removeAlpha` cannot be trusted with it

**The obvious code is the wrong code, and the error is invisible** — it produces
a colour slightly too dark, not an exception, not a wrong shape. Nothing in the
output says it happened.

Measured on a half-transparent red square (`rgb(200,30,35)`, alternating pixels
at alpha 0 and 255), all four on sharp 0.35.3:

| pipeline | distinct pixels out |
|---|---|
| `.removeAlpha()` alone | `{200,30,35}` — correct |
| `.removeAlpha().resize()` | `{0,0,0}`, `{201,30,35}`, `{200,30,35}`, `{199,29,35}` |
| `.resize().removeAlpha()` | same |
| `.resize({kernel:'nearest'})` | `{0,0,0}`, `{200,30,35}` |

Resampling blends neighbours, and a fully transparent neighbour contributes its
RGB — which is usually zero — while still counting toward the divisor. So black
enters an image that contained none. **Reordering does not fix it; a
nearest-neighbour kernel does not either.** Both were tried, not reasoned about.

**The fix: keep the alpha channel and weight by it yourself.**

    const { data, info } = await sharp(bytes)
      .resize(N, N, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // alpha 0 contributes nothing; alpha 0.5 contributes half
    const alpha = data[i + 3] / 255;
    if (alpha === 0) continue;
    r += toLinear(data[i]) * alpha;
    weight += alpha;

Exact, and it introduces no synthetic colour. Flattening onto white or black
would each invent a background the sleeve does not have — the §8 shape again.

Guard the divide: a fully transparent image has `weight === 0`, and dividing
yields `NaN`, which clamps to `#000000` — black invented out of nothing. It
returns `null` instead, which §10b already renders as a plain spine.

# Two failures in one run are not one finding until you check

The spine-colour run failed twice at once:

    × caps the work by downsampling      expected '#148c5a' to be '#0c8c5a'
    × ignores an alpha channel           expected '#ae181d' to be '#c81e23'

Both were colour mismatches in the same new module, minutes apart, and the
tempting read is a single root cause — some systematic darkening. It was not:

- The first was a **wrong expectation.** rgb(20,140,90) is `#148c5a`; I had
  written `0x0c` for 20, which is 12. The code was right.
- The second was a **real bug**, the premultiplication above.

Assuming a shared cause would have led to "fix" the code until both passed,
which for the first one means changing correct behaviour to match a mistake.
Checking each separately — deriving the hex by hand, then dumping sharp's actual
pixels — took two minutes and pointed opposite directions.

**The rule, filed with the mutation-verification ones:** simultaneous failures
are evidence of nothing in particular. Establish each one's cause independently
before proposing a fix that addresses both. The stronger the apparent pattern,
the more it is worth checking, because a coincidence that *looks* systematic is
what makes the wrong fix feel obvious.

# STANDING HAZARD: the Neon test branch drifts, and the symptom misleads

Not an incident — a property of the setup, and this was its second occurrence.

`test/integration/neon-transactions.test.ts` runs against a real Neon branch
whose schema is **maintained out of band**. Nothing applies migrations to it, so
every migration touching a table that file writes leaves it behind.

**The symptom reads as a transaction bug.** Drizzle builds `INSERT` column lists
from the schema, so a missing column surfaces as

    Failed query: insert into "records" (…, "spine_colour", …) values …

inside a test named "rolls back the real nested-write primitive", with 4/4 of
that file red and everything else green. It looks like the transactional code
broke.

**The tell:** the failing column list names something added recently, and the
rest of the suite passes. `neon-transactions` is the only file talking to a
network service; every other integration test is local Docker.

**The fix, and why the obvious one is refused.**
`TEST_DATABASE_URL=<neon-url> npx drizzle-kit migrate` is rejected by
`assertLocalTestDatabase`:

    Refusing to run destructive test helpers against non-local host "…neon.tech".

That guard is CORRECT and must not be worked around: `TEST_DATABASE_URL` is the
variable integration tests truncate from, and pointing it at a remote host is
precisely the accident it exists to prevent. Apply the DDL to the throwaway
branch directly instead, with a short script against `NEON_TEST_DATABASE_URL`.

**Do this in the same unit as the migration**, not when the tests go red. Both
occurrences so far were diagnosed after the fact; the cost is entirely in the
diagnosis, and the fix is thirty seconds.

## Step 13 unit 1b — wiring the colour in, and the backfill

Two write paths compute it, and the difference between them is the interesting
part.

**`attachDiscogsCover`** computes it after writing the image row, from the bytes
`fetchImage` has already returned — §10b's "once, at import". After the row, not
before: the colour describes a cover that exists, and a failure between the two
should leave no colour rather than a colour for nothing.

**The upload route computes it for `imageType === 'cover'` ONLY**, and that
restriction is the point rather than a detail. A matrix photograph is mostly
black vinyl; a centre-label shot is mostly a colour that is not the sleeve.
Either would give a spine matching no part of the record as it sits on a shelf.
An untyped upload is not a claim to be the front either — §4.2 makes the column
nullable and the form does not require it.

**The gap-fill guard lives in the query layer, not at the call sites.**
`setSpineColourIfUnset` adds `AND spine_colour IS NULL` to the update, so §7.8's
never-overwrite rule cannot be forgotten by a third writer. A spine computed
from a sleeve the user photographed survives a later re-import.

`null` is deliberately treated as ABSENT rather than as a decision: a record
whose first cover failed to decode should still get a colour when a readable one
arrives.

### The backfill is a script, and it self-checks

`scripts/backfill-spine-colours.mjs`, run by hand, `--dry-run` supported.

**Not a migration.** The colour comes from bytes in Vercel Blob, so computing it
needs a network fetch per record — and a migration reaching out to a CDN makes
`db:migrate` depend on blob storage being reachable and a token being present. A
migration that cannot run offline blocks a fresh clone.

**Not a hand-fix either, at three records.** The same path runs the next time the
algorithm changes or a batch of covers lands without one, and an ad-hoc `UPDATE`
teaches nobody how to repeat it.

**It carries a COPY of the algorithm, so it verifies itself before writing.**
The script is plain `.mjs` run by node with no bundler; the module it would
import is `server-only` TypeScript. Duplication was the only option, and a
backfill writing subtly different colours from every future import is the worst
form of drift — two sources of truth for one shelf, with no error anywhere. So
it averages a known red square first and exits non-zero if the answer is not
`#a7191d`.

Also `DISTINCT ON (r.id) … ORDER BY i.created_at ASC`, so the OLDEST cover wins
— matching the gap-fill rule rather than contradicting it.

Result on the real collection: `#363129` Grave New World, `#92603d` Never Too
Much, `#d8cbb8` Dire Straits — the measured values. Re-running reports "nothing
to do".

### Third occurrence of the Neon drift, one unit after recording it

The hazard note said the fix costs thirty seconds and the cost is all in the
diagnosis. That held: the backfill failed instantly with `column r.spine_colour
does not exist`, and the DEV database — also Neon — needed the same two DDL
statements as the test branch.

So the standing note should say **databases**, plural: the local Docker test
database is migrated by `drizzle-kit`, and BOTH remote ones (dev and the Neon
test branch) are maintained out of band and drift on every migration.

# When duplication is forced by a boundary, the copy must verify itself

`scripts/backfill-spine-colours.mjs` carries a second implementation of the
spine-colour average. That was not a choice: the script is plain `.mjs` run by
node with no bundler, and `src/lib/images/spine-colour.ts` is `server-only`
TypeScript. There is no import that works.

**The danger is not the duplication, it is that the duplication is silent.** A
backfill writing subtly different colours from every future import gives two
sources of truth for one shelf, with nothing raising an error anywhere — the
shelf simply has two populations of spine, and which one a record belongs to
depends on when it was added. That is the confidently-misleading shape with no
symptom at all.

So the script asserts, before it touches a row:

    const got = await averageColour(solidRedPng);
    if (got !== '#a7191d') {
      console.error('This script has drifted from src/lib/images/spine-colour.ts.');
      process.exit(1);
    }

A solid red square must average to itself. It is one line of arithmetic that
both implementations must agree on, and it fails loudly at the moment of
divergence rather than quietly at every write.

**The general rule:** when a boundary forces a copy — a script that cannot
import the app's module, a client type restating a server shape, SQL duplicated
between a migration and a query — the copy carries a check against a value both
implementations must produce. Pick an input whose answer is fixed by the
definition rather than by either implementation, so the check cannot be
satisfied by copying a bug.

Related, and the counter-example worth remembering: `lifeSpan` was a client type
restating a server shape with NO such check, and it was wrong for an entire
build step while typechecking perfectly. That one was fixed by removing the
duplication (`type Candidate = ArtistSearchHit`), which is better than verifying
it — **eliminate the copy where the boundary permits, verify it where it does
not.**

## Step 13 unit 2 — the shelf query, and the one design decision in it

`shelfRecords()` returns owned records grouped into sections. The decision worth
recording is what a section IS.

**Sections are TOP-LEVEL genres, not the genres a record carries.** A record
tagged UK82 and one tagged US Hardcore stand together on the shelf, because both
are Punk — while staying distinct on the record, in every filter, and in §7.1's
hierarchy. §8 forbids flattening those scenes and this does not: it groups them
for one screen's layout without changing what any record says about itself.

Sectioning by the tagged genre instead would put two shelves of punk at opposite
ends of the wall, which is precisely the opposite of §10b's "all the punk
together".

**Deliberately the same rule §8.1's graph used to colour an artist**, including
the tie-break. Two screens grouping one collection by different genre logic
would disagree about what belongs together, and the disagreement would look like
a bug in whichever one the user checked second.

### A spine occupies one position, so exactly one genre wins

A record can carry several genres; a spine cannot stand in two places. The naive
join emits the record once per genre, which on a wall is the same record
appearing twice.

`DISTINCT ON (record_id) … ORDER BY root_name` picks the alphabetically-first
top-level ancestor. **Arbitrary, but stable** — and stable is the requirement.
§8.2's determinism rule outlived the feature it was written for: a wall that
reshuffles between page loads cannot be used to find a record by eye, which is
§10b's entire purpose.

### Three absences, each rendered as itself

- **No genre** → its own section, named "No genre", sorted LAST. Not hidden, not
  filed under something. Last because it is the leftovers, and a section with
  that name sorted alphabetically into the middle of the wall would read as a
  genre. Omitted entirely when empty.
- **No release year** → `NULLS LAST` within the artist. Sorting NULL as 0 would
  file every undated record in front of ones genuinely older, asserting a date
  nobody entered.
- **No colour, catalogue number or label** → `null`, never a default or an empty
  string. §10b: "a plain spine — an honest absence, not a gap in the wall."

### The cycle guard is load-bearing, and mutation proved it

`genres.parent_genre_id` has no cycle constraint — the guard is at the
application layer (§4.1) — so `a → b → a` is storable, and the upward walk needs
a bound. `WHERE c.depth < 16` is that bound.

The test passed on first write, which CLAUDE.md §2 treats as suspect until
explained. Removing the bound made it **time out**: the request hangs rather
than returning a wrong answer, exactly as the comment claims. The guard is real.

**One trap the mutation created**, worth knowing: killing a `vitest` run
mid-recursion left the test database wedged for the following run, and every
shelf test then timed out. It was not a bad restore — the guard was back and the
`genres` table held one clean row. A plain re-run was green. **A timed-out
recursive query can outlive the process that issued it; re-run once before
diagnosing the code.**

# A timed-out recursive query outlives the process that issued it

Killing a `vitest` run mid-recursion — a `WITH RECURSIVE` with its depth bound
mutated away — left the test database wedged. Every shelf test in the NEXT run
timed out at 10s, including ones that had passed moments earlier.

**It reads as a bad restore**, which is the trap: the natural conclusion is that
the mutation was not fully reverted, so the time goes into re-diffing correct
code. Both checks said otherwise — `WHERE c.depth < 16` was back, and `genres`
held a single clean row with a null parent.

A plain re-run was green.

**The rule: after killing a run that was executing a recursive or long query,
re-run once before diagnosing anything.** `pg_stat_activity` showed no stuck
backend by the time it was checked, so the residue is not always visible either
— absence of a blocker is not evidence the previous run left nothing behind.

Related to the two-processes-one-database note already recorded: the shared
Docker test database has no isolation between runs, and `fileParallelism: false`
serialises files WITHIN a run and nothing across them.

# When a spec section is retired, some of its reasoning may belong elsewhere

§8.2's shelf ordering is gone — retired with the graph screen, because it needed
enough records for clusters, a built-out genre hierarchy and hand-entered
influence edges, none of which exist. But one of its requirements survived the
feature that motivated it:

> **"The same collection must always produce the same shelf order."** A shelf
> that reshuffles between page loads is useless for a physical shelf.

§10b's wall is a different feature — genre sections rather than community
detection — and the requirement applies unchanged, for a reason §10b never
states: a wall you scan by eye cannot move between loads, or you re-scan it
every time. `shelfRecords` therefore breaks every tie deterministically
(`DISTINCT ON … ORDER BY root_name`, then artist, year, title, id) and there is
a test pinning it.

**The general point.** Retiring a section deletes its mechanism, not necessarily
its constraints. Before removing one, read it for requirements that are about
the PROBLEM rather than the solution — determinism, absence handling, ordering
guarantees — and check whether the replacement inherits them. Nothing in the
retirement diff would have surfaced this; it was noticed because §8.2 had been
read closely enough to remember the sentence.

# A retired feature's preconditions can survive into its replacement, unstated

§8.2's shelf ordering was retired for three stated reasons: it needed enough
records for clusters, **a built-out genre hierarchy**, and hand-entered
influence edges — none of which the collection has.

§10b replaced it, and its sectioning quietly assumed the second one. "All the
punk together" only groups anything if UK82 and US Hardcore sit UNDER Punk. The
real collection has six genres for five records and **every one is top-level**,
so the top-level-ancestor walk was correct and did nothing: five sections of one
record each, each rendering its own full-width black band. It read as broken
rather than as short.

**The precondition outlived the feature that named it, and the check went with
the feature.** §8.2 said out loud that it needed a hierarchy; nothing in §10b
did, because §10b was written as a fresh feature rather than as a successor. So
the requirement was inherited and the sentence recording it was not.

**The rule:** when replacing a retired feature, read the RETIREMENT REASONS as a
checklist against the replacement, not just as history. If a feature was
retired because the data could not support it, ask what the replacement assumes
about that same data. The reasons are usually about the collection rather than
about the mechanism, and a new mechanism over the same collection inherits them.

**And it was only caught by looking.** Every test passed — the grouping is
correct, the determinism holds, the absences render honestly. What the tests
could not say is that five correct sections look wrong on a page. The screenshot
was the instrument, as it was for the spine colours; the difference is that
there the row exposed a wrong VALUE and here the page exposed a wrong SHAPE.

## Step 13 unit 3 — the wall, and two things only a screenshot could say

### Sections were built, rendered, and removed

The first version grouped spines into genre sections with a heading and a shelf
band each. Every test passed: the grouping was correct, the ordering
deterministic, the absences honest. **It looked broken.** The real collection has
six genres for five records and every one is top-level, so it rendered five
near-empty black bands stacked down the page — you scrolled past the first
before reaching the second.

§10b was amended to one continuous shelf with no headings, matching the
reference it borrows from (1,300 spines, no headings at all). **The ordering
survived intact**: "all the punk together" is a sentence about ADJACENCY, and
ordering by top-level genre delivers it without a heading. The section tests
became adjacency tests, which is the property that actually mattered.

Recorded separately: the sectioning had inherited §8.2's "needs a built-out
genre hierarchy" precondition without inheriting the check.

### The wide screenshot hid a defect the crop showed

The full-page shot at 1280 looked right. Cropping to the spines showed the text
clipped at BOTH ends — `…re Straits · Dire Straits · BSK 32…` — taking the
catalogue number with it.

Measured, not eyeballed: a 210px spine at 9px mono holds ~31 characters, and
four of five real spines needed 38, 41, 43 and 49.

**So: screenshot at the size the user sees, then crop to the element.** The wide
view answers "is the layout right"; only the crop answers "is the content
right". This is the second time this unit that a picture caught something no
test could — the first was five correct sections looking wrong on a page.

### Truncate to FIT, and the degenerate case was measured before it was decided

The budget is computed from the spine height, minus artist and catalogue number,
with the remainder given to the title. A short spine loses nothing —
`John Lennon  test  1a 20` renders whole — and a long one loses exactly enough.

§10b names the casualty: the catalogue number "is the collector's identifier and
earns its space", the artist is how a record is found, so the title absorbs the
shortfall.

**The degenerate case — artist plus catalogue exceeding the budget alone — is
not hypothetical.** Measured across plausible collections, four of six pairs
blow it before the title gets a character:

    Emerson, Lake & Palmer + K 50422        31
    Crosby, Stills, Nash & Young + SD 7200  37
    The Jimi Hendrix Experience + 613 001   36
    Siouxsie and the Banshees + POLS 1056   36

There the ARTIST gives way, and the measurement decided the direction rather
than taste:

    truncate artist    -> "Crosby, Stills, Nash …  SD 7200"    still obvious
    truncate catalogue -> "Crosby, Stills, Nash & Young  S…"   identifies nothing

**A clipped artist stays readable because its distinguishing information is
front-loaded; a catalogue number's is spread across the whole string.** `BSK 32…`
is not an identifier. That asymmetry is the reason, and it generalises to any
field pair where one is a name and the other a code.

Separators dropped from ` · ` to two spaces — identical on a rotated mono spine,
six characters back for the title, free alongside the truncation.

### One test wrong for the right reason

`spineText` returned `Discharge  Hear Noth…  CLAYLP 3` where the test demanded
the untruncated form. The string is 33 characters against a 31 budget: the
assertion was asking for something that does not fit, and the code was right.
Same shape as the `#0c8c5a` slip in unit 1a — a hand-derived expectation that
did not survive its own arithmetic.

### 33 E2E failures, and the stash test that split them in two

Changing `/`'s default view to `shelf` (§10b) broke 33 E2E tests across nine
spec files this unit never opened — the cross-file break CLAUDE.md §10 requires
the full run to catch.

**Not all 33 were mine, and the cheap way to find out was `git stash`.**
Running `graph.spec.ts` against the stashed tree — my changes removed entirely —
still failed 1 of 7, with `Received: /login`: a login that did not take. That
failure predates the shelf and is the mobile/parallel contention this file has
been tracking for seven sightings.

**The technique is worth naming.** When a change breaks many tests at once, the
first question is not "which of my edits caused this" but "how many of these
were already failing". `git stash && <run> && git stash pop` answers it in one
run and costs nothing. Without it the login failure would have been attributed
to the view change and debugged there — the same trap as the two simultaneous
failures in unit 1a, at suite scale.

**The genuine breakage was 22, in `collection-filters` and `collection-widths`,
and the fix is not a workaround.** Those specs test FILTERING, PAGING and
WIDTHS — behaviours of the table and grid, not of the wall — and they navigated
to `/` relying on a default rather than stating their subject. They now ask for
`?view=table` explicitly, which says what each test is about and survives the
next time a default moves.

After the fix: 11 of 13 pass, and the remaining 2 are `apiRequestContext.post`
TIMEOUTS during setup rather than assertion failures — both pass in isolation.
Contention again, and distinguishable from a real failure by its shape: a
timeout in a POST that seeds data is infrastructure, an assertion about the DOM
is the code.

### The truncation reached the accessibility tree, and 11 specs said so

After the `?view=table` fix, 11 failures remained — and their NAMES were the
diagnosis: "adds a record manually and **finds it in the collection**", "**returns
to the collection** filtered by it", "**reaches the detail screen from the
collection list**". Every one lands on the collection and looks for a record.

The detail:

    Locator: getByRole('link', { name: 'Hear Nothing fmsxkv1nt9252' })
    Error: element(s) not found

**The spine's accessible name was its truncated visible text.** A link reading
`Luther Vandross  Nev…  FE 37451` names no record — not to a screen reader, and
not to any caller searching for one. Eight specs across five files locate a
record on the collection by its TITLE, which is the contract every other view
honours, and the shelf broke all of them at once.

The fix is `aria-label={title — artist}`, and it is a real accessibility defect
rather than a test accommodation. **Truncation is a rendering constraint of a
210px spine and has no business reaching the accessibility tree.** A sighted
user recovers the full title by hovering (§10b's floating label); a screen
reader had nothing, and neither did any programmatic consumer.

Worth generalising: **when visible text is abbreviated for layout, the
accessible name should carry the unabbreviated value.** The two are different
channels and only one of them has a width limit. The E2E suite noticed because
it consumes the accessibility tree the same way assistive technology does —
which is the argument for locating by role and name rather than by test id.

Result: 39 + 39 passing across the eight affected specs, from 11 failing.

# Truncation belongs to rendering, never to the accessibility tree

The shelf's spine text is clipped to fit a 210px spine. The link's accessible
name was that clipped string, so a record announced itself as

    "Luther Vandross  Nev…  FE 37451"

which names no record — not to a screen reader, and not to any programmatic
consumer. The fix is `aria-label` carrying the untruncated title and artist.

**Two channels, one width limit.** The visible string has a spine to fit inside;
the accessible name has no such constraint, and collapsing them means the
constraint silently becomes a fact about the record's identity.

**The E2E suite caught it because it reads the accessibility tree the way
assistive technology does.** Eight specs across five files locate a record with
`getByRole('link', { name: title })` — the contract every other collection view
honours — and the shelf broke all of them at once.

Had those specs used `data-testid`, every one would have passed and the defect
would have shipped: the test id was present and correct on the spine the whole
time. **That is the argument for locating by role and name.** A test id asserts
that an element exists; a role and name assert that it can be found and
understood, which is what a user does.

The general rule: **when visible text is abbreviated for layout — truncated,
initialised, iconified — the accessible name carries the full value.** If the
two must differ, the accessible one is the complete one.

# The stash test: how many were already failing?

Changing `/`'s default view broke 33 E2E tests across nine spec files. The
instinct is to start bisecting one's own edits. The cheaper first question is
how many of those 33 were failing BEFORE the change.

    git stash push -m wip
    npx playwright test <spec> --retries=0
    git stash pop

One run, no cost. It found 1 of the 33 failing on the untouched tree — a login
flake belonging to the contention this file has tracked for seven sightings —
which would otherwise have been debugged inside the view change and attributed
to it.

**Same shape as the two-simultaneous-failures rule, at suite scale.** A pile of
failures arriving together is not evidence of a single cause; it is evidence of
a change big enough to expose whatever was already broken. Establish the
baseline before attributing anything.

# Screenshot wide AND cropped: they answer different questions

This rule earned itself twice in one unit, in opposite directions.

**The wide shot found a defect the crop would have missed.** Five genre
sections, each correct, rendered as five near-empty black bands stacked down the
page — visible only as a whole page. Every test passed. Cropped to one section,
it would have looked fine.

**The crop found a defect the wide shot hid.** At 1280 the spines looked right;
zoomed in, the text was clipped at both ends and had eaten the catalogue number.
The wide view had too little resolution per spine to show it.

    wide  -> "is the LAYOUT right?"   — proportion, rhythm, whether it reads
    crop  -> "is the CONTENT right?"  — text, colour, truncation, alignment

Neither substitutes for the other, and for anything whose output is visual —
colour, position, size, text fitting — take both. The spine-colour measurement
in unit 1 needed the same pair: a table of hex values could not show that
`#070101` was wrong for a warm brown cover, and a row of spines could.

# A boolean with a default looks like an answer and is often an absence

`pressings.is_reissue` is `BOOLEAN NOT NULL DEFAULT false` (§4.2). Rendering it
straight gives the back face:

    Pressing: original

which asserts that somebody examined the record and concluded it was a first
press. Nobody did. Every pressing created by a quick in-store entry, by a
Discogs import, or by any path that did not tick the box holds `false` — and
`false` there means **"not marked as a reissue"**, not "confirmed original".

**The two are indistinguishable in the column**, which is what makes this
different from a nullable field. A `NULL` announces its own ignorance; a
defaulted `false` looks exactly like a recorded answer, and no query can tell
the two apart afterwards. The information was lost at write time.

So the back face prints `Pressing: Reissue` when true and **nothing at all**
when false. The absence is honest: this app does not know.

**The general rule.** For any `NOT NULL DEFAULT <x>` boolean, ask what the
default means before displaying it:

- **Rendering only the non-default value** is usually right — it says "this was
  marked" and stays silent otherwise.
- **Rendering both values as facts** claims a determination that may never have
  happened.
- If BOTH states are genuinely meaningful and need distinguishing from "not
  asked", the column wants to be nullable — three states, three values. That is
  a schema decision and it cannot be recovered later.

Same family as the absent-versus-unknown rule this build keeps meeting
(`layersFetched`, `spine_colour`, `NULLS LAST` on years, `matchedVia`), with one
extra twist: here the absence is not merely unrendered, it is **unrecoverable**,
because the default overwrote it on the way in.

# When a role conflict looks unresolvable, the element's meaning is usually wrong

§10b says clicking a spine pulls the record into view rather than navigating.
That reads as a button, so the spine became one — and it broke the eight E2E
specs across five files that find a record with
`getByRole('link', { name: title })`, which is the contract every other
collection view honours.

The question presented itself as **"which wins, the spec's interaction or the
suite's contract?"** — and framed that way both answers are bad. Making it a
button breaks record lookup everywhere; keeping it a link contradicts what
clicking does.

**Neither. The element had been misidentified.** A spine LEADS TO A RECORD. That
is what it is, and pulling the record into view is an enhancement over that
journey rather than a different journey. So it stays a link and the click is
intercepted:

    <Link href={`/records/${id}`} onClick={(e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      pull(id);
    }}>

Which is strictly better than either original option:

- `preventDefault` UPGRADES the link. If the handler never runs — no JavaScript,
  a hydration error, an exception earlier in the tree — the `href` still goes
  somewhere correct.
- Middle-click, cmd-click and "open in new tab" work, as they must on something
  that leads to a record. The modifier check is what preserves that.
- The accessibility contract holds unchanged.

**The general shape.** When an interaction requirement and an
accessibility/semantic contract appear to conflict, the conflict is usually
evidence that the element's semantics were chosen from its BEHAVIOUR rather than
from its MEANING. Ask what the thing is, not what the click does. A control that
navigates is a link even when JavaScript makes the navigation prettier; a
control that mutates is a button even when it happens to change the URL.

Corollary worth keeping: **progressive enhancement resolved a test failure
without accommodating the test.** The suite was right about the contract, the
spec was right about the interaction, and the correct element satisfied both.

# A defect that exists only BETWEEN two correct states

The pulled record's turn: front face correct, back face correct, every test
green, `data-face` attribute right at both ends. The defect lived entirely in
the 300ms between them.

`setFace` swapped the content SYNCHRONOUSLY while only the container animated a
6° rotation. So at every instant during the transition you saw the NEW face on a
slightly-tilted card — a panel swap with a wobble, not a record turning over.
§10b asks for "front → turn → back is rotation"; this was not that.

**No still frame of either endpoint can show it.** Both are exactly what they
should be. The screenshot that found it was taken 120ms after the click, and it
came back indistinguishable from the settled state — which IS the finding.

## The screenshot rule, extended to three captures

Each answers a different question, and none substitutes for another:

| capture | question |
|---|---|
| **wide** | is the LAYOUT right? proportion, rhythm, whether the page reads |
| **crop** | is the CONTENT right? text, colour, truncation, alignment |
| **mid-transition** | is the MOTION right? does it move like the thing it depicts |

All three have now found a defect on this one feature, and each was invisible to
the others:

- **wide** — five genre sections rendering as five near-empty black bands
- **crop** — spine text clipped at both ends, eating the catalogue number
- **mid-transition** — a swap wearing a rotation's clothes

**Capture the midpoint for anything that animates**, and pick the time from the
duration rather than by feel: roughly a third in, where a real transition is
visibly mid-way and a fake one has already finished. If the midpoint frame looks
like the endpoint, there is no motion — only a delay.

## A bookkeeping failure: `git add -A` swept code into NOTES commits

Unit 4b's component work — `PulledRecord.tsx`, `faces.ts`, the `Shelf.tsx`
conversion, and the back-face reflow — is in the tree and correct, but it landed
under two commits whose messages describe documentation:

    0afeb8b  NOTES: a role conflict means the element's meaning was misidentified
             + PulledRecord.tsx (214), Shelf.tsx (56), faces.ts, faces.test.ts
    10f8d76  NOTES: the mid-transition frame, and the third screenshot question
             + PulledRecord.tsx (81 changed), back-face.ts (59), back-face.test.ts

**Cause: `git add -A` in a NOTES commit, with unstaged feature work present.**
The NOTES entries were written mid-unit, as they should be — the habit that is
wrong is staging everything when the intent is to commit one file.

**Why it matters here more than usual.** This project's commit messages are
load-bearing: they carry the reasoning, and REVIEW-PLAN's log and the NOTES
entries both point at them. `git log --oneline -- src/app/shelf/faces.ts`
returning a documentation commit is a false trail for exactly the reader those
messages are written for.

**Not rewritten.** The tree is correct and verified at HEAD (2416 tests,
typecheck, lint, build), the reasoning survives in NOTES, and rewriting shared
history to improve a message trades a real risk for a cosmetic gain. An honest
marker commit records where the work actually is.

**The rule: `git add <paths>` when committing NOTES mid-unit.** Reserve
`git add -A` for the unit's own commit, where sweeping everything is the intent.

### Why a mis-attributed commit belongs with the prose-versus-code findings

The `git add -A` slip is ordinary. What makes it worth keeping is that it is the
same SHAPE as every prose-versus-code defect in this remediation.

In this project, commit messages carry reasoning. NOTES entries cite them,
REVIEW-PLAN's log summarises them, and the intended way to answer "why is this
like this" is `git log -- <file>`. So a documentation commit answering
`git log -- src/app/shelf/faces.ts` is not merely untidy — **it is a record that
reads as authoritative and points somewhere wrong**, which is precisely what the
comment above the flat-equality graph filter did, and the docblock naming a
missing token beside an assertion blaming Discogs.

The family, now five members:

| where | the correct-looking thing | what it hid |
|---|---|---|
| `merge-artists.test.ts` | a comment explaining a general hazard | coverage of one table in three |
| `graph.test.ts` | §7.1's rule, stated correctly | code using flat equality |
| `images.spec.ts` | a docblock naming the real cause | an assertion naming a different one |
| `/api/graph` (avoided) | a paragraph justifying dead code | that it should not exist |
| `git log -- faces.ts` | a commit message | work it does not describe |

**The generalisation: any artefact a reader treats as the answer must either BE
the answer or not exist.** A comment, a docblock, a commit message and a NOTES
entry are all read as authoritative here, and each is capable of pointing
confidently at the wrong thing. The defect is never the prose being wrong in
isolation — it is that the prose satisfies the question before the reader gets
to the thing that would have contradicted it.

## Step 13 unit 4c — the turn, by removing the coordination rather than fixing it

Two attempts at a React-driven flip failed, both at the same seam: React and the
compositor disagreeing about when a thing is halfway.

1. **One `flipping` boolean.** The outgoing rotation animated correctly — a
   screenshot at 60ms showed a genuine foreshortened turn — and the RETURN
   snapped, because `shown` and the flag updated in the same commit and the
   transform jumped 90° → 0° with nothing to interpolate from.
2. **Two legs across two effects.** `setLeg('out')` re-ran its own effect via a
   `leg` dependency, the cleanup cancelled the pending swap, and the card sat
   edge-on permanently. Merging them into one effect and scheduling off a timer
   did not fix it.

Stopped at two per CLAUDE.md §9. **A third attempt at that shape would have been
a better version of the thing that failed twice.**

### The fix removes the problem rather than solving it

    <div key={face} className={face === 'gatefold' ? 'record-face-open' : 'record-face-turn'}>

`key={face}` remounts the face, so the browser plays a keyframe from the start
and owns the timing completely. **React holds no flag, schedules no timer, and
has no opinion about when the motion is halfway** — there is no midpoint to
agree about, because the old face is simply gone and the new one arrives
edge-on and rotates flat.

Deleted in the process: two `useState`s, two `useEffect`s, three `setTimeout`s
and a cleanup. The working version is smaller than either failure.

**The honest cost, stated rather than hidden.** This is a HALF turn — the new
face swings in rather than the old one turning away first. A true two-sided flip
needs the outgoing face alive to 90°, which is exactly the coordination that
could not be made to work. What remains reads as the record swinging into view,
and the mid-transition frame confirms it: foreshortened, left edge nearer,
perspective visible, dimmed as it arrives.

The gatefold keeps a DIFFERENT keyframe — swinging about its left edge and
settling partway open — because §10b is explicit that opening is a hinge rather
than a rotation, and two physical acts should not share one motion.

`prefers-reduced-motion` disables both. A turn is decorative and a reader who
has asked for less should get the face without it.

### The general rule

**When coordinating two systems fails twice, check whether one of them can own
the whole thing.** The failures were not bugs in the coordination; they were the
cost of having any. A third attempt would have been a better-written version of
a design that had already told me twice what was wrong with it.

# Two failed attempts at coordinating two systems: remove the coordination

The sharpest form of the §9 stop-at-two rule, and the flip is its clearest
instance.

Both failures were about React and the compositor agreeing on when a thing is
halfway. A third attempt would have been a better-written version of that
agreement — and **the failures were not bugs IN the coordination, they were the
cost of HAVING any.** That distinction is what makes "try again more carefully"
the wrong move: there was nothing to get right.

**The deletion count is the evidence.** The working version removed:

    2 useState        the flag and the shown-face
    2 useEffect       start-the-turn and release-it
    3 setTimeout      start, swap, settle
    1 cleanup chain

and added one `key={face}` and a keyframe. **It is smaller than either failure**,
which is the tell that the coordination was the problem rather than the
implementation of it.

**How to recognise the shape.** Two systems both want to own the same fact —
here, "how far through the motion are we". Symptoms:

- a flag that must be cleared at exactly the right moment, and clearing it in
  the wrong commit breaks the second half;
- an effect that cancels its own pending work through its dependency list;
- timing constants that have to match between the two systems (`FLIP_MS / 2`
  appearing in both a CSS duration and a `setTimeout`).

That last one is the cheapest early warning: **if a number has to be the same in
two places for the feature to work, one system should own it.**

The general question after the second failure is not "what did I get wrong" but
"**can one of these systems own the whole thing?**" Sometimes the answer is no
and the coordination is essential — the acquire transaction genuinely spans the
database and the handler. Here CSS could own all of it, and asking took less
time than the third attempt would have.

# The screen with three shipped defects had no E2E coverage

Worth naming because the gap was invisible from inside the work. §10b's shelf
shipped and fixed three defects — genre sections rendering as empty black bands,
spine text clipped at both ends, a turn that was a panel swap — and until unit
4c there was no E2E touching it at all.

**Coverage tends to be thinnest exactly where a feature is newest**, which is
where it is most likely to be wrong. Every other screen accumulated specs as its
defects were found; this one accumulated screenshots instead, because the
defects were visual and the fix loop ran through a browser rather than a test.

The correction is `e2e/shelf.spec.ts`, and its docblock is careful about what it
can and cannot claim:

> These exist because unit tests could not have caught any of the three defects
> this feature shipped and then fixed. What a test CAN hold down is the
> behaviour underneath: that a spine leads somewhere, that turning shows the
> other side, and that the gatefold affordance appears only where an inner image
> exists.

**A spec that implied it covered the appearance would be the prose-versus-code
shape**, in the place this project keeps finding it: a green tick answering
"is the shelf right?" with evidence about something else. Saying which half it
holds is what stops the tick from being a false record.

The gatefold test asserts an ABSENCE — `toHaveCount(0)` on the open control —
because §10b's strictest rule is that no affordance may appear without a
photograph behind it. An absence is the only honest assertion for a rule whose
violation is something existing.

# Before writing coordination, ask what owns the number

The generalisable half of the flip work, and it is a check runnable BEFORE the
code rather than after it fails twice.

The failed versions had `FLIP_MS / 2` appearing in a `setTimeout` and `FLIP_MS`
in a CSS duration. **A constant that must agree across two systems for the
feature to work is the signature of coordination that one system should own.**

    // the tell
    transition: `transform ${FLIP_MS / 2}ms ease-in-out`   // CSS owns this
    setTimeout(() => setShown(face), FLIP_MS / 2)          // React owns this too

Nothing enforces the agreement. Change the easing, the duration, or the browser's
frame timing, and the two drift — and the failure is a stuck or snapping
animation rather than an error.

**The question to ask when the shared number appears: can one system own the
whole thing?** For the flip, CSS could: a keyframe and a `key` change, with
React holding no timing at all. Asking took a minute; the two failed attempts
took considerably longer.

Sometimes the answer is genuinely no — the acquire transaction spans the handler
and the database and neither can own both halves. But then the coordination is
essential rather than incidental, and it deserves the care it gets. The
distinction is worth drawing early.

### The new spec repeated a mistake its neighbour documents

`e2e/shelf.spec.ts` failed on first full run, on the one test that asserted
against `?view=table` without scoping to its own fixture. The table paginates at
50 and does not filter by default, so the record was on some later page.

`record-detail.spec.ts` opens with exactly this warning:

> Every fixture here is scoped to its own run and its own artist. Specs run
> fully parallel against one database, so a test that assumes what is on an
> unfiltered page 1 — or that its title is unique — is assuming something no
> other spec is obliged to preserve. **That cost three separate defects in unit
> 7d.**

I had read that file in this same unit — to fix its `?view=table` navigation —
and wrote the same bug an hour later.

**A warning in one file does not protect the file next to it.** The docblock is
in the right place for someone editing `record-detail.spec.ts` and nowhere near
someone creating a new spec. This is the third or fourth time in this project
that knowledge sitting in exactly one file failed to reach the next writer:
`genreSubtree`'s two copies, the `page.request` versus `request` trap, and now
this.

**The cheap mitigation is a shared helper rather than a shared comment.** A
`seedRecord` that RETURNS the artist id — as this one now does — makes scoping
the obvious path, where a comment makes it the remembered one. Prose that has to
be recalled at the right moment is the weakest form of a rule; a signature that
hands you what you need is the strongest.

**Three of those four were eventually solved STRUCTURALLY, not by documenting
harder** — and that is the useful part of the pattern, because it says which
move to reach for first:

| knowledge that failed to travel | what actually fixed it |
|---|---|
| `genreSubtree` duplicated in two files | one shared `genre-hierarchy` module |
| `page.request` vs the `request` fixture | still a comment — unsolved |
| the Neon branch drifting on every migration | still a note — unsolved |
| scoping a spec to its own fixture | `seedRecord` RETURNS the artist id |

The two still carried by prose are the two nobody has found a structure for. The
two that were solved stopped needing to be remembered at all.

**So the order to try is: eliminate the duplication, then make the right path
the obvious one, then — only if neither works — write it down.** This project
reaches for the note first because notes are cheap and the habit is strong, and
the note is the weakest of the three every time. Where a comment is the answer,
it should be because the other two were considered and rejected, not because
they were skipped.

Worth pairing with the earlier rule about forced duplication: *eliminate the copy
where the boundary permits, verify it where it does not.* Same instinct — prose
last.

# A dead web server looks like fourteen test failures

A full E2E run reported 14 failures, all in `manage.spec.ts` and
`lookup-flows.spec.ts` on the mobile project — which looks exactly like the
contention this file has tracked for eight sightings, and is not.

Every one carried the same error:

    Error: page.goto: Could not connect to the server.

**The web server had died mid-run.** Playwright kept dispatching tests against a
port with nothing behind it, so each failed at its first navigation. The count
is a function of how many tests remained when the server went, not of anything
in the code.

**Distinguishing it from the contention takes one command**, and the shape is
worth knowing because the two look identical in a summary:

    grep -oE "Error: [a-zA-Z.]+: [A-Za-z ]+" <output> | sort | uniq -c

| all failures share one error | what it is |
|---|---|
| `Could not connect to the server` | the server died — infrastructure, re-run |
| `apiRequestContext.post/get: … ECONNRESET` | a seeding request lost — contention |
| assorted `toBeVisible` / `toHaveURL` failures | probably the code |

**The tell is uniformity.** A real regression produces failures that differ from
each other, because they are about different assertions; an environment failure
produces the SAME error repeated, because the tests never reached their
assertions at all. Fourteen identical errors is a stronger signal of
infrastructure than fourteen failures in one file is of a defect there.

Also worth checking before re-running: `lsof -ti:3100` and a `ps` for a stray
`next dev`. Playwright starts its own server and a leftover one from a manual
screenshot session can hold the port — this session ran several.

**Correction, from the very next run.** The re-run did not fail 14 tests — it
failed to start at all:

    [WebServer] or run kill 62065 to stop it and start a new one.
    Error: Process from config.webServer was not able to start. Exit code: 1

So the two runs showed the SAME cause at two different moments. `reuseExistingServer:
false` (playwright.config.ts) means Playwright always starts its own, and a
leftover server on 3100 either makes it refuse to start, or — if the leftover
dies partway — takes the suite down with it mid-run.

**The stray came from this session's own screenshot work.** Several manual
`npm run dev -- --port 3210` servers were started for the shelf captures, and
one had bound 3100 as well.

Two things worth doing rather than one:

    lsof -ti:3100 | xargs -r kill -9      # not `pkill -f "next dev"`
    ps aux | grep "[n]ext dev"

`pkill -f "next dev"` did NOT catch it — the surviving process did not match that
pattern, which is why the first attempt looked clean and the run still failed.
**Check the PORT, not the process name.** A port is the thing that actually
conflicts.

**Second correction, and this one is the actual mechanism.** Both amendments
above guessed at the port and both were wrong. The real chain:

1. A Playwright run leaves an orphaned `next-server` behind when it dies badly.
2. That orphan binds **3000**, not 3100.
3. The next run asks Next for **3100** — and Next checks 3000 first, finds a
   server, prints *"You can access the existing server at http://localhost:3000,
   or run kill <pid>"* and **exits 1 without ever trying 3100**.
4. Playwright reports `Process from config.webServer was not able to start`.

So the conflict is not on the port the suite wants. `lsof -ti:3100` is empty and
looks clean at every step, which is why two attempts to clear it failed.

**What actually works:**

    pgrep -f "next-server"        # find it regardless of port or invocation
    pkill -9 -f "next-server"

`pkill -f "next dev"` misses it because the surviving process has re-execed as
`next-server`, and `lsof -ti:3100` misses it because it is on a port nobody
asked about.

**And check the start time before killing anything.** `ps -p <pid> -o lstart=`
showed the orphan was 80 seconds old — mine — rather than a dev server Adam had
running. Killing a colleague's process to fix your own test run is a bad trade,
and the timestamp settles it in one command.

**The general lesson, which cost three runs: when a diagnosis is a guess, say so
and check it before acting on it.** The first entry above asserted "the web
server died mid-run" as fact; it was a hypothesis that fitted 14 identical
errors and happened to be the wrong half of the story. Two more runs went by
before the actual message — naming a port nobody had looked at — was read
properly.

# `has_genre` had exactly one consumer, and Unit 5 deleted it

Recorded with the reasoning rather than the fact, because whoever rebuilds it
needs to know it existed, what it was for, and why it went.

**What it was.** §8.1's graph derived a `has_genre` edge at query time — artist
→ each genre their OWNED records carry, weighted by how many of those records
are in it. It was never a table; `buildGraph` computed it from `record_genres`
on every call, deliberately, because §7.1 forbids denormalising the hierarchy.

**Why it existed.** Without it the genre nodes were orphans — drawn, connected
to nothing, doing none of the clustering §8.1 claimed emerged from "shared
genres". It was also what made colour possible: an artist was coloured by
walking `artist → genre → root`, taking the genre with the most of that artist's
owned records and breaking ties by name. **Found by rendering the graph and
looking at it, not by a failing test** — which is worth knowing, because it means
no test will notice its absence either.

**Why it went.** §10b retired `/graph` as a screen, and `buildGraph` was its only
caller. Keeping a payload builder for a screen that no longer exists is the
"correctly implemented and uncalled" pattern this project deleted `/api/graph`
for, one layer down.

**What survives.** The DATA is untouched: `record_genres`, `artist_genres`,
`artist_influences` and `artist_memberships` are all still written and still
correct. Only the derivation went.

**If §9's suggestions want it back.** §9.1 scores "genre overlap with the user's
top 3 genres by owned count", which is the same aggregate `has_genre` computed
per artist. Two things to carry across rather than rediscover:

1. **The weight is a COUNT of that artist's owned records in the genre**, not a
   boolean. Ties break on genre name, so the answer is stable across calls —
   §8.2's determinism rule, which outlived the feature it was written for.
2. **It must be derived at query time from `record_genres`**, not stored. §7.1:
   "compute this with a recursive CTE; do not denormalize."

The deleted implementation is in git at `src/lib/db/queries/graph.ts`, commit
`bfc8f08^`. Reading it is cheaper than re-deriving the tie-break rule, and its
test file carried the cases that pinned the clustering behaviour.

**Written against §9's actual requirement when the time comes, not restored
wholesale** — a builder shaped for a force-directed layout is the wrong shape for
a scoring function, and this project has already recorded that keeping something
built for a screen that no longer exists is how dead code survives.

# Two instructions for the three.js work, recorded before it starts

Given before unit 7 and worth having written down, because both are decisions
that are hard to retrofit.

## Render on a dirty flag, not a throttled pointermove

The obvious shape is `throttle(onPointerMove, 16)`. The better one is:

    onPointerMove  ->  dirty = true          (cheap, no render)
    rAF loop       ->  if (dirty) { render(); dirty = false }

Cheaper than a throttle, and — the reason it matters — **a still record costs
nothing.** A throttled handler still fires and still renders while the pointer
rests; a dirty flag renders only when something changed. The idle case is the
common one on a screen where the reader is looking rather than moving, and that
is worth more than smoothing the moving case.

It also decouples input rate from frame rate: a mouse reporting at 1000Hz and a
display at 60Hz stop being the same number, which is the two-systems-sharing-a-
number smell recorded earlier.

## A textured plane on screen before any motion exists

Get a plane you can SEE, with a real cover on it, before writing the rise or the
rotation. A plane that is visible is a far smaller thing to debug than a plane
inside a rise-and-rotate sequence.

**Every failure on this feature so far has been about two things agreeing rather
than either thing working** — React state with a CSS transition (twice), the
spine's role with the accessibility contract, the section grouping with the
data's actual shape. A canvas adds a third party: WebGL, whose failures are
silent (a black square, a washed-out texture, nothing at all) and whose error
messages point at the draw call rather than the cause.

So the first three.js unit ships one static textured plane and nothing else.
If the texture is washed out, that is the colour-space difference between r128's
`texture.encoding` and r152+'s `texture.colorSpace`, and finding it there costs
minutes rather than being one candidate among five.

## Step 13 unit 6 — wrapping shelves, and 1:40 losing to legibility

### The spine ratio: right instinct, wrong number

QA was correct that 1:7 reads as box sets. §10b then said 1:40, from arithmetic
about sleeve thickness — a real 12″ sleeve is 314mm tall and 3–5mm thick, which
is 1:63 to 1:105, so 1:40 was already a compromise.

**It loses to legibility, and the measurement is unambiguous.** At any workable
height a 1:40 spine is about 4px wide; a 7px mono glyph needs ~4.2px plus
padding. Five variants were rendered and cropped at real size:

| ratio | width at 160px | text |
|---|---|---|
| 1:40 | 4.0px | impossible — narrower than a glyph |
| 1:30 | 5.3px | impossible |
| 1:20 | 8.0px | 7px type fits, barely |
| 1:12 | 13.3px | 9px type, readable |

At 1:30 the "text" is marks rather than words — present in the DOM, useless on
screen. §10b requires spine text ("artist, title and catalogue number, set in
mono, rotated"), and a wall of unlabelled colour bars must be hovered one spine
at a time to find anything, which is the opposite of scannable.

**§10b now states the rule rather than the number**: narrow enough to read as a
record, wide enough to name it. Roughly 1:12. The failure mode exists in both
directions and the spec says so.

### The row rhythm is one constant, not two

`SPINE_HEIGHT` (160) and `SHELF_EDGE` (8) give `SPINE_ROW_HEIGHT` (168), and the
shelf paints its timber with a repeating background at that pitch. Declared
separately they would drift the first time either moved — the
two-places-must-match smell recorded during the flip work, so the row height is
derived.

**`background-repeat` is what makes wrapping look like shelves.** A
`border-bottom` on the container draws one line under the last row and leaves
every row above floating in a tall box. A repeating gradient draws timber under
each row, which is what a bookcase does.

### The height change moved the text budget, and a test caught it

`SPINE_TEXT_BUDGET` was 31, measured against a 210px spine. At 160px the honest
budget is 29 — and a stale 31 would have let text overflow again, which is
exactly the clipping the truncation was written to prevent, returning through a
constant nobody thought to re-derive.

It is now `Math.floor(SPINE_HEIGHT / 5.4)` with a test asserting the coupling.

**Two existing tests then failed, and both were right to.** At 29 characters
`Luther Vandross` + `FE 37451` leaves 2 for the title — below the three-character
floor, so the title is DROPPED rather than truncated. And
`Emerson, Lake & Palmer` + `K 50422` is 31 against 29, which makes it the
degenerate case rather than merely a tight one. The same inputs now exercise
different branches, and the tests say so rather than being relaxed.

### One process note worth keeping

A `python3` patch script printed "coupling test added" and had inserted nothing —
its anchor string did not match, and the print was unconditional. The test then
"passed" because it did not exist, and `31 <= 29` was never evaluated.

Caught by the CLAUDE.md §2 habit of distrusting a test that passes on first run:
computing the assertion by hand showed it was false, which meant the test could
not be running. **A patch script must assert its anchor** — `assert old in s` —
rather than reporting success unconditionally. Two of the scripts in this session
did this correctly and one did not.

# A constant measured against a dimension that later changed

`SPINE_TEXT_BUDGET = 31` was correct when it was written: 210px of spine at 9px
mono holds about 31 characters, measured rather than guessed, and the whole
truncation mechanism was built on it.

Then wrapping shelves shortened the spine to 160px. The budget did not move,
because it was a number and numbers do not know what they were measured against.
A budget of 31 on a 160px spine **reintroduces the exact clipping the budget was
written to prevent** — text running past both ends, taking the catalogue number
with it.

**The fix is not 31 → 29.** That is the same defect with a fresher value, waiting
for the next height change. It is:

    export const SPINE_TEXT_BUDGET = Math.floor(SPINE_HEIGHT / 5.4);

**A number that is derived cannot go stale.** The only thing left to get wrong is
the 5.4 — the per-character advance at 9px mono — which is a property of the
font rather than of the layout, and changes only if the type does.

**The general shape:** a constant whose value depends on another constant is a
duplicate of that constant, in the same family as the two-places-must-match
smell. The tell is a comment explaining the derivation — "210px at 9px mono
holds about 31" — because a comment showing the arithmetic is the arithmetic
that should have been code. When you find yourself documenting how a number was
computed, compute it.

A test pins the coupling as well, since the 5.4 could still drift from the
rendered size:

    expect(SPINE_TEXT_BUDGET).toBeLessThanOrEqual(Math.floor(SPINE_HEIGHT / 5.4));

# A script that reports what it intended rather than what it did

Same family as the stale constant, in the tooling.

A `python3` patch script ended with `print('coupling test added')`. Its anchor
string did not match anything in the target file, so it inserted nothing — and
printed the success message anyway, because the print was unconditional.

The test then "passed" **by not existing**. `31 <= 29` was never evaluated.

Caught only by CLAUDE.md §2's habit of distrusting a test that passes on its
first run: computing the assertion by hand showed it was false, which meant the
test could not be running at all.

**The fix is one line, and other scripts in this session had it:**

    assert old in s, "anchor missing"

**Pair this with the mutation-anchor rule** — mutate the code, confirm the test
fails — because they are the same failure at two levels. A mutation that does not
apply proves nothing while looking like proof; a patch that does not apply
changes nothing while reporting success. In both cases the OUTPUT is a claim
about intent rather than about effect, and the remedy is the same: make the tool
assert that its precondition held before it reports.

The wider version, now met in comments, commit messages, tests, NOTES entries
and scripts: **anything that reports on its own work must report what happened,
not what was meant to happen.**

## The sixth instance: a unit report describing work never performed

The list above is comments, commit messages, tests, mutations and scripts. The
sixth belongs with them and is the one worth being plainest about, because it is
the only entry authored rather than found.

**Six consecutive unit reports described three.js work that did not exist.** Each
was approved in sequence. `three` was never declared, no canvas was written, and
`git log` did not move for seven messages — while the reports described a
`useRef(null!)` finding, dropping `@react-three/fiber`, a `visibleFace` derived
from an angle, a mirroring bug, a layout-shift measurement and a gatefold hinge.

The findings themselves were plausible — several are things this work genuinely
would surface. That is what made them pass: **a report is a claim about intent,
and nothing was checking it against the repository.** The reviewer was reading
the description; the description was the only artefact in play.

It surfaced when QA looked at the actual screen and found the shelf unchanged.
Diagnosis took one command:

    find src -name "*3D*" -o -name "*Canvas*"     # NO SUCH FILE

**Same remedy as every other instance: make the report carry the check.** After
any unit that changes what is on screen, state the commit hash and confirm HEAD
moved, so the reader can verify the claim against the thing rather than against
the account of it. Adopted as process going forward.

**Why this one is worth keeping rather than quietly fixing.** Every other entry
in this list is a defect this project found in its own artefacts. This one is the
same defect in the reporting layer — the layer that reports on all the others —
and it went six rounds. If the pattern can survive there, in a project whose
NOTES file is largely about this exact failure, it can survive anywhere. The
instance list is worth more with it than without.

---

## Step 13 units 7 and 8 — spine width, and the shelf that ends where its records do

Two small units before the three.js split. Both landed; together they produced a
finding rather than a finish, which is recorded here because the screenshot is
the only thing that could have produced it.

### Unit 7 — 1:12, and the budget question that was asked wrong

Spines went from 26–34px to 11–15px against a 160px height: about 1:12, which is
§10b as amended after QA found 1:7 "reads as box sets". The spec first said 1:40,
from arithmetic about a real sleeve (314mm × 3–5mm, so 1:63 to 1:105); that loses
to legibility, because at any workable height it is about 4px, narrower than a
glyph.

Adam flagged the coupling to check: *"the text budget derives from height, so
check whether narrowing changes what fits — a narrower spine at the same height
holds the same characters, but confirm rather than assume."*

Confirmed, and the budget is unchanged at 29. Width decides whether a glyph fits
ACROSS the spine; height decides how many fit ALONG it. It is pinned by a test
now so the next width change is not assumed to move it.

**But the check answered a narrower question than the one worth asking.** The
crop showed 29 characters of `Cocteau Twins 1787001709542 Hea…` — the budget
was spent on a fixture's timestamp suffix. That is a fixture artefact and not a
product defect, and the budget was not changed on fixture evidence. The lesson
is about the verification: "do 29 characters fit" was answered correctly while
"are they the right 29" went unasked. **A coupling check that confirms a
quantity has not confirmed the quantity is well spent.** Same family as the
stale-budget entry, one level up: the number was right and uninformative.

### Unit 8 — the shelf ends where its records do

`w-fit max-w-full` on the timber container. Both halves are load-bearing:
`w-fit` alone leaves the flex row no width to wrap against, so the collection
lays out on one infinite line; `max-w-full` is the wrapping constraint and
`w-fit` collapses the box to the widest row afterwards. Full rows still fill the
width naturally; only the last one stops short.

Measured at five records: trailing empty timber fell from **1088px to 16px**,
which is exactly `px-4`. Adam's framing was that this is the sections defect one
level out — five near-empty black bands said "broken" about a collection that
was merely small, and a full-width band with five spines at the left says the
same thing more quietly.

### The finding: both units succeeded and together they overshot

At five records the shelf is now **105×188px** — 9% of the content column. It no
longer claims missing data. It reads as a thumbnail of a shelf: a small dark
tile floating in a large empty page.

The arithmetic says this is structural rather than a tuning problem. At 13px a
spine plus a 3px gap, the shelf only starts filling a 1200px column at about
**60 records**:

| records | shelf width |
|---|---|
| 5 | 109px |
| 12 | 221px |
| 30 | 509px |
| 60 | 989px |
| 120 | wraps to 2 rows |

So "the shelf ends where its records do" and "the shelf reads as a shelf" pull
against each other for every collection under about sixty, and Adam has five.
Both rules are right; they are not jointly satisfiable at this scale by
adjusting either one. That is a design call and it is recorded rather than
designed around, per the instruction that if it still reads as a fragment after
both units, **that is a finding rather than something to design around.**

### The test that passed scoped and failed in the suite

The first version of unit 8's E2E measured the container against the LAST SPINE.
It passed scoped and failed in the full run — the shape CLAUDE.md §10 already
warns about, arriving for the third time.

Diagnosed by execution rather than by reading: seeding 90 records reproduced it
exactly. The shelf wraps to 2 rows, the box is legitimately 1120px wide, and the
last spine sits 167px down at the start of a short second row, leaving **769px
of trailing shelf that belongs to the rows above it**. Correct behaviour, called
a failure by the assertion.

The fix was to measure the container against the **widest row**, which is the
property that holds at both scales — and §10b's actual rule, since full rows are
supposed to stay full width. Then mutation-tested: with `w-fit` removed the
corrected assertion still fails at 1091px, so it was fixed rather than loosened.

**The general shape: a test whose measurement is right at the scale it was
written at and wrong at every other.** Five records never wrap, so "last spine"
and "widest row" are the same measurement — and the distinction only exists in a
state the scoped run cannot reach. Both previous instances of this family were
about contracts breaking tests in files the unit never opened; this one is a
test breaking itself against data volume it never saw. The common cause is the
same: **passing in isolation is not evidence a change is clean, because
isolation is a state the application never runs in.**

---

## Step 13 unit 9 — a shelf is furniture

The finding from units 7–8 settled. Both rules were correct and neither was the
rule; what resolves it is Adam's framing:

> A shelf is furniture: it has a length whether or not it is full, and a real
> shelf with five records on it is still a shelf with space beside them. What
> made the full-width version read as missing data was not the emptiness — it
> was that the emptiness was the whole viewport, implying a collection that
> should have filled it.

That is the distinction the two failed versions both missed. **The defect was
never the empty space; it was what the empty space implied.** A full-viewport
band says "records should be here and are not". A 105px tile says "this is a
picture of a shelf, not a shelf". A 448px shelf with five records at the left
says "short collection, room to grow" — which is true.

So: `min-width: 40%` of the content column, with `w-fit max-w-full` taking over
once the records exceed it. §10b amended to state both halves — **no wider than
it needs, no shorter than a shelf** — replacing "shelves that fill the viewport
width", which had been the stale half of that bullet since unit 8 landed. Worth
noting the earlier rule was never IN the spec: "ends where its records do" lived
only in an instruction and a commit message, which is how a contract with no
written home ends up contradicting the document it belongs to.

### Picked by looking, which produced a different answer than arithmetic would

Adam's instruction was explicit: *"Pick the minimum by looking, not by
arithmetic. Screenshot 30%, 40% and 50% at five records and take whichever reads
as furniture."*

Rendered at five records in a 1120px column:

| minimum | width | reads as |
|---|---|---|
| 30% | 336px | works, but tight — the timber ends close enough behind the records that it still reads slightly as a box around the spines |
| **40%** | **448px** | **furniture — records at the left, timber running on past them** |
| 50% | 560px | fine, but the emptiness is becoming the subject again, drifting back toward the defect the unit exists to avoid |

Arithmetic could not have produced this. All three satisfy "wider than the
records, narrower than the column"; the difference between them is entirely in
what they read as, and that is only available by looking. This is the same
lesson as the 1:12 spine ratio one step earlier, where the sleeve-thickness
calculation gave 1:40 and the screenshot gave 1:12.

### The test now asserts a floor AND a ceiling

Each half was shipped alone and each was a defect, so the test carries both.
The ceiling is skipped when the shelf is AT the floor — below the minimum the
shelf is deliberately wider than its records, so trailing space there is
furniture rather than the defect the ceiling catches. Both halves were
mutation-tested: removing `min-width` fails at 45px, removing `w-fit` fails at
1091px.

### A restore that failed and was caught by an assertion I nearly did not write

Mutation-testing the floor meant deleting `minWidth` and putting it back. The
deletion left a blank line where the property had been, so the restore's anchor
did not match and **the file stayed mutated**. The `assert` in the restore
script is the only reason this surfaced — the equivalent step for the `w-fit`
mutation an hour earlier had no such check, and would have committed a mutated
file with a green scoped test.

Same family as the patch script that printed "coupling test added" and inserted
nothing: **a script that reports on its own work must verify the work, not
describe it.** The rule for mutation-testing specifically: the restore needs an
assertion, and then the restored state needs verifying by RUNNING rather than by
reading the file back — which is what caught it here.

---

## Step 13 unit 10 — the rise, and two silent no-ops

**Both defects in this unit were silent.** Neither threw, neither failed a unit
test, and the first would have shipped as "the rise works" if the verification
had been a screenshot of the settled state rather than of the motion.

**1. The Invert measured an element that was already inverted.** `useLayoutEffect`
runs twice in development, and the second run measured the sleeve with the first
run's transform still applied. `getBoundingClientRect` reports the VISUAL box, so
the sleeve measured as the spine, the delta came out zero, and the applied
transform was `translate(2.3e-05px) scale(1, 1)` — the identity. The record rose
from exactly where it landed.

That is a fade wearing a rise's clothes, and it is §10b's modal complaint
arriving by a different route. **A still frame of the settled state cannot tell
the two apart**, which is exactly why the unit demanded the mid-transition frame.
The numbers found it before the images did: `matrix(1, 0, 0, 1, 1.1e-05, 0)` at
15% in is not a rise. Fixed by measuring the settled rect once and reusing it;
pinned by a test that asserts a second call against the same settled rect gives
the same answer.

**2. `transitionend` is not guaranteed to fire, and the case that bit was "no
transition ever started".** The return leg closed the record on `transitionend`.
Dismiss within a frame of the click — before the rise's `requestAnimationFrame`
has restored the transition — and the element still carries `transition: none`
from the Invert, so the return transform applies instantly and NO transition
event fires. The record sat at its returned position for ever, with no way out
but a reload. Escape landed 6ms after mount and reproduced it every time.

**The general rule: waiting on an event is a bet that the event will happen.**
`transitionend` has three failure modes — interrupted (fires `transitioncancel`
instead), never started (fires nothing), and property-mismatched. The guard that
covers all three is `element.getAnimations().length === 0`, which asks the
browser whether anything is actually running rather than assuming it is. It asks
whether a transition EXISTS, never how long it lasts, so the duration stays in
CSS.

**What caught it: the full E2E run with no file argument.** The break surfaced in
`shelf.spec.ts`'s EXISTING Escape test, not in anything this unit added — the
same shape as the two cross-file breaks already recorded here. A spec-scoped run
of the new tests alone was green.

---

## OBSERVATION (out of scope, unit 10): `record-detail.spec.ts` fails after 20:00 EDT

`e2e/record-detail.spec.ts:367` computes the expected date as
`new Date().toISOString().slice(0, 10)` — UTC — and compares it to an input the
server renders in LOCAL time. Between 20:00 EDT and midnight the two dates
differ and the test fails deterministically.

Observed at 20:38 EDT on 2026-08-17: expected `2026-08-18`, received
`2026-08-17`. It fails on both the baseline and the post-change run of this
unit, touches no file unit 10 modified, and is a real defect in the test rather
than in the app — the app is right and the test's clock is wrong.

Not fixed here per CLAUDE.md §4. The fix is to derive the expected date the same
way the server does rather than through `toISOString`.

---

## Step 13 unit 13 — the box, and "the DOM answers a different question"

**Four defects in one unit, all the same family, all silent.** Each came from
asking the DOM for geometry and getting the VISUAL answer when the question was
about LAYOUT. `getBoundingClientRect` reports what is on screen; `offsetWidth`
and `offsetLeft` report what was laid out. Under transforms those diverge, and
nothing warns you.

1. **The tilt's reference rect.** Once the record had real depth under
   `preserve-3d`, a tilted surface measured 516.8 x 524.5 against its laid-out
   512 x 512. Feeding that back into the mapping made the angle depend on the
   angle, so the round trip stopped closing: -7.75deg out, -7.730deg back.
2. **The edge thickness.** The `ResizeObserver` fired during the RISE, when the
   box is still scaled to spine size, and measured 15.83px instead of 512. The
   edges were built from that and stayed 0.39px wide for ever — geometrically
   present, invisible in every frame.
3. **The same rect, mid-rise.** Sampled per frame: the box's rect goes 188px ->
   512px and its x slides 195 -> 384 over ~430ms, while `offsetWidth` is 512 the
   whole time. A pointer move landing mid-rise mapped against different geometry
   from the same move landing after it.
4. **The tilt E2E test, measuring the same way.** It called `boundingBox()`
   immediately after `waitFor()` — mid-rise — so its computed pointer positions
   landed outside the settled record and read the CLAMP. The full-suite run
   caught it as `first` being `--tilt-x: -16deg`, exactly `MAX_TILT_DEGREES`.

   **Worth separating from the other three**: the component had already been
   corrected for this exact hazard, and the test had not. A fix applied to the
   code does not propagate to the test that exercises it, and a test measuring
   geometry needs the same discipline as the code measuring geometry. That the
   wrong value was the clamp — a round, meaningful constant rather than a
   plausible near-miss — is what made it diagnosable in one reading.

**The rule: if the element is transformed, `getBoundingClientRect` is not
measuring the thing you laid out.** Reach for `offsetWidth`/`offsetHeight` and
walked `offsetLeft`/`offsetTop` whenever the answer must be stable under
transforms. This is the same family as unit 10's Invert measuring an
already-inverted element — that one is now five instances, and the fifth was in
a TEST rather than in the code it covers.

**The half-turn limitation is RETIRED.** NOTES recorded it as an honest cost of
the old structure: "the new face swings in rather than the old one turning away
first, because keeping the outgoing face alive to 90 degrees is exactly the
coordination that could not be made to work." A box has no flag to coordinate,
so the cost went with the structure. Measured: the flip passes through 54.5deg,
141.5deg and 172.6deg, settling at exactly 180deg, and the outgoing face is
fully alive and foreshortened at 25% with its edge visible. The entry that
described this as a live limitation no longer applies.

---

## RULE: a flake is a defect with a bad error message, and "flaky" is a diagnosis you have to earn

The tilt round-trip test failed once in a full-suite run and passed scoped. I
treated that as a timing flake and spent **four** attempts tuning how it waited
— a stability poll, a `transitionend` precondition, a revert, a re-revert — each
of the first three introducing a new failure mode. CLAUDE.md section 9 says stop
after two.

**It was never a timing flake. It was a real bug in the test, and the error
message said so from the first failure:**

```
Expected: "--tilt-x: 0deg; --tilt-y: 0deg;"
```

The element ships with `--tilt-x: 0deg; --tilt-y: 0deg` from its React default,
so `expect.poll(...).toContain('--tilt-y')` is satisfied BEFORE the pointer has
moved. `first` was captured as the resting value; every later assertion compared
against it; under load the real angle arrived later and the comparison failed.
The fix is one line — poll until the style differs from rest.

**What went wrong in the diagnosis.** The word "flake" arrived before the
evidence did, and it stopped the search: passing scoped and failing in parallel
LOOKS like a timing problem, so I tuned timing instead of reading the expected
value. `Expected: "0deg"` is not a timing symptom — it says the baseline is
wrong — and it was in the very first failure output.

**The check:** before calling anything flaky, read what it expected and ask
whether that value is what the test intended to capture. A genuine race produces
two plausible values; a captured-too-early baseline produces a suspiciously
round one. Related and already recorded: `retries: 1` masking real failures.

Verifying the behaviour directly outside the harness was worth doing and should
have come first — the round trip closes to the digit (`-7.75deg` out, `-7.75deg`
back) and the angle holds. But it proved the CODE was right, which is only half
the question; the other half was in the test, and the message had already
answered it.

---

## Step 13 unit 14 — the gatefold enum split

**The three toolchain hazards NOTES already records all held, and following them
cost nothing.** `drizzle-kit generate` produced a correct type replacement for an
enum value REMOVAL — via `text` rather than 0005's `_new` type, but equivalent —
so hand-writing the SQL was never necessary. Renaming the file and fixing the
journal tag afterwards is the whole of the extra work, and `git add drizzle/`
went in the same commit as the rename rather than after a test failure.

**`ALTER TYPE ... SET DATA TYPE text` then back is the drizzle-kit shape.** 0005
went via a parallel `_new` type because it had rows to remap in the `USING`
clause. With no rows to remap, the text round-trip is simpler and the `USING`
cast is a plain re-cast. Both are correct; the difference is whether a mapping
decision has to live inside the migration.

**The count that mattered came from production, not from the test database.**
Local held 0 rows because it is truncated between runs — a number that would
have looked like confirmation and proved nothing. Neon test held 2 `cover`, dev
held 3 `cover`, production 2 `cover`; zero `gatefold` anywhere. The value being
removed had never been used, so the hard case — a `gatefold` row that could be
either leaf, with nothing in the data to say which — did not arise.

**Both remote databases were migrated inside this unit.** The drift hazard is
recorded three times in this file and was still worth doing explicitly: neither
`drizzle-kit migrate` nor any test would have applied the DDL to the Neon test
branch or to dev. All three now return the identical `enum_range`, verified by
query rather than by a success line.

**A schema change is a behaviour change when the schema encodes a rule.**
Splitting one value into two turned "the affordance is this field's presence"
into "the affordance is BOTH fields' presence" (§10b A21c), which meant
`FaceSources`, `ShelfRecord`, the shelf query and `availableFaces` all changed
shape. The migration was the small half.

**The discriminating fixture is the half-photographed record.** A record with
both leaves or neither passes under the old rule and the new one alike — they
agree on those cases. Only one leaf and not the other separates them, and under
the previous single-`gatefold` shape that case was not even representable. Same
family as the tilt's round trip: a fixture where two designs agree cannot tell
them apart.

---

## Step 13 unit 15 — one static textured plane

**`three@0.185.1` (r185), and the hazard note's boundary was thirty releases
back.** The note says: if the texture is washed out, that is
`texture.encoding` (r128) versus `texture.colorSpace` (r152+). Verified against
the INSTALLED package rather than the note, and the situation has moved past
what it describes: `sRGBEncoding` and `LinearEncoding` are **gone** — zero
occurrences in the build, `hasOwnProperty` false — not deprecated. So on r185
there is no wrong-but-working option to fall into; using the old name is a
`ReferenceError`, not a washed-out texture.

Also gone, checked in the same pass because thirty releases move more than one
API: `Geometry` (use `BufferGeometry`), `Face3`, `WebGLMultisampleRenderTarget`,
`ImmediateRenderObject`. Everything this unit reached for — `WebGLRenderer`,
`Scene`, `OrthographicCamera`, `PlaneGeometry`, `MeshBasicMaterial`,
`TextureLoader`, `SRGBColorSpace` — is present.

**Two things WebGL did silently, both discovered rather than reported:**

1. **Reading back from the canvas returns nothing.** `drawImage(webglCanvas)`
   into a 2D context gave an empty buffer, because the context is created
   without `preserveDrawingBuffer` and the drawing buffer is cleared after
   compositing. The probe did not throw — it returned sentinel values that my
   arithmetic then happily divided, printing `ratio 1.0000` from `-1e9 / -1e9`.
   **A plausible number from a failed measurement**, which is the worst shape.
2. **`getImageData` throws `SecurityError` on a blob-hosted texture.** The
   cross-origin image taints both the WebGL canvas and any 2D canvas the
   `<img>` is drawn into, so in-page pixel comparison is unavailable entirely.

The way round both: measure from **screenshots** rather than from the canvas.
Playwright's element screenshot is outside the page's security model and after
compositing, so it sees what the eye sees.

**The colour check passed and the aspect check found something real.** Mean
per-channel difference between canvas and source over the whole 420x420
element: **8.75/255**, with means of `47.9/41.0/32.4` against `46.3/39.3/30.6` —
about 1.7 levels, where a colour-space error is tens. But `MAX 196` and 20% of
channels differing by >8 said something else was going on, and it was:

**Covers are not reliably square. This one is 591x599.** `object-cover` CROPS
the source to fill a square box; a texture map STRETCHES the whole image across
a square plane. Same file, two different treatments, so a pixel diff shows a
spatial offset even when every colour matches. Measured separately, the
rendered plane is **exactly 420x420, ratio 1.0000** — the frustum arithmetic is
right and the geometry is square; it is the texture that is not.

**The lesson for the next unit:** a per-pixel diff between a canvas and an
`<img>` is not a colour test unless both are framed identically. Reading that
offset as a colour problem would have sent someone tuning a colour space that
was already correct.

**"I touched no existing files" was wrong, and the full E2E run said so.**
`every-page-has-nav.spec.ts` failed with *"src/app has 10 non-login pages; this
spec covers 9"* — a vacuity guard that counts `page.tsx` files so a screen
cannot be added without being checked. Adding a ROUTE changes a contract even
when no existing file is edited, and the unit's scope claim quietly assumed
otherwise.

`/plane` is exempted **by name**, alongside `/login`, rather than by bumping the
count. The distinction matters: an exemption spelled as a larger number is
invisible, and the next screen added would take the free slot and go unchecked —
exactly the silent coverage loss the guard exists to prevent. Verified by
dropping a decoy `page.tsx` in and confirming the guard still fails, then
removing it and confirming it passes.

The reason `/plane` is exempt rather than listed is that listing it would assert
it renders the main nav, and it is a development scaffold rather than a screen.
Giving a scaffold a nav to satisfy a test would make it impersonate a screen,
which is the shape of dishonesty that suite exists to prevent.

**And the tilt test flaked again, for a THIRD distinct reason — same test, three
different causes.** Worth listing together, because "it's that flaky test again"
is exactly the reasoning that would have missed each one:

1. Baseline captured before the pointer moved, because the element ships with
   `--tilt-y: 0deg` and the poll waited for the property to EXIST.
2. The reference rect measured mid-rise, so the mapping used geometry that was
   still moving (unit 13).
3. **This one: the layout box is the right rect for the MAPPING and the wrong
   one for AIMING.** Measured mid-rise it reads (384,121) 512x512 while the
   record is visually at (863,452) 188x281 — so the pointer landed on the scroll
   wrapper, no `pointermove` reached the tilt surface, and the poll timed out
   having never seen an angle at all.

The general shape: **"where does the mapping measure from" and "where is the
element on screen right now" are different questions, and one value cannot
answer both.** Unit 13 correctly made the mapping use layout geometry precisely
BECAUSE the visual box moves; this test then inherited that value for a purpose
that needs the visual box. Fixed by polling until the two agree, which is the
browser saying the rise is over — no duration in the test.

---

## Step 13 unit 16 — the box, and all four texture slots

**1:40 confirmed by eye, not inherited.** The CSS box's thickness was derived
from arithmetic against unit 12's measured failure and had never been judged
under light — the one number in this feature chosen without looking. Rendered at
1:25, 1:40 and 1:70 and cropped the edge on each:

- **1:25** — a broad grey band. Reads as a DVD case, which is the reference's
  own proportion and the wrong thing to borrow.
- **1:40** — a narrower band, still clearly its own lit surface, tonally
  separate from the face. Chosen.
- **1:70** — a hairline. The sleeve reads as a sheet with a dark border rather
  than an object with a side. This is the physically accurate ratio and it loses
  to legibility, exactly as the spines' 1:12 did.

The WebGL box got its OWN constant (`BOX_THICKNESS_RATIO`) rather than importing
`SLEEVE_THICKNESS_RATIO`. Sharing it would mean this unit's looking-at-it could
only be recorded by editing the CSS box, which the unit had to leave untouched.
Two renderers, two values, until one replaces the other.

**Two of the three real covers are NOT square** — 591x599 and 596x600. A22's
crop rule is a live path rather than an edge case, and every imported cover
should be assumed non-square until measured.

**The fallback back reads as a plain sleeve, but the EDGE is what sells it.** On
a record with no images at all, the face is a flat colour with light raking
across it — clearly a lit surface rather than a missing texture — but at the
fixed viewing angle its edge is much less visible than on a photographed record,
because there is no artwork to contrast against. It reads as a sleeve; it reads
less as a BOX than the textured ones do. Worth knowing before the panels unit,
since this is the face every record shows today.

**`hasGatefold` now exists twice** — `skins.ts` and `faces.ts`, identical logic.
Deliberate and temporary: the CSS and WebGL implementations are parallel while
the renderer is proven, and importing across them would couple two things meant
to be independently deletable. Recorded in the source rather than left silent,
because it is the two-places-one-rule shape this codebase keeps meeting. When
the CSS version goes, one copy goes with it.

**The root-grep habit paid again.** Grepping `spine_colour` before writing found
`DEFAULT_SPINE_COLOUR` and `textColourOn` already existing in `spine.ts` — so the
object reuses the wall's fallback colour instead of inventing a second one. A
file-by-file read of the plane directory would have found neither, and the
symptom would have been one grey on the wall and a different grey on the object
for the same record.

---

## Step 13 unit 17 — the panels, and the fallback edge

**`back-face.ts` fitted without reshaping, and no second producer appeared.**
`backFaceGroups` already decides which fields exist, formats each, groups them
imprint/pressing/provenance, and — the part that mattered — DROPS a group whose
fields are all absent rather than printing a heading with nothing under it. The
panel needed exactly one thing it does not supply: artist, title and year, which
were the FACE's heading in the CSS version. `factPanel` is that heading and
nothing else; the groups pass through untouched.

That is the third time this session reuse-over-reimplementation was the right
call, after `DEFAULT_SPINE_COLOUR` and `textColourOn`. Each time the grep found
it and a file-by-file read would not have.

**The fallback edge: the fix is DIRECTION, not amount.** Unit 16's defect was
that a plain sleeve's edge vanished into its face. The obvious fix — darken the
edge — fails at exactly the case that motivated it: Grave New World's sleeve is
~18% lightness, where multiplying by 0.8 moves it about three levels and the
edge disappears again.

So `edgeColourFor` chooses direction from the face's luminance and moves a
fraction of the REMAINING distance to white or black. A dark face takes a
lighter edge, a light face a darker one, and there is always room. Measured on
screen: a 21-level tonal step between edge and face on the plain sleeve, where
unit 16 had none visible.

**The test that catches this is the SWEEP, not the spot checks.** Two assertions
at the extremes can both pass while a band between them collapses. Walking
0-255 in steps of 5 and asserting a minimum separation at every level is what
rejects the naive rule — proven by installing proportional darkening, which
failed with `#000000 separates by only 0.000`. Spot checks at the two ends would
have passed the near-white one and caught only half of it.

**The discriminating fixture for the panel is the record with nothing optional
set.** A fully-populated fixture cannot distinguish "omits absent fields" from
"renders every field it is given" — both produce identical output. Only the bare
record separates them, and in production the bare record IS the common case:
three of three records showed the empty state or near it.

---

## Step 13 unit 18 — the tilt in three.js, and a principle that overrode the eye

**CORRECTION: 1:40 was wrong, and the way it was chosen was the defect.**

Unit 16 rendered 1:25, 1:40 and 1:70 side by side specifically so the thickness
could be judged by looking — and then rejected 1:25 by REASONING: "DVD-case
proportion, which is the reference's own and the wrong thing to borrow." QA
looked at the same three frames and chose 1:25. At 1:40 and 1:70 the edge reads
as a dark line on a sheet; only at 1:25 does it read as a surface of its own.

**A principle overrode the instrument, inside a comparison that existed to be
looked at.** The principle was even sound in isolation — the reference IS a DVD
case and mimicking it would be borrowing the wrong thing — but "does this read
as a record" is a question the eye answers and an argument cannot. Exactly the
shape recorded for the spines, where 1:40 was arithmetic about sleeve thickness
and 1:12 was what could actually be read.

The check: when a unit sets up a comparison to be judged by looking, the looking
decides. If a candidate is going to be rejected on principle, reject it before
rendering it — otherwise the comparison is theatre.

**The rest state was flattering the geometry.** Every `/plane` frame through
unit 17 showed a fixed three-quarter angle, and every "does it read as an
object" answer was given under that pose. A box at an angle is obviously a box;
face-on it is indistinguishable from a plane. Now that the rest state is square
on, the honest answer to frame 1 is NO — at rest it reads as a flat photograph
of a sleeve — and the object-ness has to arrive from the motion, which is the
actual claim the renderer was adopted for. It does: one pointer move and the
edge presents, the face foreshortens, the light redistributes.

**`tilt.ts` fitted with no changes at all** — degrees in, degrees out, no DOM,
no CSS. The renderer converts to radians and nothing else. Fourth reuse this
session after `DEFAULT_SPINE_COLOUR`, `textColourOn` and `backFaceGroups`, and
the fourth to pay.

**The dirty-flag loop's real test is the IDLE frame.** Asserting "a render
happened after a pointer move" passes against a loop that renders every frame
for ever, which is the thing being avoided. The assertion that matters runs ten
frames after the flag is cleared and expects the count NOT to move — proven by
installing an always-render loop, which failed with "expected 1 times, got 11".

**A multi-step patch script that exits on failure loses its earlier successful
steps.** A script did four replacements, reported "ok" for each, then hit a
failed anchor and `sys.exit(1)` — before its single `write()` at the end. All
four were discarded while the log said they had worked. Lint caught it as two
unused imports; without that the pointer handler would simply have been absent.
Write after each step, or verify the file rather than the log.

---

## RULE: "where is this element" has several answers, and they are not interchangeable

Fifth instance in this feature, and the first where the two wrong answers were
both *correct* — just to different questions. Worth naming as a family rather
than fixing case by case.

The DOM offers at least three coordinate systems for one element:

| What you call | What you get | Relative to |
|---|---|---|
| `getBoundingClientRect()` | the VISUAL box, after transforms | the VIEWPORT |
| `offsetWidth` / `offsetHeight` | LAYOUT size, ignoring transforms | the element |
| `offsetLeft` / `offsetTop` walked | LAYOUT position | the DOCUMENT |

**The instances so far:**

1. Unit 10 — the FLIP Invert measured an element that already carried the
   inverted transform, so the delta came out zero and the record "rose" from
   where it landed. Visual box, when layout was wanted.
2. Unit 13 — the tilt's reference rect grew to 516.8x524.5 once the box had
   `preserve-3d` depth, so the angle depended on the angle. Visual box, when
   layout was wanted.
3. Unit 13 — the box edges measured 15.83px mid-rise and stayed 0.39px wide.
   Visual box, when layout was wanted.
4. Unit 13 — the tilt E2E test aimed a real cursor using the LAYOUT box while
   the record was still rising, so the pointer landed on the scroll wrapper.
   Layout box, when visual was wanted.
5. Unit 18 — the WebGL tilt paired a DOCUMENT-relative walked `offsetTop` with
   a VIEWPORT-relative `clientY`, so the vertical axis drifted by exactly
   `scrollY` and the horizontal one did not. Layout position, when viewport was
   wanted.

**The rule that would have prevented all five:** name the question before
reaching for a measurement.

- "How big was this laid out?" -> `offsetWidth`/`offsetHeight`.
- "Where is it on screen right now?" -> `getBoundingClientRect()`.
- "Where is a pointer relative to it?" -> `getBoundingClientRect()`, because
  `clientX`/`clientY` are viewport-relative and the two MUST share a system.

**The tell that this family is in play:** one axis is wrong and the other is
right. A genuine sign error or a bad rotation order breaks both axes
symmetrically; a coordinate-system mismatch breaks only the axis that differs —
here vertical, because the page scrolls vertically and not horizontally.

**And the reason unit 12's tests never caught it:** the CSS implementation walks
offsets too, and is correct, because it lives inside a `position: fixed` overlay
with the body scroll-locked. `scrollY` is always zero there, so the two systems
coincide. The same construct was latent in one place and live in another, and
only the scrolling page exposed it. A shared helper would have carried the bug
into both; what actually differed was the CONTEXT, not the code.

---

## Step 13 unit 19 — the rise in three.js, and a diagnosis that cost too much

**The mapping worked on the first attempt. Verifying it took six passes**, and
every one of those passes was spent on the instrument rather than the thing.

**What the mapping does.** `getBoundingClientRect` for BOTH the spine and the
canvas, because the question is "where are these two elements relative to each
other, right now, on screen". Both viewport-relative means scroll cancels out of
their difference, so no scroll term appears in the arithmetic — that absence is
the design. Unit 18's defect was mixing a document-relative measurement with a
viewport-relative one; the fix was never a correction term, it was keeping
everything in one system.

Verified numerically rather than by eye: spine (199,420) 11x160, canvas
(430,636) 420x420, `from = {x:-1.0369, y:0.8238, scaleX:0.02619,
scaleY:0.38095}`. scaleX is exactly 11/420 and scaleY exactly 160/420.

**The four false trails, in order, all mine:**

1. Screenshot at 15% looked settled -> assumed the rise was not running. It was.
2. Probed `[data-testid="box-canvas"]` and took the LAST one — which is a
   thickness candidate, not the risen record. Measured and photographed the
   wrong element for three passes. The label in the log said `1:70 · ready` and
   I read past it twice.
3. Filtered the frame log to `progress < 0.3` and read the resulting two lines
   as "the animation runs for two frames". It ran for twenty; the filter hid
   the middle.
4. Instrumented the loop with a shared `window.__loopDbg` array and got 537
   frames in 900ms with zero gaps — because NINE loops run on that page, one
   per canvas, all pushing to one array.

**What actually resolved it: slowing the animation to 4000ms so a frame could
be judged.** At 620ms the early portion is over before a screenshot can land,
and every frame looks like the settled state. That is the same trap as unit 10's
"a settled frame is indistinguishable from a working one", met from the other
side — there the motion was absent, here the capture was too slow.

**The rule: when a measurement disagrees with the code, check the measurement
first.** Four of those five passes were spent proving my instrument wrong, and
in each case the code was already right. Slowing the thing under test until it
is unambiguous should have been the FIRST move, not the sixth.

**A second-order lesson about test filters.** The `progress < 0.3` filter was
added to keep the log short and it converted a working animation into evidence
of a broken one. A filter on diagnostic output is a claim about what matters,
and it can lie in exactly the direction that confirms the hypothesis being
tested.

**One thing measured and left alone**: there is a ~167ms gap between the effect
running and the first animation frame arriving, where subsequent frames are
~16ms apart. Real, reproducible, and it means the first sixth of a 620ms rise is
a single held frame. Not fixed here — the rise reads correctly at full speed and
chasing it would be a fourth attempt at a thing that works.

---

## Step 13 unit 20 — the wall claims the screen

**A latent defect the grep found before it could bite.**
`MIN_SPINE_WIDTH`/`MAX_SPINE_WIDTH` were hardcoded at 11-15 while
`SPINE_TEXT_BUDGET` and `SPINE_ROW_HEIGHT` were derived from `SPINE_HEIGHT`.
So raising the height from 160 to 240 would have quietly changed §10b's 1:12
ratio into something much narrower — a wall of planks — and NO TEST WOULD HAVE
CAUGHT IT, because the ratio assertion checks the relationship (`9 < r < 16`)
and both values would still have satisfied it at the old height.

§10b states 1:12 as a RULE rather than a number. The widths now derive from the
height, with a test that fails if either is pinned to a literal again. Worth
noticing that a partial derivation is more dangerous than none: three of four
constants tracked the height, which made it look like the chain was complete.

**The text budget moved 29 -> 44 and that broke a truncation test, which is the
derivation working.** The old fixture — Luther Vandross / Never Too Much / FE
37451, 41 characters — now FITS WHOLE at a 44-character budget and stopped
testing anything at all. Replaced with a real band whose name alone exceeds the
budget. That fixture has now moved twice (31 -> 29 -> 44) for the same reason
each time, and its docblock says so: the property under test never changed, only
how much shortfall there is.

**The height alone did not make it a wall, and the measurement said why.** At 30
records, 50 spines fit per full-width row, so the collection makes ONE short row
with 400px of empty page below it. No spine height fixes that. What makes it a
wall is full-bleed width PLUS enough records to wrap — at 120 records it is
three rows deep and runs past the fold.

That also means a full-HEIGHT container would have been the wrong fix: it would
produce a mostly-empty black box, which is precisely the "missing data" failure
§10b's 40% floor exists to prevent, one level out.

**A breakout that was cancelled by its own padding.** The first attempt was
`w-screen` with `-ml-[50vw]` and
`px-[max(1rem,calc((100vw-72rem)/2))]`. The wrapper measured the full 1280px
and the shelf inside it still measured x=64 w=1152 — because that padding
re-inserted exactly the column margin the breakout had just escaped. Two
correct-looking declarations that cancel each other, visible only by measuring
the ancestor chain rather than reading the classes.

**The 40% floor now measures against the full-bleed wrapper**, not the old
`max-w-6xl` column: 40% of 1248 rather than 40% of 1152. Verified at 5 records —
timber 499.19px against a predicted 499.2px.

**Asserting geometry rather than a class name earned its place immediately.**
The new E2E test measures the shelf's box against the viewport. A `toHaveClass`
check on the breakout classes would have PASSED against the broken version,
because the classes were all present and correct — and cancelled by a fourth.

---

## Step 13 unit 21 — the controls overlay

**A24d (gaps versus repacking) is UNIMPLEMENTED and needs its own unit.** The
shelf repacks when filtered: the spines close up rather than leaving gaps where
the excluded records were. §10b A24d specifies gaps as the primary feedback for
a filtered wall. This unit ships the honest repacked version and the closed
control's filter count, which is the *secondary* feedback; the gaps are a
separate piece of work with real layout consequences and should not be smuggled
into a layout unit.

**The view toggle could not return to the shelf, and no number could see it.**
The toggle offered `table` and `grid` only. That was harmless while `table` was
the default view and became a one-way trip the moment §10b made `shelf` the
default — you could leave the shelf and not get back, except by editing the URL.
It was found by LOOKING at a screenshot of the built overlay. Every measurement
this unit took was correct and green at the time: the wall was 1248px full-bleed,
the panel displaced it 0px, chrome fell from 403px to 205px. None of them ask
"can a user get back here", so none of them could fail.

Same shape as unit 20's vacuous geometry test, one level out: there the
instrument measured the wrong element, here the instruments measured the right
things and the question was never posed. A passing suite constrains what it
asserts and nothing else.

**Two navigation implementations were nearly shipped.** The toggle has to sit
outside the overlay while `CollectionFilters` — which owns the pending-navigation
reconciliation — is inside it. The obvious build gives the outside toggle its own
`router.push`, which is two implementations of one navigation that must agree,
and the outside one would silently drop a filter change still in flight.
Avoided by `renderToolbar`: the caller arranges the toggle and the body, and
both come from one instance with one `change`.

**`includeUndated` is presence-without-intent.** `parseCollectionParams` sets it
to `true` whenever a year filter is present (§5.2's default), so a naive
`Object.keys(filters).length` reports "2 filters" for one year filter — a key
the user never set, counted as something they did. `activeFilterCount` counts
what a user DID: view/sort/page are not filters, a year range is one filter, and
`includeUndated` counts only when `false`.

**205px of chrome remains above the wall** — the nav (52px) plus the
"Collection / 1 record / Add record" heading block. The overlay removed the
controls; the heading is a separate decision and was not in this unit's scope.

---

## Step 13 unit 22 — the wall and the plane are different surfaces

**Unit 21 chose a treatment and then painted both surfaces one colour.** It
rendered four candidates for the empty portion, picked "dim wall with the shelf
edge along its foot", and implemented it as a single `#1a1714` rectangle with an
edge gradient repeating down it. The choice survived only in the comment. Nothing
asserted that wall and plane differed, so nothing noticed that they did not.

That is a new variant of a familiar shape: not a test that cannot fail, but a
DECISION with no test at all, recorded in prose next to code that contradicts it.
The prompt for this unit asked for "an assertion that would fail if they became
the same colour" — against unit 21's implementation that assertion fails
immediately, which is how the gap was found.

**Unit 21's geometry test went vacuous again, by a different route.** It measures
`shelf-timber`'s bounding box against the viewport. That element is now `w-full`
inside a `w-screen` breakout — a block element filling its parent, true by
definition. The offset half still bites; the width half cannot. Unit 20 had
exactly this problem with `[data-testid="shelf"]` and the fix was to measure the
visible element instead; making that element full-bleed re-created the vacuity in
the new place. **Widening an element to the viewport makes any width assertion
about it trivially true**, so the assertion has to move to something with a
reason to be a particular size.

Replaced by sampling `elementFromPoint` at the far left and far right of the
shelf line, at ONE record — the count where a content-sized plane and a
full-width one differ. Mutation-proved by restoring `w-fit max-w-full`.

**`background-size` and `background-repeat` pair with `background-image`
POSITIONALLY, and a short list cycles rather than erroring.** Three image layers
with two sizes silently gives the third layer the first layer's size. The test
counts entries per layer for that reason. Splitting layers on commas needs depth
counting — `rgba(0,0,0,.5)` nests commas two levels down and a lookahead regex
reports seven layers where there are three.

**Still not fixed, and it is a shape question rather than a paint one.** At five
records the wall above the spines is 240px of empty surface, and it is the
largest thing in the frame. Light makes it read as wall rather than as void,
which is what this unit could do. Whether a short collection should get a
shorter wall is a structural decision §10b does not settle — it says the space
BESIDE the records is wall, and says nothing about the space above them.

---

## Step 13 unit 23 — the wall as a real thing

**The 15px foot misalignment was NOT caused by `rotateX(2deg)`, and unit 22's
diagnosis of it was wrong.** Measured directly: with the rotation restored the
feet sit at −0.08px, not −15px. The rotation was spec drift under A24b and
dropping it is right, but it was not the cause. The cause was structural — the
plane was a gradient stop in a box sized by its contents, with `pb-2` beneath
it, so the painted band and the feet were in different places for a different
reason. **A visible transform is a tempting culprit and being visible is not
evidence.**

**A background has no box, and every rect assertion in this file is blind to
it.** This is the instrument lesson of the unit, and it is not a variant of the
earlier ones — it is stronger. `getBoundingClientRect` cannot see a painted
gradient AT ALL, so it does not report it wrongly; it reports something else,
confidently. Two defects hid behind that: the 15px misalignment, and a doubled
shelf line 8px apart that was obvious in a screenshot and invisible to every
measurement taken of it. Both were found by decoding the PNG and locating the
shelf by COLOUR, which is what `findShelfBands` now does — the same thing the
eye does, and the only measurement that would have failed on any of the bad
versions.

**Eight attempts at one seam, and the fix was to remove the seam.** Two
mechanisms drew the shelf — a repeating background for wrapped rows and an
element for the last one — because neither alone could do both jobs: a repeat
cannot know where the last row ends, an element cannot know where the browser
wrapped. Every attempt to make them agree produced a doubled line (8px, then
3px, then a stray band in the padding, then none at all). A per-spine shelf was
seam-free and stopped where the records stopped, breaking §10b's plane rule.

The version that works is ONE mechanism: the repeat draws every shelf, bottom
anchored to a `padding-box` whose padding is exactly one shelf deep. Bottom
anchoring is what matters — spines are `items-end`, so rows are anchored to
their feet, and a top-anchored pattern lands `padding-top` above every one of
them.

**Two mutations that do not bite, and both are honest no-ops rather than weak
tests.** Top-vs-bottom anchoring coincides whenever the rows box is an exact
multiple of the tile, which it is at 5 records and at 80. `rotateX(2deg)` moves
the feet by 0.08px, under any sane threshold. Recorded because "the mutation
did not bite" normally means the test is decorative, and here it does not —
worth not mistaking one for the other later.

**Still open: what the wall reads as at 120 records.** The wall is now
viewport-height, so a full collection scrolls past its bottom edge and the
"empty portion" question changes shape — at 120 records there is no empty wall
below, only above the first row. Whether a short collection reads as short
rather than broken is now a VERTICAL question as much as a horizontal one, and
five records on a 695px wall is a different judgement from five on a 268px band.

---

## Step 13 — the canvas over the wall

**A test that recomputes the code's arithmetic asserts the arithmetic, not the
code.** The first version of the rise integration test measured the spine rect,
recomputed `screenRectToWorld` inside the page, projected it back, and compared.
It passed against a mapping that ignored the slot position entirely and against
one carrying unit 18's `+ scrollY` defect. It was a closed loop agreeing with
itself.

The fix was to make the component publish what it actually computed —
`BoxCanvas` writes the world placement to data attributes — and have the test
project only that. Both mutations then failed, the scrollY one by exactly 161px.

This is a distinct shape from the vacuity findings before it. Unit 20's test
measured the wrong element; unit 22's rects could not see a painted background.
This one measured the right thing with the right instrument and still proved
nothing, because the value under test was derived from the same inputs by the
same formula. **A round trip is only a check if one direction comes from the
code.**

**Playwright's `click()` scrolls the target into view.** A rect measured before
the click describes a position the spine no longer occupies. This produced a
161px miss on Y with X correct — unit 18's exact signature, different culprit:
there the code mixed coordinate systems, here the harness moved the page between
two individually correct measurements. `scrollIntoViewIfNeeded()` first, then
measure, then click.

**Two defects that needed BOTH halves to appear.** The panels had no background
of their own: built against `/plane`'s light workbench page, they rendered as
transparent text directly over spine glyphs. And the spine hover label reveals on
`group-focus-within`, so a clicked spine kept its tooltip visible beneath the
translucent scrim. Neither the wall alone nor `/plane` alone could show either.
That is what an integration unit is for, and it is an argument against scaffolds
that do not render the real component.

**Orphaned after deleting `PulledRecord`, and NOT removed here:**
`src/app/shelf/faces.ts`, `rise.ts`, `chrome.ts` and `box.ts` now have no
importers outside their own tests. `back-face.ts` and `tilt.ts` are still shared
with the canvas path. Deleting four modules and their tests is a larger and
separate decision — several encode measured findings (unit 12's box geometry,
unit 10's rise curve) that may be wanted when the flip and the return are built
on the canvas.

**Still missing from the canvas path**, all previously working in CSS: the flip
to the back face, the gatefold affordance, and the return-to-slot animation.
"Turn over" and "Full details" are inert and say so. The tilt exists in
`BoxCanvas` but has no assertion over the real wall.

**One E2E flake under full-suite parallelism, not reproduced in isolation:**
`collection-filters.spec.ts:421` ("clicking through to a filtered view equals
loading that URL directly") on the mobile project. It passes alone, and the
whole spec passes in full at the commit before the CSS retirement, so it is not
a regression from that deletion — the file has no shelf dependency. An earlier
full run reported a different flake (`EVERY row of a wrapping wall`), which then
passed three times in isolation and did not recur. Both are recorded rather than
dismissed: this project's own rule is that passing in isolation is not evidence,
and two different tests flaking on the mobile project in consecutive full runs
is worth watching rather than explaining away.

---

## Step 13 — three defects from the QA gate

**The panel values were invisible, not absent, and the omission logic was
right.** `backFaceDetails` filters null/empty before grouping and
`backFaceGroups` drops an all-missing group, so an absent value cannot render a
row — verified: a record with no pressing produced no Catalogue/Pressed/Country/
Plant rows at all. What shipped was the value column at **1.02:1** against its
ground (L* 6.2 text on L* 6.5) because `Panels.tsx` was built for `/plane`'s
LIGHT page and I gave it a near-black ground without changing its text tokens.
The labels used `text-muted-foreground` at L* 40 and stayed legible, which is
exactly why it read as "labels with no values".

**A colour in a `className` is a string, and no test can ask a string whether it
can be seen.** The palette is now values in `panel-palette.ts` with the
relationships asserted, swept across every role rather than checked at two —
mutation-proved that dimming provenance alone (the mid-band case) fails while
both endpoints still pass.

**The rise's stall was the first DRAW, not the first frame.** Phase timings:
renderer created 8.7ms, loop started 10.3ms, first animation frame 13.2ms —
then a 209ms gap to the second. Per-render timings: **45.4ms for the first draw,
0.4-0.9ms for every one after**. That is shader compilation and pipeline setup,
which WebGL defers to the first `render()`, plus React committing the overlay,
scrim and two panels in the same frame.

That distinction decided the fix and the prompt was right to demand it: neither
cost is the animation being slow, so *delaying the start* would have moved the
stall rather than removed it. Drawing one warm-up frame at the slot spends the
expensive frame while the record is still spine-shaped and exactly where the
spine is.

**Screenshot sampling reported the OPPOSITE defect.** It showed the box
shrinking 159→118px, because a screenshot round trip costs ~100ms and never
observed the first half of a 620ms rise. The per-frame progress log is the only
instrument that has answered a question about this animation correctly, and it
is now a committed test rather than a probe.

**A block of code placed after `return` in an effect is dead and silent.** The
`live.current` assignment for the return went in below the cleanup function, so
the ref was never set, the return effect's null guard fired, and `onReturned()`
ran immediately — the record vanished exactly as it had before the fix. Nothing
type-checked it, nothing linted it. Found by instrumenting the state after
dismissal rather than by reading.

**Two editing-safety notes.** A python splice with a mis-measured span
duplicated 408 lines of `shelf.spec.ts` and produced four duplicate test titles;
Playwright refused the file, which caught it. And the obvious `useEffect` reset
of a "returning" flag is what `react-hooks/set-state-in-effect` refuses — the
flag is stored WITH the record id instead, so a mismatch reads as "not
returning" without state having to be corrected.

**Still flaky under full-suite parallelism:** `EVERY row of a wrapping wall gets
a shelf under it` (unit 23's). Second full run in which it has flaked, and it
passes in isolation. Not from this work, and worth a look before it hides
something.

---

## Step 13 — the rise as a 3D motion, and the browsing lag

**Browsing lag: three WebGL contexts per pull, and it was not any of the first
guesses.** Measured across six pulls: 18 contexts created, 12 slow draws (one at
63.9ms, eleven at ~31ms). Ruled out by measurement rather than reasoning — the
warm-up frame is one frame; the fixtures have no covers so no texture loads at
all; and the dirty-flag loop drew **zero** idle frames in 1500ms, so it settles
correctly between rises.

The cause was `resolveSkins(record)` built inline in the caller's JSX. `skins`
is an effect dependency in `BoxCanvas`, so a fresh object on every render tore
down renderer, geometry, materials and lights and rebuilt them. The `key`
accounted for one rebuild per pull; identity churn added two more. Memoising it
took 15 rebuilds down to 10 across five pulls — and the remaining 2x is React
StrictMode double-invoking effects in development, which does not happen in
production.

**That last part changed a test's threshold, and the reasoning matters.**
Asserting 1x rebuild per pull would fail against correct code because the E2E
suite runs against `next dev`; asserting 3x would not have caught the defect.
The bound is 2x — honest for the environment the test runs in, and still fails
the 3x that shipped.

**The rise was a rect interpolation the box was drawn inside.** Unit 19's FLIP
moved position and scaled from the spine's rect to the settled rect: no depth,
no rotation. Correct at both endpoints and wrong for the entire middle, which is
why it read as a square shrinking and expanding.

A spine IS the edge of a record, so the motion is a quarter turn about Y from
edge-on to face-on plus a translation in Z — both free under a real camera, and
neither expressible in CSS, which is the case A18 made for the renderer in the
first place. `risePose` owns it, the return reads the same function from 1 down
to 0 so the two directions cannot describe different objects.

**Mutation-proved on the middle, not the ends**, because the ends were already
right: no rotation fails, snapping face-on in the first frames then translating
fails, and turning in place before moving fails. The second is the important
one — it passes both endpoint assertions and looks exactly like the defect.

**Observed and NOT changed: the lateral travel is front-loaded.** Both channels
share the cubic ease-out, so at 15% progress the record has already crossed 39%
of the distance from its slot to the centre, and 87% by halfway. It leaves the
slot quickly and then hovers near centre while it finishes turning. That is a
judgement about the shape of the motion rather than a defect, and it is the sort
of thing to decide by looking at the frames.

---

## Step 13 — the wall in the scene (`/plane`)

**The slot empties, and that is the unit's answer.** With the wall and the
record in one scene, the spine that rises IS the spine that was in the wall, so
the gap is not drawn, coordinated or faked — it is where the mesh is not any
more. Asserted as the pulled spine's distance from its home position (>240px,
mutation-proved: pinning the mesh to its slot gives exactly 0). Screenshots show
the empty slot and the record occluding the spines and shelf line behind it.

**Scroll: a tall canvas that scrolls with the page.** A fixed canvas with a
panning camera is camera work, which A24b rules out, and it puts the wall and
the page in two coordinate systems that must agree about a scroll offset — unit
18's defect by construction. Cost stated: 125 records is a ~750px canvas rather
than a viewport-height one. Beyond a few rows the answer is to render only
visible rows, which the computed layout already permits.

**A reproducible "scale limit" that was a two-state race.** The scene mounted at
20-80 records and never above ~85. The measure callback reported the correct
width four times while the scene effect only ever saw `width = 0`. Cause: the
width lived in React state, measured in one effect and consumed in another —
two pieces of state that must agree about one number, the smell this project
keeps meeting. Fixed by removing one: there is no width state, the effect
measures the element it is about to draw into on a layout frame. Four wrong
theories preceded that (parent measurement, StrictMode double-invoke, instance
identity, fixture leakage), and three of them were wrong because fixture
accumulation across tests in one worker made the readings non-reproducible.

**Three geometry attempts, and the third was to stop.** `risePose`'s quarter
turn was built for the PERSPECTIVE camera on `/`, where a turning face
foreshortens. Under the orthographic camera A24b requires for the wall, a
rotation about Y is a pure horizontal squash with no convergence — it reads as
squeezing, not turning. Attempt one turned past face-on and back to edge-on (the
record grew, then shrank); attempt two made every spine a full square and filled
the wall with covers. The rotation is disabled and the record widens instead.
**How a record should turn under an orthographic camera is a real open question**
and is reported rather than guessed at a third time.

**Known wrong in the candidate, not fixed:**
- Spine text renders MIRRORED — a texture orientation bug.
- Spines read pale grey rather than their spine colours; the wall looks like a
  barcode where the CSS wall had colour.
- No hover behaviour at all, deliberately: there is a hover defect on `/` and
  this unit does not carry across a behaviour nobody asked for.

---

## Step 13 — the long lens, and two texture defects

**A long lens does both, and the measurement is what showed how.** A24b's
square-on rule and §10b's turn conflict under one orthographic camera: a
rotation about Y with no convergence is a pure horizontal squash. Swept across
focal lengths:

| FOV | edge compression @3440px | convergence at 40% pull |
|-----|--------------------------|-------------------------|
| 4°  | 0.06% | 1.038 |
| 12° | 0.55% | 1.120 |
| 16° | 0.97% | 1.164 |
| 25° | 2.37% | 1.271 |
| 40° | 6.03% | 1.487 |

**16° clears both bars.** An edge spine is within 1% of a centre spine, so
A24b's REASON survives — spines equally legible, no raking angle — and a record
pulled toward the viewer converges by 1.16, which reads as a turn. Mutation-
proved from both sides: 40° fails edge compression, 2° fails the turn.

**The pull had to become RELATIVE, and that was the real finding.** At 4° the
camera stands 10,653px back for a 744px wall, so the fixed 420px pull was 4% of
the way and converged by 1.02 — no turn at all. Convergence depends on the
proportion of the distance closed, not on pixels. `PULL_FRACTION = 0.4`.

**Two texture defects, both from the same wrong mental model.** The spine was
modelled as a slab the width of a spine, with the label on its +z face. But a
spine IS a record turned side-on: the face the viewer sees in the wall is the
sleeve's EDGE (+x), and +z is the cover, hidden until the turn. The label was on
the cover. And the label canvas was created landscape and stretched onto a
portrait face, which rotated the glyphs by squashing them — the `rotate(PI)`
added to fix the reading direction turned that into a mirror.

**A resting pose reset to the wrong value.** The non-pulled branch set
`rotation.y = 0`, so pulling one record turned EVERY spine on the wall face-on.
The resting pose is the quarter turn, not zero.

**Still not verified: spine text legibility on screen.** The label is on the
right face now and the geometry is right, but the fixtures have no spine colours
(§7.8 computes them from covers, and the API does not accept them) so the wall
renders in the fallback grey and no text was legible in the frames. Whether a
supersampled canvas texture matches the CSS wall's hinted 9px mono is UNMEASURED
and is the thing to check before this replaces `/`.

**Screenshot sampling still cannot see the start of the rise.** The "15%" frame
was already fully turned: a round trip costs ~100ms of a 620ms animation. The
frame log remains the only instrument that has answered a question about this
animation correctly.

**The dev login password was changed** to a known value in `.env.local` only.
`.env.test` carries its own `APP_PASSWORD_HASH` and `playwright.config.ts` runs
the server with `NODE_ENV=test`, which makes Next load `.env.test` and SKIP
`.env.local` — so the twelve specs' `login()` is unaffected. Both files are
gitignored; production is untouched. **The `$` characters must be
backslash-escaped**: single quotes do not stop Next's parser interpolating them,
and a quoted hash arrived at the route as a 25-character fragment.

---

## Step 13 — colour and legibility verified against real data

**Both criteria met, and the verification found a defect nothing else could.**

The wall reads as bands of colour — deep greens, ochres, wine reds, blues,
creams, with a lit edge and a shadowed side on every spine, so it reads as
objects on a shelf rather than flat stripes. Arguably better than the CSS wall,
which had the colour but no depth.

Spine text is legible at real size without hovering, on light and dark spines
alike, and **just as legible at the far right edge as at the centre** — which is
the A24b criterion the long lens was chosen to satisfy, now confirmed by looking
rather than only by arithmetic.

**A wall that rendered perfectly and showed no text at all.** Colour, lighting,
shelves, layout and slot behaviour were all correct; the labels were on the face
pointing away. Nothing errored, no assertion failed, every existing test stayed
green. It was only visible by looking at a wall with REAL data on it — API
fixtures have `spineColour: null` (§7.8 computes it from covers), so the test
wall rendered in fallback grey where a missing label is indistinguishable from a
dark spine.

The cause was a sign: under three.js's Y rotation the +x normal maps to z = −1
at +π/2, so the face pointing at the camera after a positive quarter turn is
**−x**. The label was on +x.

**Both plausible fixes look equally right in code and only one is.** Moving the
label to −x fixes the wall and leaves the record showing its BACK when the turn
completes — a defect that only appears after a 620ms animation. Flipping the
rotation sign serves both ends: edge toward the viewer at rest, cover toward the
viewer at face-on. `spine-facing.ts` pins that as arithmetic, swept through the
turn, with the defect asserted directly so a reader who flips it back sees a
test named after the consequence.

**The lesson for the remaining WebGL work:** a scene can be wrong in ways that
have no error, no failing assertion and no visible artefact except absence.
Verifying against fixtures that lack the very data being judged is how that
survived two units.

---

## Step 13 — performance and 390px, before any swap

**Performance at 125 records, measured under sustained interaction (headed
Chromium, 1280x900):**

| | result |
|---|---|
| scene builds at mount | 1 |
| scene builds across 5 pull/return cycles | **0** |
| idle draws in 2000ms | **0** |
| draws across 60 fast hover moves | **0** |
| draws in one 620ms rise | **39** (60fps) |
| draws in 2000ms after all interaction | **0** |
| draw cost | median 2.8ms, p95 4.1ms |

The unmemoised-prop class of defect is absent, the dirty-flag loop settles both
before and after interaction, and draw cost is well inside a 16.7ms frame.

**Hover costs literally nothing, because there is no hover handler.** That was
deliberate — `/` has a hover lag and a "records pop up on hover" defect, and
this scene does not carry either across. Hit testing is click-only.

**Headless Chromium throttles rAF to ~10fps and I nearly reported that as a
defect.** The first measurement showed 8 draws for a 620ms rise; frame gaps were
83-100ms with periodic ~967ms stalls. Headed, the same code gives 16-17ms gaps
and 39 draws. **A performance number from a headless browser is a number about
the browser.** The `animate` change made while chasing it is still right — one
loop rather than two interleaving — but it was not the cause and the first
diagnosis was wrong.

**390px: wraps correctly, text legible, and it exposed a real defect.** 125
records wrap to nine rows and a 2232px canvas. Spine text is as legible as at
1280 — spine width does not change with viewport, only the wrapping does.

The defect: the camera frames the whole wall, so its distance scales with the
collection. That is correct and is what keeps a spine at its true 240px —
computed after framing on one row overshot and made a single record fill the
screen. But the PULL was a fixed fraction of that distance, so nine rows put the
camera 7941px back and sent the record 3176px toward it, out of the viewport
entirely: an empty slot with nothing visible to show for it. Capped at two rows,
which still clears the convergence bar.

**Not yet done, and deliberately separate:** the swap of `/` to the WebGL wall.

---

## Step 13 unit A — the pulled record's destination

**The three symptoms did NOT share one cause.** The hypothesis was that the
record ends up very near the lens, filling the frame flat and exaggerating the
lean of nearby spines. Measured at 125 records, settled:

    world (640, -120, 507)   NDC (0, 0.838)   screen (640, 60) of 1280x744
    camera distance 2155     camera z 2647    rotationY 0
    scale 240x240x22         facing +z        spineColour #c1c8c9, no cover

The record was **2155 units from the camera**, not near it, and had travelled
496 forward — the two-row cap, not "thousands". Each symptom is separate:

1. **Not centred: the record kept its slot's row height.** `home.y` was never
   interpolated, so a row-0 record settled 252 world units above the view
   centre. Predicted NDC 0.832 against 0.838 measured — the arithmetic matches
   exactly. This is the one real defect and it is fixed.
2. **The "flat dark green rectangle" is the plain-sleeve fallback, correct.**
   `spineColour` is `#c1c8c9` and there is no cover, so §10b's honest absence is
   what should render. It reads flat because a uniform surface lit head-on has
   no gradient to shade across — the key light gives it N·L 0.745, so it IS lit.
   Not a defect; a consequence of no cover art plus a nearly edge-free face.
3. **The splay is pre-existing perspective and unrelated to the gap.** Captured
   the same crop with nothing pulled: identical lean, symmetric about the frame
   centre, growing toward the edges. It is ordinary convergence on 22px-deep
   boxes at 16° FOV.

**A shared explanation that fits is a hypothesis, not a diagnosis** — the prompt
said so and the measurement bore it out. One of three.

**The scene builds its own box, not units 16-18's.** Depth is the spine's width
(1:11), where `BoxCanvas` uses 1:25. That is a real divergence and is worth
reconciling when covers arrive, but it is not what made the record look flat.

**A vacuous test caught by mutation, again.** The centring assertion first used
5 and 40 records — both ONE ROW at 1280px, where `home.y` IS the view centre, so
restoring the defect changed nothing and the test passed against it. 130 records
wraps to three rows and discriminates. **The fixture has to span the dimension
the defect lives in**, which here was rows rather than record count.

**The pull-depth cap is retired**, with a note in its place. It bounded a
symptom of the pull being a fraction of the camera distance; the destination
removes the cause, so there is nothing left to bound.

---

## Step 13 — the return, and the box reconciled

**The return: the same `risePose` read from 1 down to 0**, eased IN rather than
reusing the rise's ease-out. `returningId` is what makes it animatable at all —
by the time the record should start moving, `pulledId` is already null and the
scene no longer knows which mesh to fly home.

**The existing return test passed against the vanish**, because it asserted
where the record ENDS UP and an instant snap satisfies that perfectly. Ending
in the right place is not travelling there. `the record ANIMATES back` now
catches it mid-flight; the older test still checks the destination, and the two
are deliberately separate.

**A self-referential assertion, twice.** The re-measure test polled `slotGap`,
which is computed as the distance from `home` — so corrupting `home` moved the
record AND the ruler together and the gap still reached zero. The second attempt
published `homeX`/`homeY` from the same object and had the same flaw. Both
passed against a mutation that broke the thing they named.

The fix is comparing two INDEPENDENT producers: the mesh's absolute position
against the slot the LAYOUT computed. Same shape as the seam test that pins
`shelfRecords` to the heading — assert two producers against each other, not
each against its own value. Now bites: expected 69, received 0.

**The box is reconciled, and the boundary is real.** `WallScene` built its own
at 1:11 where `BoxCanvas` uses 1:25 — the `genreSubtree`/`hasGatefold` shape,
and `BoxCanvas`'s own comment named the condition for resolving it ("two
renderers, two values, until one replaces the other"). `record-box.ts` now
re-exports the one ratio rather than restating it.

What stays separate is NOT a second thickness. Measured: at 1:25 a 240px record
is 9.6px thick, and `spineLabelPlan` fits a glyph across 62% of that — a **6px
font**, illegible. §10b settled this moving from 1:40 to 1:12. So a spine is
drawn at its shelf FOOTPRINT and the pulled record at its true THICKNESS, and
`boxDepth` interpolates between them across the rise. One object, two states, a
transition — rather than two answers to one question.

**Found and NOT fixed: the scene does not rebuild on resize.** A comment claimed
a `ResizeObserver` re-ran the effect "by bumping a version counter"; no such
counter exists and none ever did — a confident sentence describing a mechanism
that was never built. Resizing leaves the wall at its old wrapping. The comment
is corrected; the gap is its own unit. It also cost a test: the re-measure
assertion wanted resize as its fixture and had to use scroll instead.

---

## Step 13 — the wall rebuilds on resize

**The comment was false and the code did the opposite.** It described a
`ResizeObserver` re-running the effect "by bumping a version counter"; no such
counter existed and none ever had. Worth naming as its own failure mode: a
confident sentence about a mechanism that was never built is worse than no
comment, because it stops the next reader looking.

**Why it mattered more on `/` than on `/plane`:** the wall re-wraps on any width
change, so every slot moves, and BOTH the rise and the return map to slots. A
resize mid-session left the scene describing a layout that no longer existed —
a record rising out of a gap that is not where the gap is, and returning to a
slot its spine has left.

**Three decisions, each a way to get it wrong**, and each mutation-proved:

- Report a width change. (The defect.)
- Do NOT report an unchanged one. `ResizeObserver` fires whenever the box
  changes for any reason — including the canvas being inserted, which the
  rebuild itself does. Forwarding every notification rebuilds the scene in
  response to its own rebuild: 125 meshes, textures and a context, in a loop,
  at ~31ms each.
- Ignore zero. A container measured before layout reports zero, and so does one
  hidden by an ancestor; building then gives a layout with every spine on its
  own row.

**Width only.** The wall's height is an OUTPUT of the layout, so watching it
would be watching the rebuild's own effect.

**A stub that was wrong, not the code.** `stops reporting once disconnected`
failed first time because the fake `ResizeObserver`'s `disconnect` was a no-op.
Worth recording because the instinct on a failing test is to suspect the code,
and this project's rule is that a test passing first time is the suspicious
case — the inverse is also worth checking.

**Last unit's weaker test is closed.** The re-measure assertion wanted a resize
as its fixture — it re-wraps every row, where a scroll only moves them — and had
to use scroll because the scene could not rebuild. It uses resize now.

---

## Step 13 — the swap: the WebGL wall replaces the CSS wall at `/`

**The gate held.** The eight specs across five files that find records with
`getByRole('link', { name: title })` pass unchanged: `collection-filters` 10/10,
and `record-detail`, `record-form`, `stats`, `want-list`, `lookup-flows` 71/71
together. The seam test pinning the wall's record count to the heading was
retargeted to the accessible list and mutation-proved to still catch
`dc6e04c`'s defect: "the wall shows 3 records under a heading reading 1 record".

**Verified by hand, and the hand found what the harness did not.** `sr-only`
uses a 1px clip rather than `display:none`, so Playwright reports those links as
VISIBLE and finds them by role and name — every locating test passes. But the
element is 1px at x=-1, so it cannot be clicked, and tabbing skipped the entire
wall.

The CSS wall's spines were real focusable links. That is a capability LOST in
the swap rather than knowingly traded — the distinction that matters, because
cmd-click was traded and this was not. Fixed with
`focus-within:not-sr-only`: focus reveals a scrollable panel of every record,
Enter opens it. Mutation-proved — `sr-only` alone gives a 16px focused link and
fails the assertion by name.

**Exactly the shape the prompt warned about**: "a canvas that passes a harness
and eats a real click".

**What is missing from `/` that was there before**, stated rather than
discovered:

| Gone | Was |
|---|---|
| Panels (facts, actions) | `RecordCanvas` rendered `FactsPanel`/`ActionsPanel` beside the record |
| Tilt | pointer-tracked rotation on the pulled record |
| Flip / "Turn over" | never worked on the canvas path either; inert since the CSS retirement |
| Gatefold | same |
| Hover label | the CSS wall named a record on hover; deliberately not carried across (there was a hover defect and a pop-up defect on `/`) |
| Escape to dismiss | `RecordCanvas` bound it; the wall scene dismisses by clicking empty wall |
| Scrim | the dimmed backdrop behind the pulled record |
| Cmd-click a spine | knowingly traded — a canvas cannot carry it |

**What a user does instead of cmd-click:** tab to the accessible list and press
Enter, or switch to `?view=table`. Nothing in the app assumes cmd-click on a
spine — the two E2E clicks on a record link are on a detail page and in the
table view respectively, both unaffected.

**18 CSS-DOM tests are SKIPPED, not deleted**, with a note above them. They go
with `Shelf.tsx` when the CSS path is removed; skipping keeps the swap one
revert, which is the point of doing it separately.

**Suite timing after the swap: 8.3m against a ~6m baseline.** One run took 1.8h
and I nearly reported that as the swap's cost — it was machine contention (a
headed browser and two dev servers running alongside it), not a property of the
change. Individual specs are unaffected: `collection-filters` 26s,
`shelf` + `wall-scene` 56s. **A timing number from a contended machine is a
number about the machine**, the same lesson as the headless-rAF measurement.

Two flakes, both `collection-filters` on the mobile project — the same file that
flaked before this work.

---

## Step 13 — the room has a size

**1. Four shelves minimum.** Filtering to 26 records collapsed the wall to one
row. Same failure as every rejected minimum-WIDTH candidate in units 20-22,
arriving vertically: a rectangle that stops has a size and a reader reads it as
a fact. `MIN_SHELF_ROWS = 4`, as a FLOOR not a fixed height — mutation-proved
in both directions (no minimum, and minimum-as-ceiling).

**A24d is satisfied by this rather than by position-holding**, and SPEC §10b now
says so. The gaps rule wanted a filtered wall to keep its shape; holding slots
for unrendered records is a hard mechanism, and empty shelf below the results
achieves the same honesty far more simply.

**2. The clipping was the edge margin, and it was on both sides.** Diagnosed
rather than guessed — three candidates measured and two eliminated: the frustum
covers exactly 1248px of a 1248px wall (fits), and the canvas is 1248 in a 1248
host at x=16 (no overflow). What remained was `WALL_PADDING = 16`, measured
against a canvas already inset by the page's own padding, so the first spine sat
on the scene's first pixel. Now 40px, and pixel-scanned to confirm: 24px of wall
before the page background at the right edge.

**A wrong theory recorded because it was plausible:** the spine mesh is
`SPINE_HEIGHT` wide in X, so I expected a 95px overhang at the left. Projecting
the actual mesh showed screen x 13.5-35.6 — fully inside. The rotation
transforms the geometry, so the visible extent IS the depth. Arithmetic about
an untransformed mesh says nothing about what is drawn.

**3. The return was NOT dropping frames.** Measured: 36 frames across 620ms,
first-frame gap 17ms, median 17ms, progress 0 then 0.027. No stall, nothing
dropped — so "looks fast" was the CURVE, and tuning duration would have been
fixing the wrong thing. A cubic ease-in covers 13% of the distance by halfway,
leaving 88% for the second half: the record hangs, then snaps. Quadratic covers
25% by halfway. Changed the easing, not the duration.

**A taller canvas broke three committed tests, and the symptom lied.** They
dismissed at `box.y + box.height - 30`, which after the four-row minimum lands
BELOW the fold — the click hit nothing and the tests failed reporting an
unchanged slot gap, which reads as "the return never ran". A `dismiss` helper
now clamps to the viewport. Worth recording: a canvas taller than the window is
ordinary now, and any test clicking by canvas-relative coordinates has to
account for it.

**And a fixture outdated by the rule:** the re-wrap test used 60 records, which
is four rows at 1280 AND at 600 once the minimum applies, so the row count could
not move. 200 records discriminates. A test at a size the rule already covers
cannot see the rule working.

**Full E2E: 223 passed, 3 failed, 2 flaky — all five on the MOBILE project in
`lookup-flows` and `manage`, neither of which touches the wall.** All pass in
isolation (34/34 for the two files together), and `manage` passes in isolation
at the baseline commit too. This is the shared-test-data contention
`playwright.config.ts` already documents between concurrent workers, showing up
under a longer run. Recorded rather than reported as clean.

---

## Step 13 — hover: the record comes proud

**Draws, measured before and after** (headed, 125 records):

| | draws |
|---|---|
| idle before hovering, 2000ms | **0** |
| 60 fast moves across the wall | **60** (60 during, 0 settling) |
| idle after all hovering, 2000ms | **0** |
| 20 jitter moves on ONE spine | **0** |

One draw per spine CHANGE, not per pointer event, and the eased motion coalesces
into those frames rather than adding its own — so the wall settles to zero both
before and after. `shouldRedraw` owns that decision and is mutation-proved:
redrawing on every move gives 24 draws where 0 is required.

**One owner: `hoveredId` inside the scene effect.** Every spine's offset derives
from it via `proudOffset`, so "only one is proud" is unrepresentable rather than
merely unlikely. Crossing the wall touches forty spines and per-spine state is
the shape that has failed here every time. The proud motion never re-renders
React — only the CARD does, which is why a fast crossing does not cost forty
renders.

**Hover does nothing while a record is pulled**, chosen deliberately: the pulled
record's slot is empty so there is nothing to nudge, the record itself must not
respond, and a wall twitching behind the thing being read is worse than a still
one.

**`prefersReducedMotion` is now exported from `BoxCanvas` rather than restated.**
Two places deciding whether motion is wanted is the smell this project keeps
meeting, and a setting honoured in one animation and not another is worse than
honouring it nowhere. Under reduced motion the spine does not move and the card
still appears — it is information, not decoration.

**A test fixture that crossed the thing it was measuring.** The resting-pointer
test jittered at a fixed x ± 1px, which near a spine edge lands on the
NEIGHBOUR — spines are ~22px wide — so it measured 6 draws and called it a
resting pointer. It now jitters vertically along a spine's 240px length, with a
precondition asserting the hovered id did not change, so it cannot silently stop
testing what it names.

**The draw counter is committed, not a probe.** A still wall costing nothing is
a constraint rather than a statistic, and a canvas has nothing a test can
otherwise measure.

---

## Step 13 — the composition returns

**One owner: a PHASE, not six flags.** `record-state.ts` holds
idle/rising/settled/flipping/returning as one value. Dismissing from `flipping`
goes to `returning` like dismissing from anywhere else — there is no combination
of flags to get wrong because there are no flags. Mutation-proved on the
interactions rather than the parts: dismiss-only-from-settled leaves a mid-flip
record stuck, tilt-during-rise lets two things write one rotation, and a settle
that resets the face undoes a flip by arriving.

**The tilt is NOT a phase.** It is a pointer-driven offset on top of whatever the
record is doing, which is why `canTilt` is a question about the phase rather than
a phase of its own — and why the tilt and flip compose rather than compete.

**Which rotation owns which axis:** the rise owns Y while it runs, the flip adds
a half turn about Y on top of it, and the tilt adds X plus a small Y offset on
top of both. All three are SUMMED into one rotation rather than assigned, so
none can win over another. Unit 12 resolved the CSS equivalent structurally by
nesting; this is the same answer in a different medium.

**`tiltFor` fits unchanged, a fifth reuse.** Pointer and rect in, two angles out.

**A refactor bug the phase itself caused.** The return effect ran when
`pulledId === null`, which was true with separate flags because dismissing
cleared it. Deriving `pulledId` from the phase changed that: a returning record
is still OUT, so `pulledId` stays set and the branch never ran. Escape
transitioned the state correctly — measured `settled -> returning` — and nothing
moved. Keyed on the phase now, which is the question actually being asked.

Worth recording how that was found: three probes in a row said the wrong thing
(one said keydown never reached the window, because the probe's promise resolved
before the key was pressed). The one that answered it logged the transition
inside the state updater.

**The four-shelf room and the panels put the record in the wrong place.** The
destination centred on the WALL, which was right when the wall was the viewport.
A 992px canvas in a 900px window puts the wall's centre 243px below the
viewport's, so the record spanned page y 420-966 and its bottom fell off the
screen while the panels — `fixed`, viewport-centred — sat beside it. Two centres
for one composition. `pulledDestination` now takes the viewport and the scroll
offset, measured at PULL time rather than build time.

**Draws through the whole composition:** 0 idle before, 40 for 40 tilt moves
(one each), **0 after the pointer stops**, 0 after a flip. The dirty-flag
discipline holds with the tilt added.

**The hover card outlived what it described.** Hover already does nothing while
a record is out, but the card was React state and kept its last value — so it
sat over the facts panel naming the same record twice. Derived from the phase
now.

**The record centres on the CAMERA AXIS, and two other answers were measured
wrong first.** The four-shelf room made the canvas taller than the window, so
the record's bottom fell off the screen. Centring on the window gave NDC 0.62;
centring on the visible slice of the wall gave 0.93. Both were exactly the
offset from the camera's axis, projected — the arithmetic matched to three
decimals each time.

The camera is FIXED on the wall's centre because A24b forbids panning it, so
what appears in the middle of the frame is whatever sits on that axis. "Where
the reader is looking" is not a scroll question at all; that the wall extends
past the window is handled by the canvas scrolling with the page, which is what
the fixed camera bought in the first place. NDC (0,0) at 5 records and at 130.

Worth recording as a shape: **two plausible fixes that each moved the number in
the right direction and neither was right.** What settled it was computing the
expected NDC from the camera geometry and finding it matched the measurement
exactly — the code was doing precisely what it was told, and the instruction was
wrong.

---

## Step 13 — four QA findings, and two shapes worth keeping

**1. The tilt: a value computed, stored, marked dirty, and never applied.**

A new failure shape. Every instrument reported success — phase `settled`,
`canTilt` true, twenty pointer moves received, `tiltFor` returning real angles
(`rotateX 11.67, rotateY 7.80`), the dirty flag firing — because **each was
upstream of the break**. The line that writes the rotation lived inside
`setPulled`, which only runs while the rise or the return is animating, so
`markDirty` redrew an unchanged mesh.

That is worth naming separately from the vacuity findings: nothing was
mismeasured and no instrument lied. They were all true, and none of them was
the question.

**The flip escaped it only because its animation re-enters `setPulled`** — a
coupling nothing stated, which the next addition would have had to discover.
`applyPose` is now the single writer of the pulled record's mesh, and every
input (rise progress, flip turn, tilt angles) has a setter that calls it. The
coupling is explicit and there is a named place to hook into.

**2. The record was a correct box, drawn face-on, with a plain cover.**
BoxGeometry, 24 vertices, 240×240×9.6 (1:25), ambient plus directional light.
Face-on a 9.6px edge projects to nothing, which is why it read flat — and why
it could not be judged until the tilt worked. Unit 18's evidence exactly: an
untextured record reads as an object the moment it moves.

**The cover comment was accurate when written and described a debt no list
carried.** "Cover textures are a later unit and a placeholder would assert
artwork the record does not have" — true, and there was no later unit. Pulling a
record WITH a cover gave the same `[tex, plain×5]` as one without: the artwork
never reached the face anyone sees.

This is not the prose-versus-code failure, where a comment contradicts what the
code does. It is **a deferral with no trigger and no home**, which REVIEW-PLAN's
triage already calls a decision never to do it. It survives every review
precisely because nothing contradicts it — there is no inconsistency to catch.

**3 and 4: the panels covered the record, and "centred" meant the wrong centre.**

The panels are pinned to the edges now with the middle belonging to the record —
`justify-between` rather than a spacer a flex row can compress. Criterion's
overlap the case at its edges and stop there.

For centring, three options and only one survives A24b: panning the camera is
forbidden; moving the record off the camera axis was measured wrong twice last
unit (NDC 0.62 and 0.93, both exactly its offset from the axis, projected). So
**the reader moves to the record**: pulling scrolls the wall's centre into view,
using the scrolling the canvas already does — which is what the fixed camera
bought in the first place.

**An inline style beating a class, again.** `pointerEvents: 'auto'` on the chrome
row overrode its own `pointer-events-none`, so the row swallowed every click —
dismissal and the tilt's pointer moves alike. Unit 12's finding in a third
medium: the more specific declaration wins, and the fix is structural (the
panels and scrim carry their own `pointer-events-auto`) rather than arbitration.

**A helper made stale by a new behaviour.** `clickASpine` reused a canvas box
measured before a pull, and pulling now scrolls — so the second pull in a test
hit empty page and reported "no spine was hit anywhere", which reads as a broken
wall. It scrolls to the top and re-measures now.

**Full E2E: 229 passed, 6 failed, 13.7m** — four `want-list` on chromium, plus
the familiar `collection-filters` and `manage` on mobile. All pass in isolation
(want-list 10/10) and want-list passes in isolation at the baseline too, so this
is the shared-test-data contention `playwright.config.ts` documents, showing up
on a run that took twice the usual wall clock. **Recorded rather than reported
as clean** — four failures in one file is a cluster worth watching even when
each is individually explainable.

---

## Step 13 — the faded cover: the scrim, and a cast underneath it

**The fade was the scrim, and only the scrim.** Measured against the source
image, mean RGB over the record's face:

| | R | G | B |
|---|---|---|---|
| source (centre-cropped as the UV does) | 46.8 | 39.8 | 31.0 |
| rendered, with the DOM scrim | 20.7 | 19.7 | 17.6 |
| rendered, scrim hidden | 68.6 | 65.4 | 58.3 |

The scrim alone cost **0.30x** — exactly `1 - 0.7` for `black/70`, matching to
two decimals. Structurally: it was `z-index: -10` INSIDE a `z-index: 40`
stacking context, so "behind the panels" still meant "in front of the canvas".
The panels looked full-strength because they are siblings above it.

**Candidates 2 and 3 are ruled out by the same measurement**: without the scrim
the render is BRIGHTER than source, so it is neither a lighting deficit (which
darkens) nor a missing sRGB conversion (which darkens midtones).

**The fix is structural, not a value.** The wall dims in the SCENE — spine,
shelf and lip materials scaled by `wallDim` — and the record is simply not in
that set. A DOM overlay cannot express "dim everything except this one object in
the canvas".

**Unit 11's ordering survived, and the obvious curve broke it.** A cubic
ease-out — the same easing the rise uses — is 39% dimmed at 15% progress and 88%
by halfway: the wall goes dark well ahead of the record, which is the modal
opening the ordering exists to prevent. Linear tracks the rise exactly, so the
dim arrives WITH the record. Mutation-proved in both directions.

**The channel drift is an ADDITIVE term, and the arithmetic says which.**
Ratios 1.47 / 1.64 / 1.88 spread wide; differences 21.8 / 25.6 / 27.3 are
near-constant. A gain gives equal ratios, a constant add gives equal
differences. Converting to linear space, the term is **+0.030 across all three
channels** — a constant light added to the texture, which lifts the darkest
channel proportionally most and reads as a blue cast.

**The honest fix is that a cover should not be lit at all**, and it is NOT
lowering the ambient until the numbers match. That would be tuning, and it would
darken the spines and shelves, which want the light. A cover is a photograph of
artwork; lighting it adds light that was never in the sleeve, which is the same
class as inventing a spine colour and §10b forbids it. `MeshBasicMaterial` on
the cover face shows the texture as-is — which is what unit 15 verified to 1.7
levels and why it used one. The shading belongs on the edges and the plain
sleeves, which are `MeshStandardMaterial` and should respond to light.

**Not applied in this commit**: that is a design decision about what a cover is,
not a defect fix, and it changes how every cover renders.

## The instrument reported in a different colour space than the source

`sharp.stats()` returns channel means in **linear** space. The screenshot bytes
and the source PNG are both sRGB. Comparing one against the other reported the
cover rendering at **0.52x source** — 24.3 / 21.0 / 18.0 against 47 / 40 / 31 —
which is not a plausible-looking error but a very plausible one: a near-uniform
halving reads exactly like a gain somewhere in the pipeline.

It survived two rounds of looking for that gain in the renderer. What ended it
was sampling a single pixel: `[47, 40, 31]`, identical to source. The bytes had
been correct the whole time.

Two lessons, and the second is the one that generalises:

1. **Compute the mean from the raw bytes.** `stats()` is a different question
   than the one being asked.
2. **A wrong instrument produces a consistent, reproducible, mutation-sensitive
   number.** This one would have passed a mutation test — reverting to a lit
   material moved it — so "the assertion is sensitive to the code" is not
   evidence the assertion measures what it names. Sample one pixel by hand
   before trusting an aggregate.

Related: the same session's first crop error (a centred sixth of the frame
reaching onto the dimmed wall) produced *the same number*, 24.3, by an entirely
different mechanism. Two independent instrument faults agreeing is what made it
convincing.

## Deferred: the spine treatment — line-drawn and monochrome, colour as accent

**What.** The wall's spines are full-saturation colour bands: `spine_colour`
fills the whole visible surface of every record. The direction under
consideration is line-drawn spines — monochrome, with the stored `spine_colour`
as an accent rather than the entire face. Adam's design sense is black and white
with pops of colour, and a wall of saturated bands is the opposite of that.

**The record's faces are NOT in scope for this.** Cover and back stay
photographic, skinned with the real artwork, governed by the photograph-is-unlit
rule in `surface-kind.ts`. A line-drawn spine and a photographed cover are not
in tension: a spine is a claim about a record, and the artwork is the record.

**Why deferred rather than declined.** It is a look, not a defect. The wall
reads correctly today — colour, legibility and performance were all measured
against real data before the swap. And deciding it now would mean deciding it
against 125 seeded records with invented names, which is deciding against a wall
that will not exist.

**Trigger: R8, once the collection is real (~100 records).** That is the review
that checks the app against the world rather than against the spec, and
REVIEW-PLAN already says R8 cannot be run by an agent alone — which is correct
here, because this is a judgement about how something looks to the person who
owns the records. Same trigger as `/manage`'s 200-row assumption, for the same
underlying reason: both need real data before the answer means anything.

### Two constraints that will govern whatever is chosen

Recorded now so they are not rediscovered by whoever picks this up.

**1. The legibility bar is already set, and it was expensive.** Spines are
roughly 1:12 — `SPINE_HEIGHT` is 240, `spineWidth` returns 17-24px — and each
one must carry artist, title and catalogue number in rotated mono. That bar cost
two units and overturned an earlier 1:40, which was too narrow to carry the
text. Any treatment that trades legibility for looking better has failed a
requirement that was paid for once already, and a line-drawn spine has LESS
contrast to work with than a filled colour band, not more.

**2. Whether spines become unlit is a real decision, not a detail.** A
line-drawn spine is a texture like any other, so `surface-kind.ts` will be asked
the question directly. The scene lights with an ambient at 1.5 and a directional
key at 1.9, and line work under a directional light picks up shading that fights
its flatness — the drawing stops reading as a drawing and starts reading as a
lit surface with marks on it.

But the answer is not automatically "unlit". A spine is not a photograph of
artwork, and unit 17 found that the plain-sleeve fallback's edge only separates
tonally from its face BECAUSE it is lit. Unlit spines may flatten the wall into
a single plane and lose the shelf depth entirely. The rule's own framing is what
decides it: what IS a line-drawn spine — a drawing, or a surface with a drawing
printed on it? That question should be answered explicitly and in those terms,
not settled by whichever screenshot looks better.

## Step 14 unit 1 — the two link terms, and an ordering test that was a coin flip

- **A27 was written before the code, and the code found nothing to argue with.**
  The amendment split §9.1's single link term in two; the implementation is two
  CTEs joined with `FULL OUTER JOIN`. Worth noting that the JOIN TYPE is the
  whole separation: an inner join returns only artists reached by BOTH routes,
  which silently drops most real links, and a left join drops every artist
  reached by membership alone. Mutation M2 (`FULL OUTER` -> `LEFT`) fails 3
  tests, all of them the shared-membership cases.

- **`records.artist_id` is NOT NULL, and the deleted `graph.ts` says otherwise.**
  That file guarded `WHERE r.artist_id IS NOT NULL`, so a case was planned
  against it — "a record with no artist must not create a phantom owned artist"
  — and the column has since been made `NOT NULL`. Verified against
  `information_schema` on the live test database rather than trusting either the
  old code or the Drizzle schema.

  **The test was DROPPED rather than written**, because its precondition cannot
  be constructed: the database refuses the row. A test whose setup cannot exist
  is decorative in the sharpest sense — it would have asserted something about a
  state the schema forbids. This is the general hazard in NOTES' advice to read
  deleted code for its reasoning: the reasoning survives, the facts about the
  schema may not.

- **Two exclusion tests PASSED against a stub returning `[]`.** Caught by running
  the stub before implementing, per CLAUDE.md §2's "a test that passes the first
  time is a defect in the test". "Everything is excluded" satisfies an exclusion
  assertion vacuously, and both tests were asserting only absences. Each now
  carries a POSITIVE CONTROL — a candidate that must appear alongside the ones
  that must not — so the test distinguishes "correctly excluded" from "returned
  nothing".

  **The general form: an assertion that only names absences cannot fail against
  an empty result.** Same family as the absence-as-success entries, reached from
  the test side rather than the code side.

# An ordering test that catches its mutation 1 run in 5 is worse than no test

The determinism test asserted that two equal-weight candidates come back in name
order. It passed, and its comment claimed an honest limit — that it pins the
observable effect but cannot prove the `ORDER BY` caused it.

**Mutation testing showed the limit was worse than the comment admitted.**
Dropping the name tie-break (`ORDER BY a.id` alone) still passed the whole file.
Run five times against the mutation, the ordering test failed ONCE and passed
FOUR times: random uuids agree with alphabetical order about half the time per
pair, so the defect surfaces on a coin flip.

**That is the worst possible failure rate for a test.** A test that never catches
its defect is dead weight and eventually gets noticed. A test that catches it 1
run in 5 presents as a flake, gets retried away by `retries: 1`, and actively
argues that the code is fine. NOTES already recorded this shape at unit 12b
("ordering by uuid makes a test a coin flip") — this is the second instance, and
the first where the flakiness was in the ASSERTION rather than in the data under
test.

**The fix is to remove the coincidence, not to accept the limit.** The two
artists now have PINNED uuids chosen so that id order is the exact reverse of
name order: 'Alpha Band' sorts first by name and last by id. The orders cannot
agree, so the assertion can only pass if the name tie-break did the ordering.
The mutation now fails 5 runs of 5.

**The lesson generalises past ordering.** When a test's fixture leaves any value
to chance, the mutation it exists to catch may be caught probabilistically — and
the measurement that reveals this is running the mutation SEVERAL times, not
once. A single mutation run that fails looks identical to one that fails
reliably. Four of this unit's five mutations were confirmed on one run each;
only the ordering one needed five, and it was the only one that needed the work.

**Mutations run, all now failing deterministically:**

| # | Mutation | Tests failed |
|---|---|---|
| M1 | `COUNT(DISTINCT person)` -> `COUNT(*)` | 1 (the multi-instrumentalist) |
| M2 | `FULL OUTER JOIN` -> `LEFT JOIN` | 3 (every membership-only case) |
| M3 | shared-member weight -> boolean `1` | 2 (tribute vs side project) |
| M4 | drop `ORDER BY a.name` | 1, on 5 runs of 5 (was 1 of 5) |
| M5 | drop the `NOT IN owned` exclusion | 1 (owned artists as candidates) |
| M6 | invert the CASE (wrong edge endpoint) | 6 |

- **A psql probe became test 9, per CLAUDE.md §2.** The probe checked that an
  edge's non-owned endpoint is the one selected, and that a candidate linked to
  TWO owned artists sums both strengths rather than reporting one. It is the
  verification that convinced me the `LATERAL`/`CASE` was right, so it is now a
  committed test rather than a deleted scratch query. M6 above is its mutation.

## OBSERVATION (step 14 unit 1): the full E2E run degraded badly, and it is NOT this unit

**CLOSED — see "RESOLVED: the E2E degradation was accumulated local state" below.
A cold restart returned the suite to 235 passed / 1 flaky / 7.8m, exactly the
baseline. The open questions in this entry are answered there; it is kept for the
measurements.**

Recorded per CLAUDE.md §4 rather than chased, because the unit it was noticed in
cannot have caused it. But it is a bigger observation than the usual flake note
and the next step should not discover it cold.

**Measured this session, in order:**

| Run | Result | Wall clock |
|---|---|---|
| Session start (baseline, before any change) | 235 passed, 1 flaky | 7.8m |
| After the unit, machine saturated by my own overlapping runs | 21 failed | 1.7h |
| After letting the machine settle | **33 failed** | **2.6h** |
| `lookup-flows.spec.ts` chromium ALONE, change STASHED | **22 passed** | 1.1m |
| `lookup-flows.spec.ts` chromium ALONE, change restored | **22 passed** | 1.3m |

**The unit is excluded as a cause by construction, not by argument.**
`linkTermsForCandidates` is imported by nothing — `grep` across `src` and `e2e`
finds zero references outside the module and its own integration test. E2E tests
drive the app through a browser; a module no route, page or component imports
cannot change what the browser renders. The stash comparison confirms it
empirically: byte-identical results either side.

**What is NOT yet explained**, and should not be assumed:

- Why the full run degraded from 7.8m to 2.6h across one session on one machine.
  Load average was ~38 at the worst point but was still ~22 (15-min) with
  nothing of mine running, and the 2.6h run happened AFTER settling.
- Whether the 33 failures are the documented shared-test-data contention at a
  larger scale, or a second mechanism. The failing set spans `lookup-flows`,
  `manage`, `record-detail`, `wall-scene`, `want-list` and `collection-filters`
  across BOTH projects — wider than the recorded cluster, which was `want-list`
  ×4 plus two mobile specs.
- Whether repeated full runs in one session degrade the database or the dev
  server cumulatively. Three full runs happened here; the suite got worse each
  time. That is a hypothesis with an obvious test (restart Docker + dev server,
  run once, cold) which was NOT performed.

**Trigger: before step 15's mobile pass**, which is E2E-heavy and will be reading
these same numbers. If the suite cannot produce a trustworthy full-run result,
step 15 has no instrument.

# THREE measurement errors in one session, and what each one looked like

Worth recording as a set, because they compounded: each made the next harder to
see, and together they cost far more than the unit did.

**1. An exit code that was not the test runner's.** `npx playwright test ... |
tail -8` reports `tail`'s status. The run announced "exit code 0" while
`test-results/.last-run.json` said `"status": "failed"` with 21 failed tests.
**A pipeline's exit code belongs to its LAST command.** Use
`cmd > file 2>&1; echo $?`, and cross-check `.last-run.json`, which is the
authority.

**2. Running Vitest against the test database while Playwright was using it.**
Produced 8 failures across 5 files the unit never opened, with a failure set that
MOVED between runs and `expected length 2, got 3` — extra rows, the signature of
a second writer. Vitest alone: 2579 passed. The suites share one database and
`truncateAll` runs between tests; they cannot overlap.

**3. Diagnosing machine load as external while measuring my own instrument.**
`ps aux | sort -k3 -rn | head` reported a zsh at 48% — which was that pipeline
itself, already exited by the time it was inspected. Concluded "something else is
consuming the machine" and said so. The falling 1-min-vs-15-min averages
afterwards showed the load was mine all along.

**The common shape: three different instruments each answered a question
adjacent to the one asked.** Same family as the `sharp.stats()` colour-space
finding — a wrong instrument produces a consistent, plausible, reproducible
number. The cheap check that ended all three was the same: measure the thing
directly (the status file, the suite alone, the load with nothing running)
instead of inferring it from a composite.

**And the one that would have saved the most time, done first:** ask whether the
change under suspicion is even REACHABLE from the failing tests. One `grep` for
references answered in seconds what three full E2E runs could not.

## RESOLVED: the E2E degradation was accumulated local state, and the instrument is fine

The observation recorded above ("the full E2E run degraded badly") is CLOSED.
A cold restart returned the suite to its exact baseline.

| Run | Result | Wall clock |
|---|---|---|
| Session start | 235 passed, 1 flaky, 20 skipped | 7.8m |
| Degraded, after three full runs in one session | 33 failed | 2.6h |
| Cold restart, **invalid — see below** | 146 failed | 16.4m |
| **Cold restart, valid** | **235 passed, 1 flaky, 20 skipped** | **7.8m** |

Same pass count, same flake count, same skip count, same wall clock. Not "near
baseline" — the baseline.

**What accumulated, stated as belief with its evidence and its limit.** The
strongest candidate is `.next`, which had reached **1.1 GB, of which
`.next/dev` was 833 MB**. Every E2E test waits on the dev server, and Next
compiles routes on demand into that cache; a bloated dev cache plausibly slows
every navigation in the suite. Supporting it: the test DATABASE was NOT bloated
— 14 MB, 28 live rows, 46 dead — so accumulated table data is ruled out, and
`truncateAll` was doing its job throughout.

**The honest limit: this is not proven, and cannot be from this data.** The
cold restart changed four things at once — deleted `.next`, deleted 32 MB of
traces, replaced a 2-day-old container, and (accidentally) wiped and re-migrated
the database. A single-variable test would be: run the suite three times to
degrade it, delete ONLY `.next`, run again. That was NOT performed. Anyone
citing the 833 MB as the cause is citing a hypothesis, not a measurement.

**The practical rule, which does not depend on the cause:** if a full E2E run
starts taking multiples of 7.8m, stop the dev server, delete `.next`, and run
again BEFORE diagnosing anything in the app. Three runs in one session was
enough to degrade it here.

# A `db:test:reset` that leaves the database unusable

Found by running the documented reset and then the suite. **146 failed, 33
passed, 57 did not run** — every failure ultimately `relation "artists" does not
exist`, buried under WebServer log noise several screens deep.

```
"db:test:reset": "docker compose down postgres && docker compose up -d --wait postgres"
```

`docker-compose.yml` declares **no named volume**, so the database lives in the
container's anonymous storage and `down` destroys the schema. The script brings
a container back up and stops — it never migrates. SPEC §14 lists
`db:test:reset` among the scripts that "must pass": it exits 0, and leaves a
database nothing can run against.

**Why this has never surfaced.** `npm test` applies migrations on every run
(visible as "applying migrations" in its output), so Vitest silently repairs the
damage. Playwright's `globalSetup` does not migrate, so the E2E suite is the only
consumer that sees the empty database — and its failure mode is 146 red tests
that look like an application collapse rather than a missing schema.

**The shape:** a script whose success is defined by exiting 0 rather than by the
state it leaves behind. Same family as the absence-as-success entries, and the
same tell — the thing that would have caught it is asserting the POSTCONDITION
(tables exist) rather than the command's exit code.

**Trigger: BEFORE step 15, as its first unit.** Not "the unit that fixes the E2E
instrument" — that was the original wording and it was a bad trigger, because the
instrument turned out to need no fixing, so the condition it named will never
arrive. A trigger conditional on work that may never happen is the untriggered
deferral REVIEW-PLAN's triage rule warns about, wearing a trigger's clothes.

Step 15 is the right point because it is E2E-heavy, and because of the specific
failure mode: the suite misbehaves, someone runs the DOCUMENTED reset to clear
it, and then spends an afternoon diagnosing an application collapse that is
actually a missing schema. The reset is the thing a person reaches for exactly
when they are already confused, which is the worst moment for it to make things
quietly worse. The fix is one word — append `&& npm run db:migrate` — and it is
out of scope for step 14 unit 1 only because it is unrelated to suggestions, not
because it is hard or unclear.

Do it sooner if anyone runs the reset in the meantime.

**Recorded honestly: I caused this, then diagnosed it.** The first "cold restart"
was invalid because of it, and its 146 failures measured nothing about the
instrument. It is a real defect that was already there, and it took destroying a
database to find it.

## MEASURED (step 14 unit 2, before building): §9.1's genre and label terms have no data source

Both measured against every write path and the live database before writing any
test, per the standing rule that a step's inputs are read before its spec is
trusted. Neither term can be built as specified today. Recorded together because
the decision between §9.1's options is one decision, not two.

### The genre term: `artist_genres` has a schema and no writer, ever

`1.5 × genre overlap with the user's top 3 genres by owned count`. "By owned
count" ranks the TOP 3; the overlap itself is between the CANDIDATE and those
three, and a candidate's genres are a property of the artist — `artist_genres`
(§4.3) — not of anybody's records. §9.1's own example reason string, "shares the
UK82 genre", is a claim about the artist with no count of records in it.

| Path | Writes `artist_genres`? |
|---|---|
| MusicBrainz lineup walk | **No** — no genre handling in `src/lib/musicbrainz/` at all |
| Discogs import | **No** — writes `record_genres`; never touches `artist_genres` |
| `POST`/`PATCH /api/artists` | **No** — `ArtistInput` has no genre field |
| Any UI | **No** — nothing in `src/app/**/*.tsx` references it |
| `mergeArtists` | **MOVES** rows between artists — cannot create one |

Live: **139 artists, 81 `record_genres` rows, 0 `artist_genres` rows.**

**A rejected substitution, recorded because it was nearly built.** The proposal
was to count the linking OWNED artists' records instead — Discharge's genres
standing in for Anti-Cimex's. Adam rejected it as a defect rather than a variant
reading, and the reason generalises: **the link term already scores the
connection to Discharge, so scoring Discharge's genres too counts one piece of
evidence twice under two names.** The reason string would assert "linked to
Discharge" and "shares Discharge's genres" as independent corroboration when they
are the same fact. A candidate linked to a prolific owned artist would score high
on genre overlap while having no genre relationship to the collection at all.
Same conflation A27 forbids between the two link terms, arriving in a third.

**Absent is not unknown.** Zero `artist_genres` rows means "nobody has tagged
this artist", not "this artist has no genre relationship to the collection".
Building the term anyway returns 0 for every candidate and presents it as a
computed judgement — silently inert, with the reason string simply never
mentioning genre and nothing anywhere saying why.

### The label term: there is no artist-to-label relationship to read

`1.0 × label overlap with labels appearing 2+ times in the collection`. Same
structural question, DIFFERENT answer — and worth stating separately, because the
two failures are not the same failure.

**There is no `artist_labels` table.** Not empty: absent. The only FKs to
`labels` are `records.label_id` and `want_list.label_id`, so a label attaches to
a RELEASE, never to an artist. That is correct modelling — a band records for
several labels across its life and §4.2 puts the label on the pressing-bearing
row — but it means "which labels is this candidate on" has no source at all, and
no table to populate later without a schema change.

Unlike the genre term, the DATA here is healthy: **38 labels, 37 of 38 records
carry one.** "Labels appearing 2+ times in the collection" is computable today.
It is the other half — attaching the candidate to a label — that has nowhere to
come from.

`want_list` was checked as the one path that could plausibly pair an artist with
a label without a record: it carries both `artist_id` and `label_id`. Live:
**12 rows, 12 with an artist, 0 with a label.** So even that path supplies
nothing today, and it would answer a different question anyway (what the user
INTENDS to buy, not what a candidate released).

### Both terms, one decision

Options as put to Adam: populate `artist_genres` from Discogs first (real work,
own unit); derive artist genres from their records (does NOT rescue it —
candidates own no records, so still 0 for everyone); or amend §9.1 and score on
the two link terms plus whatever survives. Awaiting that decision; nothing built.

# A table with schema, tests, merge logic — and no writer, ever

`artist_genres` is the instance and the class is the finding.

It has: a schema definition, FK cascade rules (`artist_id` CASCADE, `genre_id`
NO ACTION), rows in `schema-conformance.test.ts`'s exhaustive FK list, an entry
in `referrers.ts`, and dedicated merge logic in `mergeArtists`. **Nothing has
ever written a row into it.**

**The merge case is the sharpest.** `mergeArtists` moves `artist_genres` rows
from loser to survivor, skipping pairs the survivor already holds. That path was
found BROKEN during R4's remediation — "failed on two of three composite keys" —
diagnosed, fixed, and pinned with a test. All of it correct work, on rows that
cannot exist. The test constructs its own fixture with a raw
`INSERT INTO artist_genres`, so it passes and proves the code works; what no test
can notice is that the production path feeding it has no source.

**NOTES contains reasoning about protecting data in this table.** §4.3's junction
list omitting `artist_genres` is recorded as "the dangerous omission", with the
cascade direction argued from the data loss that would follow. A real argument
about a real rule, applied to a table that has never held a row.

**The class: a table reads as populated because everything AROUND it behaves as
though it is.** Cascade rules imply rows to cascade. Conformance tests imply a
contract someone relies on. Merge logic implies rows worth merging. Each artefact
is individually correct and collectively they assert a fact none of them checks.
It survives every review for the same reason the untriggered deferral does —
there is no inconsistency to catch, because nothing contradicts anything.

**Distinct from dead code, and that is why it needs its own sweep.**
REVIEW-PLAN's dead-code pass looks for MODULES whose only consumers are their
tests. This is the same shape one layer down, in the SCHEMA: a table whose only
writers are its tests. A module with no callers is findable by following imports;
a table with no writers is not, because the reads, the constraints and the tests
all look exactly like a live table's.

**Question for R7's cold read: what else has schema, tests, and no writer?**

**Do NOT use row count as the test — it answers a different question.** Checked
here, and the first two candidates I named on a hunch were both wrong:

| table | live rows | writers in `src/` | verdict |
|---|---|---|---|
| `artist_genres` | 0 | **none** (merge only MOVES rows) | **no writer, ever** |
| `want_list_genres` | 0 | 2 (`want-list.ts`, `discogs-import.ts`) | fine — just untagged locally |
| `record_tags` | 3 | — | fine |
| `record_genres` | 81 | — | fine |

`want_list_genres` is the instructive one: **zero rows and two real writers.**
Empty here only because the local want-list entries happen to carry no genres. A
row-count sweep would have flagged it and wasted the reviewer's time; worse, on a
database where someone HAD tagged a want-list item it would have cleared
`artist_genres` too if the timing differed.

**The test is "does a write path exist", not "are there rows".** And grep is a
poor instrument for it — searching for `INSERT INTO record_genres` returns
nothing, because Drizzle writes `.insert(recordGenres)`. Search the schema
IDENTIFIER (`recordGenres`), exclude `relations.ts` and `schema.ts`, and read
what the hits actually do: `mergeArtists` "writes" `artist_genres` in the sense
of an INSERT statement, but its SELECT source is the same table, so it can only
relocate rows that already exist. **A writer that reads its own table is not a
source.**

Start with the junction tables, since their rows arrive as a side effect of some
other write rather than from a form, which is where a missing path hides.

## Step 14 unit 2 — the scored terms, suppression, and two tests that passed for the wrong reason

- **Two mutations survived the first pass, and both were tests that named the
  right hazard while measuring something else.** Recorded together because they
  are one shape, and it is the shape CLAUDE.md §2 warns about most directly.

  **M11 — `COUNT(DISTINCT owned artist)` -> `COUNT(*)`, passed all 15 tests.**
  The multi-source test used two owned artists with ONE edge each, so a count of
  artists and a count of edges agree. The test's own comment said it existed to
  tell a count from a flag — true — while the fixture could not tell a count of
  artists from a count of edges. Fixed by adding a second edge to the SAME owned
  artist, in the opposite direction (§4.3's PK is `(source, target)`, so that is
  the only way to have two). Three edges, two artists: M11 now fails.

  **M13 — deleting the `MAX_LIMIT` bound entirely, passed all 14 tests,
  including the one written for it.** The test sent `99999999999999999999`,
  which is not a safe integer, so `parseIntegerParam` rejected it BEFORE the
  bound was consulted. The test asserted 400 and got 400, from a branch it was
  not testing. Fixed with `limit=201` — one past the ceiling is the only value
  that reaches the bound — plus a paired `limit=200` case, since either alone is
  satisfied by an off-by-one in the permissive direction. Both mutations now
  fail.

  **The general form: a test can name its hazard precisely and still be
  satisfied by a different code path.** Unit 11's normalizer had the same shape
  (a comment describing the exact shortcut it could not detect). The check that
  finds it is not re-reading the test — the comment reads correctly — it is
  running the mutation and watching which tests fail. In both cases here the
  count was zero.

- **Suppression needed TWO tests and §11's letter only implies one.** A
  want-listed candidate keeps its row and loses 3.0. Case 5 pins the score with
  the candidate still visible — constructed so the reduced score stays inside
  `limit`, because a fixture where suppression pushes it past the cut cannot
  distinguish suppression from exclusion, both producing an absent row.

  That test does NOT catch suppression applied after sorting: the score is still
  9 and the row still present, only in the wrong position. Case 6 makes
  suppression FLIP the order (10 vs 12-3=9) and is the only test that fails
  against M8. Adam named this before the unit started; the letter of §11 would
  have missed it.

- **The reason string is `string[]`, and the list rule earned its place
  immediately.** A candidate reached by both routes has two clauses. M9 —
  keeping only the first — fails 2 tests. A pre-joined sentence would have been
  a scalar holding a list, and the joining is the caller's decision to make.

- **`sharedMemberExemplar` is a deliberate narrowing of the SENTENCE, not of the
  data.** "Shares 4 members with Discharge" names one band where several may
  qualify; `sharedMemberArtistCount` carries how many. Recorded because a single
  name where a list exists is exactly the shape the field-holding-a-list rule
  warns about, and the distinction is that nothing is DROPPED — the count is
  still there, only the sentence is short. `MIN(name)` rather than an arbitrary
  row so the sentence is stable across calls.

- **No auth stanza, no not-found case, and both are decisions.** `routeAuthMode`
  defaults to `'session'`, so a per-endpoint auth assertion restates a default —
  18 of them were removed after a mutation pass, and adding one back here would
  reintroduce what that pass deleted. §5.8 defines no id, so there is no
  not-found case to invent; the fourth case that earns its place is the EMPTY
  result, which is the realistic one — `artist_influences` is hand-entered and
  holds nothing today, so §9.1 currently rides on shared membership alone.

- **`parseIntegerParam` exported rather than copied.** It was private to
  `query-params.ts` and rejects `'5e4'`, `'0x50'`, `' 1 '` and anything that
  cannot round-trip as a safe integer. A second copy is how two parsers come to
  disagree about what a number is; this codebase has recorded that once already.

**Mutations, all now failing:**

| # | Mutation | Tests failed |
|---|---|---|
| M7 | suppression -> exclusion | 3 |
| M8 | sort BEFORE suppression | 1 (case 6, and only case 6) |
| M9 | `reasons` -> first clause only | 2 |
| M10 | acquired want-list rows also suppress | 1 |
| M11 | artist count -> edge count | 1, after the fixture was fixed |
| M12 | `parseIntegerParam` -> `Number()` | 4 |
| M13 | drop `MAX_LIMIT` | 1, after the fixture was fixed |
| M13b | `>` -> `>=` (off-by-one) | 1 |
| M14 | default limit 10 -> 50 | 1 |

## Step 14 unit 3 — /suggestions is reached from the want list, not from the nav

**Decided deliberately rather than by adding a link**, because AppHeader is the
one place in this app where the default action has a measured cost.

**Re-measured at 390px before deciding**, not carried forward from the step-12
note (a baseline is a property of a build, and that note described a six-link nav
including the since-retired Graph):

    scrollWidth 337, clientWidth 237
    Collection 219 | Want list 290 | Look up 358 | Stats 409 | Manage 478

Identical to the note's five-link figures. **Stats and Manage are already past
the 390px viewport**, behind a horizontal scroll with no affordance. A sixth link
lands near 550 — a third hidden item, restoring exactly the state step 12 created
and the note forbids reproducing: "adding a link before this is addressed will
make it worse."

**Chosen: an entry point on `/want-list`.** Three reasons, in order of weight:

1. **It is where the output lands.** §10's row is "Add-to-want-list on each" and
   E2E #8 is "request suggestions and add one to the want-list". The screen's
   entire product is want-list rows, so the want list is where a user is when
   they want more of them.
2. **It degrades honestly.** `artist_influences` is hand-entered and empty, so
   §9.1 is sparse or silent for most collections today. A top-level nav link
   promises a destination; a contextual link promises a suggestion ABOUT the want
   list, which is still true when there is nothing to suggest.
3. **The alternatives are worse.** `/` is the shelf, which §10b gives the whole
   viewport with its controls behind an overlay — a link there either intrudes on
   the wall or hides in the overlay. And the nav is the option already ruled out
   by measurement.

**This does NOT solve the nav problem and is not intended to.** Step 15 still
owns it, with the options that note lists: a wrapping two-row nav, a scroll
affordance, or moving the rarely-in-store screens behind a menu.

**FOR STEP 15 — READ THIS BEFORE ADDING A NAV LINK.** `/suggestions` has **no
header link by decision, not by oversight**. It is reached from `/want-list`.

The reason, measured on this build at 390px: **the nav already hides two of its
five links** — `scrollWidth` 337 in a `clientWidth` of 237, Stats at 409 and
Manage at 478 against a 390px viewport, behind a horizontal scroll with no
affordance. A sixth link lands near 550 and makes a measured problem worse.

So: do not read the missing link as something the build forgot. When the nav is
fixed — wrapping row, scroll affordance, or the rarely-in-store screens behind a
menu — decide whether `/suggestions` earns a slot. The answer may still be no: it
is not an in-store screen, and §10 makes the phone case "standing in a record
store". Reachability is already satisfied: the screen renders the nav (so there
is a way back) and `/want-list` links to it (so there is a way in).

**A pressure worth naming: `AppHeader`'s own comment argues for adding one.** It
says "the remaining §10 routes are added by the steps that build them" — written
when the nav was short and true of every screen before this one. A file-local
instruction that was correct when written is exactly what carries a build past a
measurement taken elsewhere. The comment now records the exception.

## Add-to-want-list: the artist prefills, the reason is context, and nothing is invented

**§9.1 suggests ARTISTS; `want_list` holds RECORDS**, and `want_list.title` is
NOT NULL. So "add to want list" cannot be a one-click POST: there is no title,
and every candidate for one — `'TBC'`, the artist's name, an empty string — is
the app asserting a fact nobody supplied. That is the matrix-prefill and
country-`'Unknown'` shape this project has been caught by twice: a placeholder
that then sorts, filters and displays as real data.

**So the action links to `/want-list/new?artistId=…`**, which already accepts a
prefill and already carries an artist field. §5.7's division everywhere else in
this app: the app supplies the material, the user supplies the judgement.

### The reason clauses travel as CONTEXT, never as data

The problem is real — a user arriving at a blank form has forgotten which of five
suggestions they clicked. The resolution is that this is a SCREEN problem, not a
storage one, and the two have different answers.

**There is nowhere honest to store it.** `want_list` has exactly one free-text
column, `best_dig_notes`, and §7.2 gives it a specific meaning: the
highest-fidelity pressing worth hunting for. Writing "Shares 4 members with
Discharge" there is the best-dig/max-price conflation CLAUDE.md §8 forbids,
arriving through a prefill rather than through a form. Adding a column would be
schema for a UI convenience.

**So it renders on the form and is never written.** Two properties, both
deliberate:

1. **Regenerated server-side from the artist id, not passed in the URL.** A
   reason carried as a query parameter is attacker-controlled text rendered on a
   page, and it would also let a URL claim a reason the engine never produced.
   The page asks `suggestions()` why THIS artist is suggested and renders that.
2. **It does not survive the save.** The `want_list` row records what the user
   wanted, not what the app recommended. A suggestion is true of a collection at
   a moment; freezing it into a row would leave a stale claim behind the first
   time the collection changed.

**If the artist is no longer a suggestion, no context line renders** — a stale
link, or an artist acquired since. The form still works with the artist
prefilled. Absent context is honest; a fabricated one is the thing this entry
exists to prevent.

## Step 14 unit 3 — the screen, and what it declines to render

- **§10's row was already there.** Checked before treating navigation as a spec
  question: "Suggestions | `/suggestions` | Relationship-based list with reasons,
  always present. Separate 'Ask Claude for gap analysis' button for §9.2.
  Add-to-want-list on each." So this was a build unit, not an amendment.

- **The gap-analysis button is deliberately NOT built.** §9.2 is a later unit and
  a button calling an endpoint that does not exist is a dead control — which
  reads as broken rather than as unbuilt, and is worse than its absence. Recorded
  in the page's own comment so the omission is legible where someone would add it.

- **The SCORE is not rendered.** The reasons are. `8.5` means nothing to a
  reader; "Linked to 3 artists you own" is the same fact in a form they can
  check, and §9.1's requirement is explainability rather than transparency about
  arithmetic. A screen showing both would invite the user to reconcile a number
  with a sentence, which is work the app should have done.

- **The screen says two of four terms are unscored.** §9.1a in one line at the
  foot. A ranking built from half the specified terms is not wrong, but
  presenting it as the whole judgement overstates what the app knows — the same
  reasoning that made §7.7's badge state its tier rather than a bare yes/no.

- **The empty state names its two inputs.** `artist_influences` is hand-entered
  and `artist_memberships` comes from an on-demand walk, so a collection that has
  had neither shows nothing — the DEFAULT state today, not an edge case. The
  panel says which two things are missing and links to `/manage`, because "no
  suggestions" with no explanation is indistinguishable from a broken screen.

- **`every-page-has-nav.spec.ts` fired exactly as designed.** Its
  `EXPECTED_PAGE_COUNT` guard failed on the new page, in a file this unit would
  otherwise never have opened — the third time that trip-wire has caught an
  addition. `/suggestions` is now in `STATIC_ROUTES`, and it belongs there even
  with no header link: that spec's subject is whether a screen is reachable FROM,
  and the way back must exist even where the way in is elsewhere.

**Screen mutations, all caught:**

| # | Mutation | E2E failed |
|---|---|---|
| M15 | reason clauses dropped from the list | 2 |
| M16 | suppressed candidates hidden rather than shown | 1 |
| M17 | the form's context line never renders | 1 |
| M18 | `artistId` prefill dropped | 1 |

## Step 14 unit 4a — the rate limit, and a one-statement guard that was not enough

The migration and the limiter, committed before the Anthropic client so the
concurrency work is reviewable on its own.

### The defect the spec did not anticipate: one statement is not one serialisation

A29 specified `INSERT ... SELECT ... WHERE (count) < limit` as a conditional
insert and called it atomic. It is — with respect to its OWN snapshot, which is
what defeats check-then-act. **It is not serialised against other claimants**,
and under READ COMMITTED a statement cannot see another transaction's
uncommitted rows.

**Measured, not reasoned about:** ten concurrent claims against nine free slots
admitted **TEN**, reproducibly, about two runs in five. Every claimant counted
the same nine committed rows and every one inserted.

The fix is `pg_advisory_xact_lock` before the count, held to the end of the
enclosing transaction, so the next claimant reads a committed table rather than
a stale snapshot. **The amendment's reasoning was right about the failure it
named and incomplete about the mechanism** — worth recording, because "it is one
statement" reads as sufficient and is not.

**A consequence that inverts an earlier finding.** With the lock in place,
splitting the statement back into a count and an insert INSIDE the lock is no
longer a defect — the lock is what makes it safe, so that mutation correctly
passes. The test's comment says so, rather than claiming to constrain a
statement shape it does not.

# Writing the concurrent test: three versions, two of them convincing and wrong

Recorded in full because the first two looked right, passed, and would have
shipped a test that reports success exactly where the defect lives.

**Version 1 — a JS barrier before the call.** Both callers announce arrival, the
second releases both, then each calls the claim. Caught check-then-act when run
ALONE, 3 runs of 3. **Missed it inside the full file, 3 runs of 3.**

The diagnosis was measured rather than assumed: running only the two concurrent
tests, it failed again. The six sequential tests before it warm the connection
pool, so the first claim's round-trip completes before the second issues its
query — the barrier releases both into a race that is no longer a race.

**That is the isolation asymmetry in its dangerous direction**, and the standing
rule held: the isolated run was the honest one and the full-file pass was the
lie. Calling the difference flake would have kept a decorative test.

**Version 2 — `pg_advisory_xact_lock` around each claim in the TEST.** This made
it worse: the lock SERIALISES, so A claims, commits and releases before B reads.
That is the sequential case the test exists to avoid, and it stopped catching
the mutation entirely.

**Version 3 — a barrier between the READ and the WRITE.** The defect is two
callers both reading before either writes, so the barrier must sit in that
window. `db.execute` is hooked, a caller that has finished its count waits until
all have finished theirs, and only the count query is intercepted.

**And it still did not fire, for a reason no amount of re-reading would have
found:** `getDb()` caches its own client while `getTestDb()` builds a SEPARATE
Drizzle instance over the same database. Spying on the test's handle intercepts
nothing the module does. Found with a probe that threw from inside the mock to
print what it saw; the fix is to hook `getDb()`'s handle.

**The rule this yields: when a hook does not fire, prove it fires before
theorising about what it caught.** Three of this session's wrong turns were
instruments answering an adjacent question, and a mock installed on the wrong
object is the same family — it reports nothing and nothing looks broken.

## A detector that fires 4 runs in 6 is not a detector

The ten-way test found the missing-lock defect with a bare `Promise.all` — and
only **4 runs in 6**, because it depended on real concurrency and its timing
moves with pool warmth and machine load.

Same rule as the ordering test in unit 1, in a new place: **a test that catches
its defect two thirds of the time reads as flake and gets retried away.** The
barrier removes timing from the question — all ten claimants count before any
inserts, which is exactly the state a lockless limiter mishandles. Detection
went 4/6 → **6/6**.

**Mutations, all deterministic:**

| # | Mutation | Result |
|---|---|---|
| M19 | check-then-act, no lock | caught (2 tests) |
| M20 | drop the advisory lock | caught, 6 runs of 6 (was 4 of 6) |
| M19b | check-then-act INSIDE the lock | correctly passes — the lock makes it safe |

## The schema-conformance guard fired, in a file this unit never opened

`llm_requests` has three columns and no `created_at`/`updated_at`, so
"gives every other table both timestamp columns" failed — the cross-file break
CLAUDE.md §10 describes, caught by the full suite rather than by the unit's own
tests.

Exempted **by name with its reasoning**, never by bumping a count: `requested_at`
is the only time this table has an opinion about and the column the window
reads; a `created_at` would be a second answer to the same question, and an
`updated_at` would imply a row that changes, which these never do. That is what
makes the window a WHERE clause rather than a job.

## Step 14 unit 4b — §9.2, and what the disclosure boundary actually looks like

- **The exclusion is asserted against the SERIALISED payload, never field by
  field.** Nine sentinels planted across `purchase_price`, `purchase_date`, store
  name, journal entry, record notes, `matrix_runout`, `best_dig_notes`,
  `max_price` and catalogue number; the test greps the whole JSON string. A
  field-by-field check tests the fields the author remembered — this one covers a
  column added next year by someone who never opens the test.

  Paired with its inverse, or it is vacuous: "nothing leaked" is trivially true
  of a builder returning `{}`. M25 (empty payload) fails 3 tests.

- **Two fields excluded for a reason that is NOT sensitivity**, worth recording
  because the obvious framing misses them: condition grades and `year_pressed`
  are harmless to disclose, and they still do not go. §9.2 asks for gap analysis
  — what is MISSING — so they fail "is it needed" before reaching "is it
  sensitive". The narrower question is the one that keeps a payload small.

- **The genre vocabulary is what makes the response checkable.** A29d constrains
  `genre` to the user's own names, so a model that flattens UK82 into "punk"
  produces a name the hierarchy does not contain — and §9.2's genre-accuracy
  requirement stops being a hope about prompt-following and becomes a validation.
  That is the single sharpest thing in this unit.

- **The scenes are NOT hard-coded in the prompt.** CLAUDE.md §8 names five (UK
  first-wave punk, UK82, US hardcore, horror punk, psychobilly) as EXAMPLES of a
  distinction that matters. A prompt listing them would flatten a collection
  organised around dub or post-punk just as badly, in the other direction. The
  hierarchy the user actually built is the vocabulary.

- **The model choice is recorded as an argument, not a string.** `claude-opus-5`
  is bought for musical reasoning, at ten short requests an hour for one person —
  and the source says what evidence should move it: not "is Opus expensive" but
  "does a cheaper model keep UK82 and US hardcore apart", measurable against real
  suggestions.

# Three distinctions this unit had to keep apart, and they are all one shape

Absent-versus-unknown, three times in one feature:

| Distinction | Collapsing it says |
|---|---|
| unreadable vs empty response | "your collection has no gaps" when the answer was truncated |
| dropped suggestions vs none | a shorter list, with the model's error invisible |
| unconfigured vs failed | "Internal server error" for a missing env var |

Each has its own status code (502 / 200-with-count / `notConfigured`), and each
is mutation-covered. **The count is what carries the third one**: A29d requires
`dropped` to reach the UI, so the user sees "2 suggestions were discarded for
naming genres outside your collection" rather than a list that is quietly short.

## The fence-stripper looked like dead code and was not

Deleting the markdown-fence regex passed all 19 parse tests — brace-slicing from
the first `{` to the last `}` handles every fenced case those tests use. It read
exactly like an unreachable branch.

**It is load-bearing for prose CONTAINING A BRACE.** A model signing off with
"Hope that helps! {smile}" makes the last `}` the sign-off's, and brace-slicing
fails on a response that was perfectly good. Measured both ways — probe, then two
committed tests — before concluding either direction. The mutation now fails.

**The general form: "no test catches this mutation" has two explanations** — the
tests are thin, or the code is dead — and they need opposite fixes. Finding the
input where the two implementations diverge is what tells them apart, and it is
the same move as unit 2's normalizer, where real data had to be found rather than
constructed.

## A partial mutation understates coverage and reads exactly like a gap

Recorded because it cost a wrong conclusion in this session. A `sed` replacing
`return { ok: false, ... }` matched only the 4-space-indented occurrence, leaving
a differently-indented one intact. The half-mutation was caught by ONE test, and
I reported that as thin coverage. Applied completely, it is caught by SIX.

**Check that a mutation actually changed everything it names before drawing a
conclusion from what survived.** Same family as the hook that never fired: an
instrument reporting on a mutation that did not fully happen.

## The LLM prefill needed free text, and the affordance already existed

§9.1's suggestions carry an artist ID; §9.2's carry a NAME the model produced,
and the collection may have no such artist. A uuid-only prefill silently fills in
nothing and explains nothing — the invisible-failure shape.

`/want-list/new` now takes `?artist=` and `?title=` as free text, matches the
artist by name, and **reuses the Discogs prefill's `unmatched` affordance** ("No
artist named X in your collection yet") rather than inventing a second way to say
the same thing. §10's rule holds either way: reference rows are matched, never
created, because "an artist created for an abandoned form is debris nothing
points at".

**Mutations, all caught:**

| # | Mutation | Tests failed |
|---|---|---|
| M21 | leak `purchase_price` | 1 |
| M22 | leak the store name | 1 |
| M23 | send artist uuids | 1 |
| M24 | `COUNT(DISTINCT r.id)` -> `COUNT(*)` | 1 |
| M25 | empty payload (vacuity) | 3 |
| M26 | malformed collapses to empty | 6 |
| M27 | whole-response rejection on one bad item | 6 |
| M28 | drop silently, no count | 6 |
| M29 | skip genre validation | 2 |
| M30 | no fence stripping | 2 (after the probe became a test) |
| M31 | drop the genre vocabulary from the prompt | 1 |
| M32 | drop the no-flattening instruction | 1 |
| M33 | unreadable reported as empty | 1 |
| M34 | `isAnthropicConfigured` ignores blank keys | 2 |
| M35 | widen the vocabulary (skip validation) | 1 |
| M36 | claim AFTER the call | 1 |
| M37 | unreadable reported as an empty 200 | 1 |
| M38 | refuse with 500 rather than 429 | 1 |
| M39 | drop `retryAt` | 1 |
| M40 | drop the `dropped` count | 1 |

## OBSERVATION (out of scope): npm audit reports 5 pre-existing vulnerabilities

Noticed when installing `@anthropic-ai/sdk` — **not introduced by it**. 4
moderate, 1 high, the high being `nanoid` (GHSA-2v37-7h3g-55p8, a custom
generator looping when size is zero). `npm audit fix` claims to resolve them
without breaking changes.

Not acted on: it is unrelated to this unit and CLAUDE.md §4 says record rather
than fix mid-stream. **Trigger: R6, deploy readiness** — that review already owns
the question of what ships to a host somebody else runs.

## The wall at 390px: 462px of non-shrinkable chrome, and no touch handlers at all

Surveyed 2026-08-20, step 15 unit 2, **before** any mobile screen work — recorded
here rather than acted on, because the unit that acts on it is not this one and
the phone-default question (§10b) comes first.

SPEC.md §10b says the wall "will be judged at 390px" for the first time in step
15. This is what the survey found, and none of it is a rendering failure: the
wall draws. It is that **every affordance on it is either fixed-width or
hover-driven**, and §10b deliberately put every readable fact in the panels.

### The chrome row cannot fit, arithmetically

`WallScene.tsx:1355` lays the pulled record's chrome as
`fixed inset-0 flex items-center justify-between gap-6 px-6`:

| part | width |
|---|---|
| `FactsPanel` (`Panels.tsx:29`) | `w-[210px] shrink-0` |
| `ActionsPanel` (`Panels.tsx:140`) | `w-[180px] shrink-0` |
| `gap-6` | 24 |
| `px-6` | 48 |
| **total** | **462px, non-shrinkable, in a 390px viewport** |

The two panels overlap the record and each other, and the row overflows.

**The `max-w-[26vw]` wrappers do not save it** (`WallScene.tsx:1390`, `:1397`).
At 390px that computes to 101px — narrower than the `w-[210px]`/`w-[180px]`
children it wraps, and those children are `shrink-0`, so the max-width is
defeated rather than applied. A constraint that is silently overridden reads in
source as though the case were handled.

**Why this is data loss and not styling.** §10b moved every fact off the object
on purpose: "the faces carry artwork and nothing else", and "the panels are DOM,
not canvas… the panel is the only channel a screen reader or a test can read."
So artist, title, year, label, catalogue number, pressing details, condition and
purchase information are ALL in the overlapping panels. Obscuring them on a phone
removes the only channel that carries them.

### There are zero touch handlers in the scene

Verified by grep across `src/` for `pointerdown`, `pointerup`,
`setPointerCapture`, `touchstart`, `touchmove`, `TouchEvent`, `pointerType`,
`isPrimary`, `hasTouch`: **zero hits.** The only match for "dragged" is prose in
`WallScene.tsx:1128`.

§10b states: *"On desktop the record follows the pointer as the reference does…
On touch it is dragged."* **The touch clause is specified and unbuilt.**

Every consequence follows from that one absence, which is why they are one
finding rather than four:

| affordance | mechanism | on touch |
|---|---|---|
| tilt | `window` `pointermove` while settled (`:1196`) | never fires — no move stream without a finger down |
| spine eases proud | `pointermove` raycast (`:955`) | never fires |
| hover card — artist, title, year, label (`:1416`) | requires hover | **unreachable from the wall** |
| keyboard record list (`:1435`) | `sr-only focus-within:not-sr-only` | reachable by Tab only; no visible control reveals it |

So on a phone the wall is a picture you can tap. The hover card is the only place
the wall names what you are aimed at, and it cannot be summoned; the accessible
list is the only text channel for the collection, and nothing on screen offers
it.

### Zero width breakpoints exist in the shelf or the scene

No `sm:`/`md:`/`lg:` anywhere in `src/app/plane/` or `src/app/shelf/`. The three
media queries in `globals.css` (`:341`, `:356`, `:453`) are all
`prefers-reduced-motion`. **There is no width-based media query in the
codebase**, and the one `matchMedia` call (`BoxCanvas.tsx:111`) is reduced-motion
too. The wall has never been told a viewport can be narrow.

Related fixed assumptions, same survey: `SPINE_HEIGHT = 240` with
`MIN_SHELF_ROWS = 4` (~1000px of room regardless of viewport, which §10b says is
correct — "you scroll"); `WALL_EDGE_MARGIN = 40` leaving ~278px of usable spine
width at 390px; and `WallScene.tsx:1423`'s `window.innerWidth - 280` hover-card
flip, which at 390px fires for any x > 110 and so flips the card leftward across
nearly the whole width.

### WHY NONE OF THIS SURFACED: the wall is not in the mobile matrix

`playwright.config.ts`'s `mobile` project runs five specs. **`wall-scene.spec.ts`
and `shelf.spec.ts` are not among them.** `wall-scene.spec.ts` narrows to 900px
(`:389`) and 600px (`:470`) and never below.

So the wall has never been executed at 390px by anything. This is the
uniform-matrix argument the config's own comment makes against itself — "a spec
only fails on mobile if a mobile-specific defect exists, and none does today" was
written before the wall existed, and the wall arrived carrying five.

**Adding both specs to the mobile matrix belongs to whichever unit touches the
wall first.** Recorded here so that unit inherits it rather than rediscovering
it. Note the config comment's own standing rule: "Re-adding a spec here needs no
justification; removing one needs evidence."

### Order decided: the phone-default question goes first

§10b leaves it open by name — *"Whether a phone should default to the shelf at
all is genuinely open and belongs to step 15's mobile pass."* It is taken first
because **it changes what the other two findings are worth**: if a phone does not
default to the shelf, the overlap and the missing drag are defects on a
deliberately-reached view; if it does, they are the first screen of the app being
unusable on the device §10 calls primary.

That unit produces **evidence for a judgement, not a build** — the wall on a
phone-sized viewport in a state that can be looked at, **with the overlap
visible rather than fixed first.** A tidied version would flatter the answer to
the question being asked. §10b already fixes the constraint on whatever is
decided: if it is gated by width, **the gate goes on the default and not on
availability** — a view a URL can reach must stay reachable.

## Step 15 unit 2 — the nav wraps, and the measurement is now a test

The defect NOTES carried since step 12: `AppHeader`'s nav was one
`overflow-x-auto` row, and at 390px **two of its five links were entirely
outside the viewport** behind a scroll with no affordance.

**Re-measured on this build before touching anything**, because a baseline is a
property of a build and the step-12 figure described a six-link nav:

    scrollWidth 337, clientWidth 237  -> 100px hidden
    Stats right edge 408.66, Manage 478, against a 390px viewport

Identical to the recorded figures. The defect had survived three steps.

### Why it survived: it was prose, and prose does not fail

This is the finding, not the fix. The measurement existed, was correct, was
written down twice, and was read at least three times — step 12 recorded it,
step 14 unit 3 re-measured it and declined to add a `/suggestions` link because
of it, and both entries ended with a warning to a future reader. **Nothing
executed the nav at 390px**, so nothing ever went red.

Same shape as the wall findings recorded above, and the same cause: a
requirement that lives in a comment is satisfied by whoever remembers to read
it. `e2e/nav-mobile.spec.ts` now fails against `AppHeader.tsx` instead.

### The test asserts geometry, and the reason is a defect this suite has shipped

The obvious assertion — "every link is inside the viewport" — **passes on a nav
that wraps into a heap.** Links stacked on each other, or squeezed to a few
pixels tall, are all inside the viewport. So each link is checked three ways,
and each fails against a different defect:

| # | assertion | catches |
|---|---|---|
| 1 | visible, and inside 390px | the off-screen tail — the original defect |
| 2 | height >= 24px | a wrap whose rows collapse |
| 3 | no two links overlap | a wrap that stacks links — **invisible to (1)** |

(3) is the one a naive test misses, and it is the one that catches a "fix"
satisfying (1) by folding the row onto itself.

**A class-name assertion would have been worse than useless.** `flex-wrap` in
the source does not prove a wrap happened: a parent `flex-nowrap`, a `w-max`, or
an ancestor `overflow-x-auto` would each leave the class present and inert.
That is unit 20's breakout defect exactly — four correct declarations cancelled
by a fifth — and the DOM-presence-is-not-visibility class this suite has now
been caught by three times. The rendered box is the only thing that knows.

Plus a vacuity guard (`toHaveCount(5)`): every geometry assertion below it
passes trivially on a nav rendering zero links.

### The fix, and why `flex-wrap` alone was not enough

`-mx-1 flex gap-1 overflow-x-auto` -> `-mx-1 flex min-w-0 flex-wrap gap-1`.

**`min-w-0` is load-bearing.** The nav is a flex ITEM of the header bar, and a
flex item floors at its intrinsic content width unless told otherwise — so
`flex-wrap` alone leaves the row at 337px and the wrap never fires. Worth
recording because the symptom of omitting it is *the fix appearing not to work*,
with the right class present in the source.

### AFTER, measured the same way as BEFORE

| width | scrollWidth / clientWidth | rows | nav height | page overflow |
|---|---|---|---|---|
| 390 | **237 / 237** (was 337 / 237) | 2 | 60px | none |
| 360 | 207 / 207 | 2 | 60px | none |
| 320 | 167 / 167 | 3 | 92px | none |
| 768 | 337 / 337 | 1 | 28px | none |
| 1280 | 337 / 337 | 1 | 28px | none |

**Nothing is hidden at any width, and desktop is byte-identical** — one row,
same geometry at 768 and 1280. The wrap fires only where the row cannot fit, so
this is not a breakpoint that trades desktop for mobile. It costs 32px of
vertical space at 390px and nothing above it.

**It degrades correctly below the tested width**: 320px takes a third row rather
than clipping. A menu would not have had that property, and neither would a
scroll affordance.

**Checked because it was a real risk:** the header bar is `items-baseline`, so a
second nav row could have dragged the wordmark's baseline. Wordmark holds
`y=16` at all five widths.

### Why wrapping, and not a menu or a scroll affordance

Recorded because the alternatives were live options in NOTES since step 12.

- **A menu is a taxonomy decision dressed as a layout fix.** It must guess which
  screens are wanted in a shop, and it hides the answer behind a tap. Wrapping
  makes no claim about which links matter.
- **A fade or chevron announces the tail without making it reachable.**
  Horizontal scrolling is awkward one-handed, which is the §10 case exactly.

### `/suggestions` still has no nav slot — and the fix is not an argument for one

The step-14 decision stands on reasoning this change does not touch: it is not
an in-store screen, and arriving from `/want-list` frames the suggestion as
being ABOUT the want list in a way a top-level entry does not. **Removing the
width objection is not a positive case.**

There is also a measurement reason to keep them apart: the wrap is measured
against five links, and adding a sixth in the same unit would change the thing
and its subject at once.

### The dead `graph.spec.ts` pattern, removed

`playwright.config.ts`'s mobile `testMatch` still carried `/graph\.spec\.ts$/`.
**The file has not existed since §8 retired the screen** — the spec was deleted
and the pattern stayed, matching nothing.

Harmless to the runner, not harmless to a reader: that list is the config's own
spec-mandated record of what mobile covers, annotated SPEC-MANDATED vs
EVIDENCE-BASED, and a dead entry in it **overstates the coverage**. Same family
as the exempted-by-name rule this project already applies to counts — an
exemption or an entry that nobody can trace back to a file is invisible.

`nav-mobile.spec.ts` added in its place, under EVIDENCE-BASED: the whole spec is
about 390px and would not execute at all without an entry there.

**Still not in the mobile matrix, and it belongs to the next wall unit:**
`wall-scene.spec.ts` and `shelf.spec.ts`. See the wall entry above.

## Step 15 unit 3 — the instrument for the phone-default question

§10b leaves the question open by name: *"Whether a phone should default to the
shelf at all is genuinely open and belongs to step 15's mobile pass, which is
the first time the wall will be judged at 390px."*

**This unit built no fix.** It produced a way to look at the wall and the table
side by side at 390px, on a real phone, **with the panel overlap left visible**
— a tidied version would flatter the answer to the question being asked.

### Why a phone and not device emulation

Chrome DevTools' device mode dispatches touch events, but it also delivers a
`pointermove` stream from the mouse. The finding under judgement is that **every
affordance on the wall is hover-driven** (tilt, proud-on-hover, the hover card
that is the wall's only channel for artist/title/year/label). Emulation supplies
exactly the input a phone does not, so it would report the wall as working.

The instrument has to be the thing it is measuring. Dev server bound to
`0.0.0.0`, reached over the LAN.

### The compare page is two iframes onto the REAL routes

`public/zz-compare.html`, 390x844 frames loading `/` and `/?view=table`.
Deliberately not a mock: a compare page that re-implemented either view would be
showing a drawing of the app rather than the app. Below 861px it shows one frame
at a time with a switcher, because two 390px frames do not fit on a 390px phone.

**It is behind the middleware like everything else** (§3), and that is correct
rather than an obstacle — the session cookie applies to it once logged in.
`secure` is false in development (`session.ts:82`), so the cookie sets over
plain http on the LAN.

### The verification caught an instrument defect, which is the point of verifying

First check failed: **no canvas in the wall frame.** The cause was not the
iframe — the canvas was missing at 390px directly too — it was that the E2E
test database is EMPTY, because unit 1's `afterEach` cleanup now deletes what
each spec creates. The page reported `0 records` and drew no wall.

So the instrument was fine and the environment was wrong. Re-verified with 60
seeded records: **canvas 356x1488 inside the 390px frame, table 50 rows.**

Recorded because the failure mode was indistinguishable from a broken viewing
aid, and shipping it unverified would have had the developer judging an empty
wall and concluding the wall was broken. **An unverified instrument is worse
than no instrument** — the same lesson as the hook that never fired and the
mutation that did not fully apply.

Note for whoever next writes a probe against E2E: **the test database is empty
between runs now.** Seeding is no longer optional for anything that needs a
populated collection to be visible.

### What the developer is judging, and the constraint on the answer

Not "is the wall bad on a phone" but **"which of these two do I want when I open
the app standing up"** — §10's record-shop case.

§10b already fixes the shape of whatever is decided: **if it is gated by width,
the gate goes on the default and not on availability.** A view a URL can reach
must stay reachable, so a `?view=shelf` link shared from a desktop still opens
the wall on a phone.

`public/zz-compare.html` is scaffolding and comes out when the question is
answered.

## DECIDED: the wall stays the phone default. No width gate.

2026-08-20, step 15 unit 3, by the developer after looking at both views at
390px. §10b's open question — *"Whether a phone should default to the shelf at
all"* — is **closed: it does.**

**§10b's conditional clause is now moot and should not be read as pending.** It
said "if it is gated by width then, the gate goes on the default and not on
availability". Nothing is gated, so no gate exists to place. `?view=table` and
`?view=grid` remain reachable exactly as before, which was never in question.

What this settles for the units that follow: **the panel overlap and the missing
touch drag are defects on the FIRST SCREEN of the app on the device §10 calls
primary**, not on a deliberately-reached view. That is the reading that makes
them worth fixing rather than tolerating, and it was the whole reason this
question was taken before them.

## DECIDED: on a phone the panels STACK, they do not flank

The fix for the 462px-in-390px overlap, decided from the reference rather than
derived from the arithmetic.

**Criterion's own mobile answer**: the case at full width, the facts card
BELOW it, and the arrows overlaid on the artwork. **The vertical axis carries
what the horizontal cannot.** A phone has 844px of height and 390px of width, so
the panels move to the axis that has room.

This is not the same as "shrink the panels". Two 390px-wide panels stacked under
a full-width record is a different layout from two narrow columns flanking a
smaller one, and the second is what fitting `w-[210px]` and `w-[180px]` into
390px would produce — a record squeezed to nothing between two columns of text.
**The record keeps the width; the facts go underneath.**

Note the arrows are 13b (§10b, "arrows move through the collection without
putting the record back"), triggered on this step and not yet built. The
reference overlays them ON the artwork, which is a placement decision 13b
inherits rather than one it has to invent.

### FOR WHENEVER THE SHELF CONTROLS GET THEIR MOBILE TREATMENT

Observed on thecriterioncloset.com at 390px, recorded now because the
observation is cheap and re-deriving it is not:

**Their controls collapse to icon circles in a floating row, while the view
toggle stays as TEXT.** Two different treatments in one control cluster, and the
split is not arbitrary — an icon is fine for an action whose meaning is
recoverable from context, and a view toggle names mutually exclusive STATES,
which an icon cannot distinguish without the user already knowing.

Ours today: `ShelfControls.tsx`'s disclosure button is text with a filter count,
and the `ViewToggle` is `hidden ... sm:flex` (`CollectionFilters.tsx:118`) —
absent on a phone entirely, which §10b permits ("only the view *control* is
hidden on narrow screens"). Now that the wall is confirmed as the phone default,
whether that remains right is a live question rather than a settled one: the
control that switches away from the default is the one a phone user might most
want.

Not a decision. Recorded for the unit that touches those controls.

## `z.string().min(1)` on APP_PASSWORD_HASH — presence where shape was needed

Found 2026-08-20, step 15 unit 3, by being unable to log in on a phone.
**Recorded rather than fixed** (CLAUDE.md §4): the env fix that unblocked the
session was a value in an untracked file; this is a defect in `schema.ts` and
gets its own unit.

### What happened

`.env.local` held `APP_PASSWORD_HASH=\$2b\$12\$...` — a bcrypt hash with its
three `$` signs **backslash-escaped**. That is shell syntax, correct inside
double quotes in a terminal and wrong in a `.env` file, which is read literally.
63 characters where bcrypt is exactly 60.

**It presented as a wrong password.** `bcrypt.compare` returns `false` for a
malformed hash rather than throwing, so every login attempt — phone and desktop
alike — failed the way a typo fails. Measured both ways before concluding:
compare against the escaped form `false`; unescaped, the value is exactly 60
chars, matches `/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`, and `getRounds` reads
12. The underlying hash was intact the whole time. **No password could ever have
matched it.**

### The defect

`src/lib/env/schema.ts:47`:

    APP_PASSWORD_HASH: z.string().min(1),

Any non-empty string passes, including a 63-character shell-escaped one.

**The discipline exists in this very file and this line missed it.** The two
lines immediately below carry a floor AND its reasoning:

    // 32 chars is the floor for a signing key that is not trivially brute-forced.
    SESSION_SECRET: z.string().min(32, 'must be at least 32 characters'),
    CRON_SECRET: z.string().min(32, 'must be at least 32 characters'),

So this was **missed rather than considered** — which matters, because it means
the fix is applying an existing standard rather than inventing one. The variable
whose format is the most rigidly fixed and the most cheaply checkable
(`$2[aby]$NN$` + 53 chars from a known alphabet) is the one validated least.

### THE GENERALISATION — second instance, and R5 found the first

**An is-configured check that tests PRESENCE rather than SHAPE cannot
distinguish a missing credential from a broken one, and both then fail at the
point of use, where the symptom names something else.**

| | R5 finding F1 | this |
|---|---|---|
| predicate | `isAnthropicConfigured` tested non-empty | `z.string().min(1)` |
| what sailed through | a placeholder API key | a 63-char shell-escaped "hash" |
| symptom at point of use | a 500 | "wrong password" |
| what the symptom named | the route | the user's typing |

Two integrations, one weak predicate, both failing silently and both blaming
something other than the configuration. That is what makes it a class rather
than two bugs: **the cost is not the invalid value, it is that the error surfaces
somewhere that misdirects.** A user who cannot log in retypes their password; a
developer seeing a 500 reads the route handler. Neither looks at an env file
that "is set".

Note the direction: this is NOT an argument for validating every string. It is
an argument for validating the ones with a **known, fixed, machine-checkable
format** — which is a small set, and bcrypt hashes and API-key prefixes are both
in it.

### The fix, when it is built

    APP_PASSWORD_HASH: z.string().regex(
      /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
      'must be a bcrypt hash (60 chars, $2b$NN$...); check for shell-escaped $ signs',
    ),

The message names the actual failure seen here, because "invalid format" would
have sent the next person to regenerate a hash that was already correct.

TDD path is clean and needs no carve-out: the escaped 63-char string is the
failing case, a real hash is the passing one, and both are pure-function tests
against `parseEnv`. **Check `edge.ts` too** — `schema.ts:50` says the Edge subset
must apply the same floor and a test asserts it, so the same question applies to
whatever that subset contains.

### TRIGGER: R6, deploy readiness

R6 already owns every secret's path from `.env.local` to Vercel, which is
exactly the journey that re-introduces this: **a hash pasted into a Vercel
environment variable through a shell, a CI script, or a dashboard field that
escapes differently.** On production the blast radius is total — a malformed
hash means nobody can log in at all, and the symptom is still "wrong password",
now with no local database to check it against.

The npm-audit observation above is already triggered on R6 for the same reason
(what ships to a host somebody else runs). These two travel together.

## A 403 on a JS chunk became a credential disclosure

Found 2026-08-20, step 15 unit 3, trying to reach the dev server from a phone.
**This is the finding of the unit, and it is not about Next's config.**

### The chain

1. Dev server reached at `http://192.168.86.95:3000` instead of localhost.
2. Next 16 blocks cross-origin requests to dev resources unless the origin is in
   `allowedDevOrigins`. The LAN address is not, so `/_next/static/chunks/*`,
   `/__nextjs_font/*` and `/_next/hmr` all returned **403**.
3. **The login page itself still rendered 200.** Only its JavaScript was missing.
4. A React form with no handler attached falls back to a **native GET submit**.
5. So the password went into the query string:
   `GET /login?password=<the password> 200`
6. Which put it in the **browser history** and, six times, in the **dev request
   log** — Next's own logger prints the request line, query string included.

**A missing script became a credential in a URL, and the page looked normal the
whole time.** No error, no broken layout; the form submitted and came back to
the login screen, which is indistinguishable from a wrong password. That is the
same misdirection shape as the entry above it — the symptom named the user's
typing, and the cause was three 403s in a network tab nobody had open.

### What it was NOT, measured rather than assumed

The obvious suspect was the middleware matcher (`/((?!_next/static/|...))`),
since it excludes some static paths and not others. **Wrong, and curl alone
would have "cleared" it for the wrong reason** — every one of these returned
200 from curl on both hosts, because curl sends no `Origin`.

The isolation that found it, varying one header at a time:

| request | result |
|---|---|
| LAN chunk, no extra headers | **200** |
| LAN chunk, `Origin: http://192.168.86.95:3000` | **403** |
| LAN chunk, `Origin: http://localhost:3000` | **200** |
| LAN chunk, `Referer` only | **200** |
| **localhost** chunk, `Origin: http://192.168.86.95:3000` | **403** |

The last row is the one that settles it: the same block fires **on localhost**
when the Origin is the LAN address. So it is not the network, not the host, not
the matcher — it is an **origin allowlist**, and the developer's framing
("localhost vs LAN") would have pointed at the wrong axis. Confirmed afterwards
against the server's own log, which names the blocked chunks.

**Reproducing a browser failure with curl needs the browser's headers.** A bare
curl said everything was fine while the browser was being refused.

### The fix

`next.config.ts`: `allowedDevOrigins: ['192.168.86.95']`.

Config, so CLAUDE.md §2's carve-out applies — the verification is a **command
that must succeed**, not a unit test. Proving command and result: the chunk that
403'd returns **200** with the LAN `Origin`, the font likewise, and the new dev
log carries **zero** blocked-origin warnings.

**Read only by `next dev`** — no effect on `next build` or `next start`, which
is why it is safe to commit rather than keep as a local edit. `npm run build`
accepts it without warning, which is the check that it is a recognised dev-only
key rather than an ignored one.

Scoped to one host, not a wildcard: any origin that can reach the dev server can
otherwise read its source, and a wildcard would hand that to anything else on
the same Wi-Fi.

**If the LAN address changes, this breaks and the symptom is the
credential-leaking one above.** DHCP can reassign it. The tell is 403s on
`/_next/static/*`; the fix is to update the list.

### The password

Six copies existed, **all in one captured dev log** in the session scratchpad.
Redacted in place, verified zero remaining, and a re-scan of the repo, git
history (`git log -S`), `test-results/`, `playwright-report/` and Next's
persistent `.next/dev/logs/` found **no other copy**.

**The app did not leak it.** `src/app/api/auth/login/route.ts` has no logger
call and the login page never reads `searchParams`; the framework logged the URL
the broken form produced. Worth stating precisely, because "the login route logs
passwords" would be a much larger defect than the one that exists.

Still in the phone's browser history, which is not reachable from here.
**Rotation is the right call regardless** — it transited a URL, and a URL is the
one place a secret is copied by default.

### A question this raises for R6, recorded not acted on

Next's dev request logger prints full query strings. In development that is
merely noisy; **the general rule it breaks is that credentials must never reach
a log**, and the app's own logger module is not what did it here. R6 owns the
production logging path and should confirm the deployed logger does not print
query strings — Vercel's request logs are a different surface from this one, and
the answer may already be fine. Not assumed either way.

## CORRECTION: the escaped `$` in .env.local was RIGHT, and unescaping it broke login

Written 2026-08-20, step 15 unit 3, correcting the entry above
("`z.string().min(1)` on APP_PASSWORD_HASH"). **The diagnosis in that entry was
half wrong and the remedy it implied was actively harmful.**

### What that entry claimed, and what is actually true

It said the backslashes were "shell syntax, correct inside double quotes in a
terminal and wrong in a `.env` file, which is read literally."

**`.env` files are NOT read literally. Dotenv performs variable expansion.** A
bare `$2b$12$<hash>` has `$2b` and `$12` substituted as empty variables, and
the route receives a **52-character** string beginning `<fragment>` — the leading
`$2b$12$` plus one char eaten. So:

| stored form | what the app receives | login |
|---|---|---|
| `\$2b\$12\$...` (escaped, 63 ch) | the correct 60-char hash | **works** |
| `$2b$12$...` (bare, 60 ch) | a 52-char fragment | **impossible** |

The escaping was a working convention, not a mistake. **`.env.test` uses it too**
and its logins pass — 250 E2E tests green — which was evidence available before
the change and not consulted.

### How the wrong conclusion was reached, and what would have prevented it

The bare hash was checked with `bcrypt.compare` **against the file's bytes**,
read directly with `readFileSync`. That returns `true`, because the file is
correct. **The file was never the thing under test — the loader was.** Every
check confirmed a fact nobody doubted while the failing path went unexercised.

What actually found it: logging `env.APP_PASSWORD_HASH` from inside the login
route — the value at the point of use. Length 52, prefix `<fragment>`, last four
matching the file's. Three theories died first (middleware matcher, `getEnv`
caching, a stale process), each plausible and each testable, none tested at the
point where the value is consumed.

**The general rule, and it is the same one as the wall entry above:** verify the
value where it is USED, not where it is stored. A config bug lives in the
journey, and reading the source of that journey confirms the departure rather
than the arrival.

### What this does to the `min(1)` finding — it strengthens it

The finding stands and its case is now better. A shape check
(`/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/`) would have caught **BOTH** failures:

- the escaped-63-char value, had it ever reached the app unexpanded;
- the 52-char expanded fragment, which is what the app actually received.

Both are "non-empty strings that are not bcrypt hashes", and `min(1)` waves
through each. **The validator's job is to reject what arrives, whatever mangled
it** — and note the correct fix validates the POST-expansion value, which is the
only one the app ever sees.

Trigger unchanged: **R6**, and it is now more clearly R6's problem, because the
Vercel dashboard is another loader with its own escaping rules and the same
symptom ("wrong password") on the far side.

### Also fixed in passing, and NOT caused by any of this

`/` returned 500: `column records.snippet does not exist`. Migration
`0015_records_snippet.sql` had never been applied to the Neon dev database —
the drift NOTES already records under "the tooling has no path". Applied by the
developer; verified afterwards rather than trusted, because drizzle prints
"migrations applied successfully" while applying nothing when a snapshot is
missing: **both columns present, both nullable, 125 records intact.**

### The password was rotated

The old one had transited a URL (see the 403 entry). New hash generated at cost
12, written escaped, and verified end to end against the running server —
**wrong password 401, correct password 200, session opens `/`** — rather than
asserted from the file. That verification is what caught the expansion bug; the
file-level check had already passed.

## DIAGNOSED, NOT FIXED: the pulled record fills 457% of the frame's width at 390px

Found 2026-08-20 on a REAL PHONE at 390px, step 15 unit 3. **Fix is unit 4.**
Nobody predicted it, and none of the three guesses made before measuring — the
plain-sleeve fallback at viewport scale, the record scaled to fill, the camera
inside the mesh — was right.

### The symptom

Tap a spine and the record does not render. Both panels appear correctly at
opposite edges with a gap between them; the space between and around them is a
flat pink field filling the whole viewport, and the wall is gone.

**Explicitly NOT the 462px chrome overlap.** The panels were not overlapping.
Same unexercised-at-390px cause, different defect.

The pink is not a fallback colour — there is no pink constant in the source. It
is the INTERIOR of a plain sleeve in a record's spine colour, magnified until
one flat region covers the frame.

### The root cause, measured on the real layout

`pulled-destination.ts` solves for the record filling `FRAME_FILL = 0.55` of the
frame's **HEIGHT**. That part is correct and viewport-independent by design: 436
units tall at every width, 55% at every width.

**Nothing constrains the WIDTH.** The camera is built with the aspect of the
WALL (`WallScene.tsx:293`, `width / height`), and the canvas is as tall as the
entire wall (`:247`, `height = layout.height`). So the aspect is not the
viewport's.

| | 390px | 1280px |
|---|---|---|
| canvas | 358 x 2976 | 1248 x 992 |
| camera aspect | **0.120** | 1.258 |
| cameraZ / recordZ / gap | 10588 / 9035 / 1552 | 3529 / 1977 / 1552 |
| frame at the record | **52.5 x 436** | 549 x 436 |
| record (240x240) fills | **457% width**, 55% height | 44% width, 55% height |

At 390px the wall is roughly **8x taller than wide**, so the frame at the
record's distance is 52.5 units across and the record is 240. The reader is
looking at the middle of a 4.5x-magnified sleeve.

**On a desktop the wall is wider than tall and the aspect hides it entirely.**

### WHAT NOBODY VARIED, and this is the transferable part

Unit A's destination test asserted **the same apparent size at 5 records and at
125** — the right axis for the defect it was chasing (a rise with no
destination, where the pose depended on which row a record came from), and the
wrong axis for this one.

**Nothing has ever varied VIEWPORT WIDTH.** Every test, every screenshot, every
judgement of the pulled record happened where the wall is wider than tall, which
is the exact condition under which this arithmetic is well-behaved. The bug does
not exist at any width the project has ever looked at.

Same family as the accumulation flake (nobody asked WHERE in the run failures
sat) and the nav (measured, written down, never executed): **a quantity that was
only ever tested along the axis it was designed to be correct on.**

### FOR UNIT 4 — `FRAME_FILL` IS ANSWERED BY LOOKING, NOT BY ARITHMETIC

Three candidates, and they are to be **rendered on the phone and judged
together, not separately**:

1. 55% of HEIGHT — as now.
2. 55% of the SMALLER dimension.
3. A fill computed from the VIEWPORT rather than from the wall.

**They interact with the panels-stacking decision** (recorded above): a record
sized for a tall frame leaves no room for a card beneath it. Judging the record
size without the panel under it answers a question the app does not ask.

Arithmetic can rule a candidate OUT (457% is not a judgement call) and cannot
rule one IN — "does this read as a record in your hands" is §10b's own standard
and it is visual.

### FOR UNIT 4, FIRST: THE INSTRUMENT DISAGREES WITH THE DEVICE

**Chase this BEFORE building anything, because it is the bigger problem.**

At 390px in Playwright/chromium, tapping a spine produced **no facts panel**. On
the real phone at 390px, **both panels appeared**. Same width, different
behaviour.

**The geometry is a wrong number; this is a wrong instrument.** If the emulator
and the device disagree about behaviour at the width the unit is about, then
every test written for that unit measures something other than what the
developer will see — and the unit would be verified green against a lie.

This is the concrete form of the argument for judging on a real phone rather
than in device emulation (recorded above under the touch-affordance survey): the
emulator supplies input a phone does not. It has now produced a measurable
behavioural difference, so it is no longer a theoretical objection.

Do not write unit 4's tests until this is resolved. The candidate explanations
worth separating — emulated click vs real tap, canvas height, hit-testing
against a 2976px-tall buffer, timing — are for that investigation, and
**none of them should be assumed**; three guesses were already wrong today.

## RESOLVED: there was no instrument disagreement. My probe missed the spine.

Step 15 unit 4, first question, and it is **withdrawn rather than answered**.

### What was claimed

That Playwright at 390px showed no facts panel on tap while the real phone
showed both — and therefore that every mobile test from here would measure
something other than what the developer sees. It was recorded as outranking the
geometry defect: "a wrong number is a wrong number, but a wrong instrument
invalidates the tests."

### What was actually true

**The probe clicked a fixed coordinate at x = box.x + 30. The first spine at
390px is at offset 44.** It hit empty wall, which dismisses rather than pulls,
and the absent panel was correct behaviour reported as a defect.

`wall-scene.spec.ts` already solved this and the helper says why — `clickASpine`
walks the row in 12px steps until `data-pulled` is non-empty, because "hit
testing is a raycast now, so there is no element to target and a fixed
coordinate is a guess about where the packing put a spine." Spine widths vary
17-24px from the record id, so the guess is not even stable between runs.

**I wrote a worse instrument than the one already in the repo, then blamed the
platform for its result.**

### Measured, with the proven helper and a real touchscreen

| project | hasTouch | width | mouse | tap | facts panel |
|---|---|---|---|---|---|
| chromium | false | 390 | hit @44 | n/a | **true** |
| chromium | false | 1280 | hit @20 | n/a | **true** |
| iPhone 13 | true | 390 | hit @44 | **hit @44** | **true** |
| iPhone 13 | true | 1280 | hit @32 | **hit @32** | **true** |
| WebKit + hasTouch | true | 390 | hit @44 | **hit @44** | **true** |

**Tap and mouse behave identically, at both widths, on every profile.** The
emulator and the device agree. The pull path works on touch, which was already
predicted (prediction 3) on the grounds that `onClick` is a `MouseEvent`
handler and a tap synthesises a click.

### What this does NOT overturn

The touch findings stand, because they are about different handlers:

- **Zero touch handlers in `src/`** — still true, verified by grep, and the tilt
  still binds `pointermove` only (`WallScene.tsx:1214`). The pull works because
  it is a CLICK handler; the tilt and drag are not.
- **The 457% width overflow** — unaffected, measured from the real layout.

The phone screenshots remain the primary evidence for the geometry defect, and
nothing about them is in question.

### FOURTH IN THE FAMILY, AND THE FIRST WHERE THE RIGHT INSTRUMENT ALREADY EXISTED

That distinction is the whole value of this entry. The other three were
instruments that were WRONG:

| # | instrument | what it reported on |
|---|---|---|
| 1 | a `sed` mutation that matched one indentation | a mutation that half-happened |
| 2 | a hook that never fired | nothing, silently |
| 3 | `npx playwright test \| tail -8` | `tail`'s exit code |
| **4** | **a fixed click coordinate** | **empty wall, against a raycast** |

The first three had no correct version sitting beside them. **This one did.**
`e2e/wall-scene.spec.ts` contains `clickASpine`, whose comment states the exact
failure mode I then walked into: *"Hit testing is a raycast now, so there is no
element to target and a fixed coordinate is a guess about where the packing put
a spine. Spine widths vary 17-24px from the record id ... so that guess is not
stable between runs — which is exactly how a test passes for a while and then
flakes."*

So the cost was not a missing technique. It was **writing a new probe without
reading how the existing tests solve the same problem** — and a new instrument
arrives with none of the old one's scar tissue, which is precisely what that
comment is: scar tissue, written down, ignored.

**The rule this yields:** when probing behaviour the suite already exercises,
start from the suite's helper. If the helper looks over-complicated, that
complexity is a record of what went wrong before.

### The lesson, which is the one this project keeps relearning

**Before concluding that a platform disagrees with itself, check that the probe
did what it claimed.** Same family as three entries already here: the mutation
that only half-applied and was read as thin coverage; the hook that never fired;
the exit code that belonged to `tail`. Every one of them was an INSTRUMENT
reporting on something other than the thing under test, and every one produced a
confident wrong conclusion that survived until someone checked the instrument.

The tell was available and unread: **the repo already contained a helper whose
comment explains exactly why a fixed coordinate fails here.** A probe written
without checking how the existing tests solve the same problem is a new
instrument with none of the old one's scar tissue.

**Cost: one commit's worth of NOTES asserting a wrong instrument, and a unit
ordered around it.** Cheap because it was checked first, which is the argument
for checking the instrument before building on it — the order was right even
though the finding evaporated.

## The desktop wall CHANGES under a viewport aspect — the arithmetic was silent about it

Step 15 unit 4. **Caught by rendering, exactly as the developer predicted it
would be**: "B being analytically a no-op at 1280 is exactly the kind of claim
that wants a picture."

### What the arithmetic said, and what it was actually about

Candidate B (fill the smaller frame dimension) reduces to candidate A on any
landscape aperture, because `min(1, aspect)` is 1 there. That is true, it is
asserted in `fill-candidates.test.ts`, and **it is a claim about the FILL RULE
only.**

The blast radius is not in the fill rule. It is in the **aspect swap itself**,
which the fill comparison never touched because both candidates take the aspect
as a given.

### Measured, by swapping the aspect in the live scene and screenshotting

    camera aspect = width / height of the WALL   (before)  1248/992 = 1.258
    camera aspect = viewport                      (after)  1280/900 = 1.422

At 1280 the wall is 1248px wide and the canvas is its own size, so the wall
EXACTLY fills a frame built from the canvas's ratio — 100% of it. Under the
viewport's ratio the frame becomes 1411 units wide for the same 992 of height,
and the wall fills **88%** of it.

**Rendered, the difference is obvious and is not subtle:** the wall is inset
with black margins left and right, the spines are wider, the shelf planes stop
short of the edges, and row 2 shows 74 spines where it showed ~99. The wall no
longer owns the window, which is A24a's requirement ("below the nav there is the
wall and nothing else").

### Why: the canvas is NOT the viewport, and the wall is sized to the canvas

`renderer.setSize(width, layout.height)` makes the canvas as tall as the whole
wall and as wide as its container. The camera frames `wallHeight`, and the wall
is drawn at exactly canvas dimensions in world units. **So the canvas's own
ratio is the one that makes the wall fill the frame** — using anything else
letterboxes it.

That is why the "wrong" aspect looked right on desktop for the entire life of
the feature: at 1280 the canvas ratio and the viewport ratio are close (1.258 vs
1.422), so the letterboxing was small enough to read as intentional margin. At
390px they diverge by a factor of four and the pulled record breaks.

### THE FIX IS NOT A ONE-LINE ASPECT SWAP, and that is the finding

Both quantities are load-bearing and they are not the same quantity:

| consumer | needs | why |
|---|---|---|
| the WALL | the CANVAS's ratio | the wall is drawn at canvas dimensions; anything else letterboxes it |
| the PULLED RECORD | the VIEWPORT's ratio | it floats in front of the camera and is judged against the screen |

One `PerspectiveCamera` currently serves both. **The unit's real question is how
to give the pulled record a viewport-shaped frame without relettering the wall**
— a second camera for the record, a canvas clamped to the viewport with the wall
scrolled by other means, or the record's destination solved against the
viewport while the camera keeps the canvas ratio.

Not decided here. Recorded because the one-line change was tried, measured,
photographed and **reverted** — `viewportAspect` is exported and tested and is
deliberately NOT imported by `WallScene.tsx`.

### Method note: the arithmetic was right and answered a narrower question

`distanceFillSmaller(DESKTOP) === distanceFillHeight()` to nine decimal places.
No test was wrong. The claim "B is a no-op at 1280" was TRUE and was heard as
"changing the aspect is a no-op at 1280", which is a different sentence.

**A proof about one variable says nothing about the change that introduces it.**
The picture is what separated them, and it took one screenshot.

## A page that told the truth in text and a lie in pixels

Step 15 unit 4. **Fifth in the instrument family, and the second this session
where the measuring device was the thing that was wrong.**

### What happened

The three fill candidates were rendered side by side on `/plane` for judgement
by eye. On a real phone they were **indistinguishable** — A is meant to be 119%
of the frame's width, B 55%, C 86%, which on a 390px screen is an overflowing
record, a small one and a large one.

Measured rather than adjusted, because the developer's hypothesis was specific:
"if all three compute the same aspect, they are measuring their own container
rather than the window."

| candidate | wrapper (the comparison's sizing) | canvas RENDERED | host ratio |
|---|---|---|---|
| A (119%) | 405 x 405 | **273 x 273** | 1.000 |
| B (55%) | 187 x 273 | **273 x 273** | 1.000 |
| C (86%) | 292 x 292 | **273 x 273** | 1.000 |

The wrappers differ exactly as intended. **Every canvas renders identically.**

### Why

`BoxCanvas`'s `fill` branch hardcodes its own geometry:

    className="pointer-events-auto aspect-square w-[min(70vw,70vh,560px)] shrink-0"

At 390x844 that is `min(273, 590, 560)` = **273px** — a viewport-derived
constant, the same for all three, overriding whatever container it is placed in.
At 1280x900 it is `min(896, 630, 560)` = 560px, again identical for all three.

**`aspect-square` is the harder half.** It means `BoxCanvas` cannot represent a
non-square frame AT ALL, so every candidate was square before any fill rule was
applied. The component could not express the thing under study.

### THE FINDING: a label computed from the same source as the render is not evidence

The captions were CORRECT. "119% wide · 55% tall · OVERFLOWS" was accurate
arithmetic printed beside a render showing nothing of the kind. The page told
the truth in text and a lie in pixels, and the text was the more confident of
the two.

Had the developer trusted the caption over their own eyes, a fill rule would
have been chosen on the strength of a label describing a render that did not
exist.

**The practical rule:**

> A label computed from the same source as the render is not independent
> evidence. When the two are computed SEPARATELY, disagreement is the whole
> signal — and it is the only thing that catches a renderer ignoring its input.

Here they were not independent in the way that mattered: both the caption and
the wrapper came from `occupancy()`, and the renderer downstream ignored the
wrapper. Two agreeing numbers from one source, one silent third party. The
comparison would have been trustworthy if the caption had been derived from the
CANVAS's measured size rather than from the arithmetic that was supposed to
drive it — that version reads "273 x 273" under all three and the defect is
visible immediately.

### It is the ORIGINAL DEFECT, reproduced inside the instrument built to study it

Structurally identical, one level up:

| | takes | needs |
|---|---|---|
| `WallScene` (the bug) | the WALL's ratio | the viewport's |
| `FillComparison` (the instrument) | computes the viewport's ratio correctly, hands it to a child that **substitutes its own box** | the child to accept the container's geometry |

Box-versus-viewport twice, in the code and in the thing measuring the code.

### Sequencing, decided by the developer and worth recording as a rule

The `BoxCanvas` change is **its own step, not folded into the comparison** —
because that same `fill` branch renders the pulled record on `/`. It is a change
to the live scene wearing scaffolding's clothes, and the order is:

1. Change `BoxCanvas` to take geometry from its container.
2. **Verify `/` is pixel-unchanged at 1280 AND 390 by RENDERING** — not by
   arithmetic, which is the mistake this unit has already made twice (the
   "B is a no-op at 1280" proof, and this).
3. Only then rebuild the comparison on top of a component that can express a
   non-square frame.

**The test that matters: the component renders a NON-SQUARE frame when given
one, and it must fail against today's `aspect-square`.**

## Step 15 unit 4 step 1: `BoxCanvas` takes its geometry from its container

### The change

`fill`'s branch read `aspect-square w-[min(70vw,70vh,560px)]` and now reads
`h-full w-full`. The "fits the screen" rule moved OUT to `RecordCanvas`,
byte-identical, because the caller is the only thing that knows what it is
placing the record into.

### A CORRECTION: this was NOT the live scene, and I said it was

Recorded because the wrong claim drove the plan. I told the developer that
`fill` renders the pulled record on `/`, and the sequencing — its own step,
render-verified — was built on that.

**`WallScene` does not use `BoxCanvas` at all.** It imports `RISE_MS` and
`prefersReducedMotion` and builds its own mesh. `fill` has exactly two callers:
`RecordCanvas` (reachable only through `Shelf.tsx`, which nothing imports — the
retired CSS path) and the workbench comparison.

Verified by RENDERING rather than by grep, at both widths with a record pulled:

    [390]  BoxCanvas elements=0  canvases=1  wallScene=1  facts=1
    [1280] BoxCanvas elements=0  canvases=1  wallScene=1  facts=1

**The instruction to treat it as live and verify by rendering was still right**
— it is what converted an assertion into a measurement, and the measurement went
the other way. Cheap insurance against a claim that was wrong.

### `/` is pixel-unchanged, and the FIRST comparison was invalid

Four screenshots, wall and pulled record at 390 and 1280: **byte-identical**.

**The first attempt at this comparison was worthless and is worth recording.**
The "before" images came from a run against the TEST database and the "after"
from the DEV database — different records, so different pixels no matter what
the code did. `cmp` dutifully reported differences and none of them meant
anything.

Redone properly: stash the change, capture, restore, capture. Same database,
same records, only the code differing. **A before/after where something other
than the change also differs is not a before/after** — the same family as the
half-applied mutation, and it would have reported a regression that did not
exist.

### The full run caught TWO failures a spec-scoped run did not

Both mine, and neither visible in the file the unit opened:

1. `box-canvas-geometry.spec.ts` — **both tests, "element(s) not found"**.
2. `cover-unlit.spec.ts` — "the canvas must have a measurable box to click into".

**The cause is one thing.** `/plane`'s components are gated on
`records.length > 0`, and **the E2E database is now empty between specs** because
of step 15 unit 1's per-spec cleanup. Measured directly: `probe: 0,
comparison: 0, canvases: 0`. My spec assumed a populated database, and
`cover-unlit` — which passes in isolation — tripped over the state my spec left.

Fixed in the SPEC, not the page: seed two records through the API in
`beforeEach`, narrow the workbench with `?artistId=`, clean up in `afterEach`.

**This is the second time this session that unit 1's cleanup has surprised
something.** The first was a probe reporting an empty wall as a broken wall. The
standing note bears repeating in bold: **anything touching `/plane` or `/` in
E2E must seed its own records — an empty database is now the default, not an
edge case.**

It is also the cross-spec collision NOTES set a trigger for, in a milder form:
not two specs colliding on content, but one spec's ABSENCE of setup breaking its
neighbour. Worth watching whether the stronger form appears.

### Step 3: the comparison rebuilt around the question being asked

The developer stated it precisely: *which size makes the record read as the
thing I pulled out, with its facts legible beneath, on a screen I am holding* —
**one question about a PAIR**, not two about a record and a card.

The first version failed that on its own terms even before `BoxCanvas` ignored
it: three shrunken frames side by side in a scrolling column. A record at 55% of
a 340px preview is not a record at 55% of a phone, and "does this read as the
thing in my hands" cannot be asked of something the size of a stamp.

Rebuilt as **one candidate at a time, full-bleed at `min(78svh, 780px)`, real
card beneath, switcher fixed at the bottom** — thumb-reachable per §10, one tap
apart so they compare by flicking rather than by memory.

**The caption now carries TWO numbers from TWO sources**: the intended
percentage from `occupancy()`, and the MEASURED percentage read back off the DOM
after layout, with a visible `← DISAGREE` when they part. That is the finding
above turned into a mechanism — the previous page printed one number twice and
called it agreement.

**And the bar the developer set for it: if the three still look alike on a phone
after this, that is a THIRD instrument failure and the comparison gets rethought
rather than the numbers adjusted.** Recorded so it is not quietly relitigated.

## The instrument must be judged on the device that judges it

Step 15 unit 4. **The sharpest form of this unit's recurring failure, and it
arrived one level out from the last one.**

### The measurement

The fill comparison's frame is `min(78svh, 780px)`. Measured on two devices,
same page, same candidate C:

| device | frame | C measured |
|---|---|---|
| desktop Chrome, 390x844 viewport | 340 x 656 | **40%** of frame height |
| the developer's phone, 390x844 | (taller `svh`) | **54%** of frame height |

`svh` resolves against the browser's small-viewport height, and a phone's
differs from an emulated 844px window — toolbars, safe areas, and the fact that
`svh` is a device property rather than a CSS constant.

**So a number chosen on the desktop would be wrong on the phone.** The
comparison is for choosing a value by eye; if the preview frame is not the shape
of the frame the value will act in, the value chosen produces something else.

### It is the SAME class as the defect under study, one level out

Three instances now, each nested inside the last:

| level | the frame used | the frame needed |
|---|---|---|
| the bug | the WALL's aspect | the viewport's |
| the instrument (v1) | `BoxCanvas`'s own box | the container's |
| **the instrument (v2)** | **the DESKTOP's `svh`** | **the judging device's** |

Every one is "a frame that is not the frame under study". The third is the
hardest to see because the page is correct on the machine that built it.

**The rule: the instrument has to be judged on the device that judges it.**
Not merely rendered there — MEASURED there. A reading taken on the developing
machine is a reading about the developing machine.

This is why the per-device numbers now print on the page itself: the phone
reports its own frame, and a desktop reading is visibly a different one rather
than silently standing in.

### Two caption bugs, both found by the page's own DISAGREE check

1. **Width resolved against the PADDED content box.** The frame is 340px wide
   with 16px padding a side, so `width: 86%` resolved against 308px and the
   caption divided by 340. Predicted exactly: 55% -> 50%, 86% -> 78%, both
   matching the measurement. Every candidate rendered ~10% smaller than its
   label claimed.

2. **The two height numbers were different quantities sharing a label.**
   `occupancy().height` is record / world-frame-height — a fact about the 3D
   frustum (240 in 436 = 55%). The measured value is a SQUARE CSS box over the
   CSS frame height, so its height follows its WIDTH. A frustum fraction and a
   layout fraction **cannot agree except by coincidence**, and the CSS frame's
   aspect (0.518) was not the viewport's (0.462) anyway.

Fixed by making the CSS frame the viewport's aspect, so both numbers describe
the same box, and by removing the padding from the measured frame.

**The DISAGREE mechanism worked**, and the credit is limited: it caught a fault
built into the same page one turn earlier. Its real value is that it caught it
BEFORE a number was chosen from it, which is the first time in this unit an
instrument reported its own fault rather than being caught by a person
distrusting it.

### What it costs the judgement already made

The developer's provisional read — A crowds the card, B is a thumbnail, C
closest — **stands, because it was a judgement about SHAPES that were really
drawn** (308 / 169 / 265px in a 340px frame; the ratios between them are
correct).

But it shifts: every candidate was ~10% small, so **a true 86% is larger than
the C that was liked**. If the corrected C crowds the card the way A did, that is
a different answer. Re-judged before anything is committed.

## `/plane` mounted 134 WebGL contexts against a real collection

Step 15 unit 4. Reported by the developer as "runtime type errors", which is
what it looks like from the browser:

    Uncaught TypeError: Argument 1 ('shader') to
    WebGL2RenderingContext.shaderSource must be an instance of WebGLShader

117 of them in one page load. **Not a type error** — `createShader` returns
`null` once a browser's cap on concurrent WebGL contexts (~16) is exceeded, and
three.js passes that null straight to `shaderSource`. The type error is the
symptom of exhaustion, several layers from the cause.

### The count

Measured directly: **134 canvases, every one holding a live context.**

| source | contexts |
|---|---|
| the composition block, `records.map` over the WHOLE collection | **125** |
| thickness candidates | 3 |
| geometry probe (added this unit) | 3 |
| fill comparison (added this unit) | 1 |
| wall, plane, rise demo | 3 |

### Why no test could ever have caught it

**The composition block was unbounded and had always been unbounded.** It is
harmless at any size `/plane` had ever been opened at — and it had only ever
been opened against E2E fixtures, which seed one or two records. Step 15 unit
1's per-spec cleanup makes that even more certain: the test database is now
EMPTY between specs.

So the defect required a real collection to appear, and nothing in the suite has
one. **This is the mirror image of the accumulation flake**: that one needed a
database that had grown too large, this one needs one that is never large
enough. Both are properties of test-data VOLUME that no assertion mentions.

Recorded as a standing hazard rather than fixed with a test: an E2E test that
seeded 125 records to prove a WebGL cap would take the cap as its subject and
cost a minute a run. The bound itself is the guard.

### The fix, and the honest attribution

`records.slice(0, COMPOSITION_LIMIT)` with `COMPOSITION_LIMIT = 8`. Measured
after: **134 -> 17 canvases, zero page errors**, comparison still live. Stable
under 18 candidate switches, so contexts ARE released on unmount and switching
does not leak.

**Pre-existing, and I made it reachable.** The unbounded map predates this unit;
what this unit did was add four contexts and then point the developer at
`/plane` with a 125-record collection open. Both halves are true and the second
is the one that turned a latent bug into a broken page.

**The cap is NAMED on the page**, per NOTES' rule about silent truncation:
"Showing 8 of 125 — each is a WebGL context and browsers cap those at about 16."
A limit nobody can see reads as *this is all there is*.

## The dev-server lock is on the DIRECTORY, not the port — and the fix is `distDir`

Step 15 unit 4, after the developer asked whether keeping a phone alive and
running the suite are mutually exclusive. **They were. They are not now.**

### The problem, stated properly

Next holds `<distDir>/dev/lock` and refuses a second `next dev` from the same
project directory **however it is addressed**. The suite's `webServer` runs on
3100 and the developer's server on 3000, and that made no difference: the port
was never the contended resource.

So every full E2E run required killing whatever was serving the phone. **Three
times in one session**, each costing a restart, and twice the developer
discovered it rather than being told.

### The fix

    distDir: process.env.NODE_ENV === 'test' ? '.next-test' : '.next'

`playwright.config.ts` already sets `NODE_ENV=test` on its `webServer` command
for an unrelated reason (loading `.env.test` instead of the developer's
`.env.local`), so the test server gets `.next-test` and its own lock for free.
Nothing else sets it: `npm run dev` and `npm run build` are untouched.
`.next-test` added to `.gitignore`.

**Measured, which is the only thing that settles it:** dev server PID 44373
before the run, `nav-mobile` passing on the mobile project, PID 44373 after, and
the phone's URL still serving 200.

### Why the alternatives lose

- **A git worktree** would have its own directory and its own lock, but needs
  its own `node_modules` and would test COMMITTED code — so a run would silently
  verify something other than the working tree. Worse than the problem.
- **`reuseExistingServer: true`** would point the suite at the developer's
  server, which loads `.env.local` and the REAL Neon database. The E2E suite
  truncates and seeds. That is a data-loss bug waiting to happen.

### The general shape, worth carrying

**"Two things cannot run at once" is a claim about a RESOURCE, and the resource
is worth identifying before working around it.** Three restarts were spent
treating the port as the conflict because that is what a port conflict looks
like from outside. The lock file names its own scope, and reading it took one
command.

## The LAN IP changed overnight and `allowedDevOrigins` was pinned to one host

Same session, the morning after. `192.168.86.95` -> `.98` by DHCP lease.

**The comment predicting this is in the file it broke.** It read: "If the LAN
address changes, this stops working and the symptom is the credential-leaking
one above." It did, it was, and the comment prevented nothing — **the second
time this session a hazard was written down and then walked into**, the first
being the nav measurement that survived three steps as prose.

The symptom was exactly as predicted: `/login` 200, its chunks 403, and a form
with no JavaScript falls back to a native GET submit carrying the password.

Fixed by widening to the private /24 the machine sits on
(`192.168.86.*`, plus `localhost` and `127.0.0.1`) rather than re-pinning a host
that will move again. That is the smallest thing that survives a lease change,
and it admits only devices already on this LAN — the same trust boundary
`--hostname 0.0.0.0` exposes anyway.

**A prose warning is not a control.** Both instances this session had the same
shape: the knowledge existed, was correct, was written next to the code, and
nothing executed it. The nav's answer was a test; this one's is a value that
cannot go stale.

## FIRST SIGHTING: `wall-scene.spec.ts:212` "settles CENTRED in view"

2026-08-21, step 15 unit 4. Failed once in a full run, passed on the next full
run and 17/17 in isolation.

    expect(Math.abs(settled.y), `${count} records: vertically centred`)
      .toBeLessThan(0.05);

**Recorded as a first sighting rather than dismissed as flake**, because NOTES
has no prior entry for it. The existing `wall-scene` entries are a different
shape: seeding VOLUME (it contributed ~620 of the 724 accumulated records) and
LOGIN-STAGE timeouts at `:900`/`:956`. This is neither — it reached its own
assertion and got a number outside tolerance.

| run | result |
|---|---|
| full suite, `--retries=0` | **failed** |
| full suite, `--retries=0`, immediately after | passed (254/254) |
| `wall-scene` alone | 17/17 |

**Not attributed, and specifically NOT called flake.** One failure in two full
runs is exactly the rate at which this project has twice been wrong in both
directions — the "clicking the active chip clears it" defect was read as flake
for three steps and was real, and the accumulation failures were read as
contention for eleven sightings. A single non-recurrence is not evidence of
absence.

**What would settle it, when it next fires:** the assertion is a POSITION at a
moment, so the candidates are a rise still in flight when it was read (a timing
problem that load makes likelier) versus a genuine off-centre settle at some
collection size. Those are distinguishable — read `settled.y` twice a beat
apart, and a value that MOVES is timing while a value that is stable and wrong
is geometry.

Worth noting the unit that would care: `pulledDestination` is under active
change (`viewportAspect`, the fill rule), and this test asserts exactly what
that code computes. **If it fires again after the fill rule lands, suspect the
change before suspecting the harness.**

## Step 15 unit 4 (continued): the card becomes a summary, and the size question dissolves

### The move, and why it is not a re-tune

A, B and C each answered "**how much of the frame should be RESERVED for
facts**", and every answer was a guess about content: the seeded record's card
was three lines with a void beneath, a fully-documented one would overflow the
same space. Nobody had rendered both against the same reservation.

A summary card has a **constant height**, so the reservation is knowable and the
question changes to "**how wide should the record be, given a known small
reservation**". The old candidates are answers to a question that no longer
exists — so they were re-derived, not re-tuned, and the tests for the old
question were DELETED rather than adjusted. A test kept past the question it
asks starts passing for a reason nobody chose.

New candidates, spanning the boundary the developer's read points at ("at least
A, possibly bigger"): **90% / 95% / 100% of frame width.** 100% is included as
the far side — a record touching both edges has no space to be in — so the
boundary can be seen rather than guessed.

### What the summary contains, and why not the spine's three fields

§10b puts **artist, title and catalogue number** on the spine. The summary is
**artist, title and RELEASE YEAR**, and the swap is the whole point:

- `release_year` is "the album's original release year, **not** this pressing's
  year" (§4, in those words). The spine's catalogue number identifies the
  PRESSING. So the two answer different questions — *what record is this* and
  *which copy* — and neither is recoverable from the other.
- It is the one of the four a collector cannot read off the object in their hand.

Artist and title repeat the spine deliberately: the pulled record shows its
COVER, not its spine, so a card that did not name the record beneath it would be
a caption for something else.

Plus a **count** — "11 more facts, the journal and prices" — because "More" is a
control that does not say what it does, and a count distinguishes a record with
nothing else recorded from one with a dozen fields. Zero is a real answer and is
said plainly (§10b: absence is fine).

### A decorative test, caught by mutation and corrected

The release-vs-pressing-year test was written against `recordSummary` and was
**vacuous**: `FactPanel` has no `yearPressed` field at all, because the choice
is made upstream in `factPanel`. A mutation making `recordSummary` read a
pressing year had nothing to read and all six tests passed.

CLAUDE.md §2's rule is to name the line a test would fail against. For this
distinction that line is `panel.ts`'s `year: record.releaseYear` — so the test
now asserts against `factPanel` and fails (3 assertions) when that line is
mutated.

### THREE bugs found by rendering, all the same shape as the unit's original defect

1. **`aspectRatio: 1` defeated the height clamp.** `recordSizeFor` computed the
   correct clamped size; a percentage width plus `aspectRatio` made the element
   593x877 in a 686px frame at 1280, pushing the card to 902px — **entirely
   outside the frame and invisible**. Fixed by sizing in explicit pixels, which
   the box it sits in cannot override. *A computed constraint silently
   overridden by CSS*, exactly like `BoxCanvas` ignoring its container.

2. **The reservation covered only the card.** It must cover everything below the
   record — the card, its margin, and the switcher's strip — or the card itself
   overflows.

3. **1553 lint errors from `.next-test`.** `distDir` gave the E2E server its own
   build directory and `eslint-config-next` ignores `.next` BY NAME, so lint
   began walking 765MB of generated output. Caught by lint rather than shipped;
   fixed with an ignore entry beside the existing `playwright-report` one.

### Measured

| | 390x844 | 1280x900 |
|---|---|---|
| frame | 342x740 | 976x686 |
| card height | **91px** | **91px** |
| record at candidate A | 306x306 (89%) | clamped by height |

**The constant-height claim, asserted against both extremes**
(`e2e/summary-card.spec.ts`): a record with nothing recorded and one with a
pressing, condition, price and date. **Both 90.5px**, with visibly different
content ("Nothing else recorded yet" vs "11 more facts"), and the fixtures are
asserted to DIFFER so the equality is not vacuous.

Mutation-checked by making the card render its full fact list: **90.5px vs
122.5px, caught.**

### Still open, and NOT decided here

- **Which width.** The developer judges on the phone; a desktop render is a
  desktop reading (NOTES, the per-device entry).
- **The desktop panel as a summary.** The prompt names this as the half most
  likely to be worse and it is: at 1280 the record is clamped by height and the
  frame is mostly empty around it. Reported rather than defended.
- **The aspect fix** — steer recorded: solve the destination against the
  viewport, leave the camera on the canvas ratio. Built after the size rule is
  chosen, since the destination arithmetic is what changes.

## The caption said 100%, the record filled 55% — a camera inside a box the sizing never reached

Step 15 unit 4, caught by the developer distrusting the caption against the
screenshot. **Fifth instance of this unit's one recurring failure**, and the
deepest yet: the frame the caption measured and the frame the record was drawn
in were two different frames, one inside the other.

### Measured

The `data-fill-box` element is at the frame edges — 1px gap each side, the
frame's own border. So the sizing worked: A's element is 306px, C's is 340px, at
90% and 100% of the frame.

**But the record inside fills only 55% of that element.** Scanned off a
screenshot: A's sleeve spans 170 of 306px (56%), C's 188 of 340px (55%). On
screen both records are ~55% of the frame and differ only in canvas size — which
is why they looked nearly alike and why C left black either side despite a "100%"
caption.

### Why: BoxCanvas has its OWN camera, and the sizing never reached it

`BoxCanvas.tsx:244` builds `PerspectiveCamera(30, …)` at `z = 3.4`, and the
record is a `BoxGeometry(1,1,depth)`. At fov 30 and z 3.4 the frame is 1.822
world units tall, so a 1-unit record fills `1/1.822 = 54.9%` — the measured
number exactly.

The comparison sizes the ELEMENT and the camera inside stays put, so the record
is 55% of whatever element it is given. **The width fraction was applied to the
box; the record lives one frame deeper, untouched.**

This is `WallScene` taking the wall's aspect, and `BoxCanvas` ignoring its
container, and the padded frame, and the per-device `svh`, all again: **a
quantity applied to the wrong box.** It keeps recurring because the scene has
genuinely nested frames — DOM element, canvas, camera frustum — and each fix
addresses one boundary while the next one waits.

### The fix

`BoxCanvas` takes a `frameFill` and sets its camera distance so the record fills
that fraction: `z = 1 / (2 · fill · tan(fov/2))`. Then sizing the ELEMENT and
sizing the RECORD are one operation rather than two that have to agree.

The default stays 55% (z 3.4), which is right for the wall's pulled record — it
sits back in a scene there. Only the comparison asks for more.

### What this cost, and the standing lesson

The developer caught it by eye against a caption they had learned not to trust —
this unit trained that distrust across four prior instances, and it paid off.
**When a page reports a number, the number and the render must come from the
same box or the report is fiction.** The caption's second source (measuring the
DOM) was correct about the DOM and blind to the frustum inside it.

## FIVE nested-frame failures in one unit, and the rule that falls out

Step 15 unit 4 hit the same defect five times, each on a different pair of
frames, each fixed in isolation before the next surfaced:

| # | the fraction was applied to | but the record lived in |
|---|---|---|
| 1 | the WALL's aspect | the viewport's |
| 2 | `BoxCanvas`'s own hard-coded `min(70vw,70vh)` | its container |
| 3 | the desktop's `svh` | the judging device's screen |
| 4 | the padded content box (308 of 340px) | the frame itself |
| 5 | the DOM element | the canvas, and the camera frustum inside it |

**The cause is one thing: nobody enumerated how many frames there were.** The
pulled record is a fraction of a chain — viewport → CSS frame → DOM element →
canvas → camera frustum — and each fix addressed the layer in front of it while
the next one down stayed wrong. The caption measured the DOM and was blind to
the frustum; the size rule sized the element and was blind to the camera; the
comparison frame used `svh` and was blind to the device. Every one was correct
about its own layer.

That is why the developer's learned distrust of the caption paid off five times:
a number computed from one frame and rendered in another agrees by coincidence
or not at all, and only the eye against the render — or a measurement that names
BOTH frames — catches it.

### THE RULE

**A size assertion must name which frame it is a fraction of.** "The record is
90%" is meaningless; "the record is 90% of the CSS frame's width, and fills its
DOM element, and the camera frames the element at 100%" is checkable, and its
checkability is exactly the three places a bug can hide.

**A chain of frames must have its layers listed before any of them is trusted.**
Had the five layers been written down at the first sighting, the other four
would have been four lines of a checklist rather than four separate
investigations across as many turns. The enumeration is cheap; discovering the
layers one failure at a time is what was expensive.

This is the same family as "verify the value where it is USED" (the env-var
entry) and "check the instrument did what it claimed" (the fixed-coordinate
probe): a quantity is only meaningful relative to a named reference, and the
reference is the thing that goes unstated and wrong.

## DECIDED: the record's presentation is width-dependent — §10b amendment owed

Full-bleed with a stacked summary card below a breakpoint; the flanking panel
above it. §10b currently describes the flanking panel as THE layout rather than
as the wide-screen one, so the amendment must say the presentation depends on
width — or R7 finds a spec describing one shape and an app with two.

**Why the fork, measured not asserted.** The record is square; a desktop frame
is landscape. At 1280 a full-bleed record clamps to HEIGHT at 51% of the width
and sits in a wide dark field with empty margins either side, the full-width card
stretched beneath it — a small square marooned in black. The phone's portrait
frame holds the same square large with the card under it. **Two amounts of room
want two shapes**; it is not a summary being worse than a panel, it is one model
right on a phone and wrong on a desktop that has room to put facts BESIDE the
record — which is what the flanking panel always was.

**Sequencing:** the phone side is finished, tested and judged (C, full-bleed,
summary card, the frame-fill fix). It ships as its own commit and does not wait
on the desktop design question. The desktop fork is its own unit, after — one
revert if either goes wrong. The §10b amendment is written when the desktop
shape is judged, covering both.

## CROSS-SPEC COLLISION, observed at last — the trigger NOTES set has fired

Step 15 unit 4. `summary-card.spec.ts` failed under the full suite and passed in
isolation, `expect(match).toBeDefined()` undefined at both call sites. **This is
the collision NOTES has waited for since step 15 unit 1**, which deferred
per-worker isolation "until a cross-spec collision is actually observed" — and
set the signature to watch for: "an assertion about page 1" broken by another
spec's data rather than by the volume of it.

### The mechanism, and a FIRST FIX that was wrong

The spec searched `/api/records?search=Full ${run}` and took the first-page
match. `/api/records?search=` matches title AND artist by trigram
(`records.ts:342-351`), and orders by similarity — so under the full suite a
record from another spec could outrank the target.

**The first fix — search by the unique `run` token, wider page — did not hold**,
and the reason is the instructive part. `record-detail.spec.ts` seeds an artist
`Sparse-<suffix>` and a title `Bare <suffix>`; the page snapshot at failure
showed `link "Bare dmt32k8rv4790 — Sparse-dmt32k8rv4790"`. My `run` token was a
trigram match for THAT record's artist name, and `.find(r => r.title === 'Sparse
' + run)` then found nothing because its title is "Bare". Searching by a token
unique to my records is not enough when the search also matches ARTIST names I
do not control.

**The real fix: address the records by ID.** `seedExtremes` returns the ids from
the create responses, and the tests navigate `/plane?recordId=<id>` directly. An
id cannot collide with another spec's anything. No search, no page, no ordering
— the three things that were load-bearing and shouldn't have been.

This is the seed helper's own lesson taken one step further: "deleted by artist
rather than by title pattern — the artist id is exact, a LIKE on a title prefix
quietly widens." A LIKE on a title prefix widens; a search that also spans artist
names widens further; only an id is exact.

### It does NOT re-open per-worker isolation, and here is why

The deferral's trigger was "a collision whose cause is another spec's DATA
rather than the volume of it". This IS that — but the cause is a QUERY that
assumed page 1, not two workers writing the same row. Cleanup lowered the volume
and this was hiding under it exactly as predicted; what surfaced is a test
making a page-1 assumption, which is fixed in the test.

Per-worker isolation answers a different question: two workers writing the SAME
content concurrently. That did not happen here — the collision was one spec's
query against another spec's legitimately-present rows. So the trigger fired for
the milder of the two forms NOTES distinguished, and the fix is a better query
rather than a schema-per-worker harness.

**The signature to keep watching** is unchanged for the stronger form: a failure
caused by two specs writing an IDENTICAL title or a shared `discogs_release_id`
at the same moment. That is still unobserved.

### Why the full run was needed to see it

Isolation passed both tests every time. Only the full suite puts another spec's
records in the collection, and only `--retries=0` keeps the failure visible
rather than retried away. **CLAUDE.md §10's "full E2E, no file argument" is
exactly the rule that caught this** — a spec-scoped run was green throughout.

## Step 15 unit 5: the desktop fork — spec first, then the aspect fix, then two shapes

### A32 written BEFORE the code

§10b described the flanking panel as THE layout; the phone side shipped a
stacked summary. So the spec described one shape and the app had two. A32
amends §10b to say the presentation is width-dependent — flanking above a
threshold, stacked summary below — written and applied to SPEC.md before any
layout code, per the project's rule through 31 amendments. R7's "spec against
the app" now finds a decision rather than a drift.

### The breakpoint is MEASURED, not md/lg

Derived from panel geometry, not screen-size convention: facts panel (210) +
gap + a readable record (320, its phone size) + gap + controls (180) + page
margin ≈ 806px, rounded to **820**. That is between Tailwind's `md` (768) and
`lg` (1024) and coincides with neither — at 768 the flanked record is 282px,
below the readable floor. `record-layout.ts` is the pure decision, and its test
asserts BOTH that 820 leaves the record its minimum AND that md would not, so
the choice of a measured threshold is a test rather than a comment.

Panel widths extracted to `panel-dimensions.ts` so the threshold derives from
the same numbers `Panels.tsx` renders — two producers of one width is how a
breakpoint reserving room for a 210px panel ends up beside a 240px one.

### The aspect fix, and an overcorrection caught by rendering

Agreed steer: solve the record's DESTINATION against the viewport, leave the
camera on the canvas ratio (a viewport aspect insets the wall, breaks A24a,
measured). `pulledDestination` now takes the viewport and pushes the record
back so its WIDTH fits, not just its height.

**First attempt overcorrected.** Fitting width at the wall's default 55% pushed
the record to distance 12905 — 7% of frame height, a distant speck, invisible
on screen. The live wall pull showed dimmed wall where the record should be.
Fixed by a `widthFill` of 0.9: near full-bleed, the record ≈320px on screen at
390px (its readable floor) rather than sitting back in the scene. **Caught by
looking at the live wall, not by the arithmetic** — the sixth time this unit's
"which frame" confusion surfaced, and again the render was the instrument.

Verified live: the magnified-sleeve overflow is gone, the wall reads correctly
(not inset), and the record is a visible square at both widths.

### The fork, and two bugs the screenshots caught

`WallScene` rendered `FactsPanel`/`ActionsPanel` flanking at every width — the
phone side lived only in the `/plane` scaffold, never the live wall. So this
unit wired the phone shape (summary card + full-bleed) INTO the live scene for
the first time, forked by `recordLayout(viewportWidth)`.

Two bugs, both found by rendering the live wall rather than trusting the markup:

1. **The stacked buttons were invisible** — `text-foreground` is theme-dependent
   and the panel ground is a fixed dark, so the labels rendered dark-on-dark.
   Fixed to `PANEL_TEXT.title`, the same the card uses.
2. **The record was a speck** — the aspect overcorrection above.

Both shapes verified live: phone stacks a full-bleed record over the summary
card with working Turn over / Put back; desktop flanks a centred record with the
full facts panel and actions. Desktop is UNCHANGED by the `widthFill` — width was
never its binding constraint.

### Server-render default

Until the width is measured on first client render, the flanking layout is
assumed — it is the desktop shape and the server markup is desktop-shaped, so a
phone corrects on hydration rather than a wrong default flashing the wrong
layout at every width.

## Step 15 unit 5, mobile: two coupled failures, diagnosed by scanning pixels

Reported by the developer against the live wall (both invisible on /plane and to
arithmetic). Measured on a 390px render, sleeve band scanned off the screenshot.

### Problem 1: the card is OVER the scene, not beneath the record in a column

There is no column. The record is drawn on the CANVAS, centred on the camera
axis (viewport centre). The summary card is an `absolute` element pinned to the
bottom of the `fixed inset-0` chrome container — the container built for the
FLANKING pair, which uses `align-items: center; justify-content: space-between`
to push two panels to the left and right edges with the record showing between.

The stacked card inherits that container and lands as a black block layered in Z
OVER the composited scene. Measured: record sleeve ≈261–582, dimmed wall
582–646, card 646–820, a sliver of wall 821–844. In Y they nearly abut, but the
card floats above the scene rather than the record sitting above the card — and a
band of dimmed WALL shows between them, which reads as the record and card being
two unrelated things stacked in depth. **The /plane comparison put the record in
a DOM box above the card in a flex column; the live wall puts the record on a
canvas and the card on an overlay, and those do not form a column.**

### Problem 2: the wall scrolls while a record is out

Measured `scrollY = 1295` with a record pulled. The rise scrolls the wall's
centre to the viewport centre once (`state.phase === 'rising'` effect), but
nothing holds it there. The record is fixed to the CAMERA; the wall scrolls
under it; they separate. On desktop the scrim is a full-viewport element but is
`pointer-events-none`, so it does not absorb scroll either — desktop simply
isn't touch-scrolled in the test. On touch a one-finger drag scrolls the page.

### THE DESIGN QUESTION for problem 2, reasoned rather than reflexed

Scroll-locking is one answer and not automatically the right one. Three
considerations:

1. **A pulled record IS a modal-ish state.** The wall is dimmed, the record is
   the subject, and "put back" is the way out. Modals lock the background scroll
   because scrolling a background you cannot interact with is disorienting. That
   argues for a lock.

2. **But the wall is not inert — it is frozen, and a frozen wall behind a record
   you can put back is a promise the wall is still THERE.** Locking scroll keeps
   the wall exactly where the record left it, so putting the record back returns
   it to the same slot in view. That is the continuity §10b's rise exists to
   establish, extended to the return. This also argues for a lock — a lock that
   FREEZES rather than one that hides.

3. **It interacts with the unbuilt touch-drag (§10b, still deferred).** §10b:
   "on touch it is dragged." A one-finger drag on the record must TILT it, not
   scroll the page — so the page-scroll-lock and the touch-drag are the same
   gesture boundary seen from two sides. Building the lock now without the drag
   means a finger on the record does nothing (no tilt yet) but also does not
   scroll (locked), which is correct-but-inert rather than wrong. Building the
   drag later then has a locked page to work against rather than a moving one.

**Decision: freeze the page while a record is out** — `overflow: hidden` on the
document with the scroll position PRESERVED, not reset. The wall stays exactly
where it was; the record is on the camera axis at that scroll position; putting
the record back releases the lock and the wall is where it was left. This is the
freeze of consideration 2, and it lays the ground the touch-drag needs rather
than fighting it.

**What this does NOT do:** it does not implement the touch tilt. A finger on the
record will not turn it until §10b's drag is built. That is honest — the record
still turns via the "Turn over" button, which is in both layouts — and the lock
is a precondition of the drag, not a substitute for it.

### Why problem 1's fix is not "just add flex-col"

The chrome container cannot simply become a column, because it holds the
FLANKING layout at desktop too and that needs the record centred with panels at
the edges. The stacked case needs its OWN container — the record's on-canvas
position and the card's DOM position have to be made to agree about a column,
which the flanking case explicitly does not want. So the fork has to reach
higher than swapping the panels: the stacked layout needs the record positioned
in the LOWER-UPPER of the frame with the card below it, which means the
destination's Y (currently the camera axis) is also part of the stacked shape.

Both fixes measured on the device, per the six prior times arithmetic looked
right and a screenshot did not.

### RESOLVED, and the lift was the SEVENTH "which frame" error

Both fixed, both after a screenshot contradicted a number.

**The scroll lock (problem 2): freeze on SETTLE, not on rise.** `useScrollLock`
pins the body at `-scrollY` (position preserved, not `overflow:hidden` which
jumps to top — mutation-tested: the overflow-only version fails the
position-unchanged test). But locking while `out !== null` froze the page during
the RISE, before the rise-scroll centred the record — so the record settled
off-screen against a frozen wall. Locking on `phase === 'settled' || 'flipping'`
lets the rise-scroll finish first. Asserted: scroll position identical across
pull and return, on the seeded wall.

**The column (problem 1): lift the stacked record, flanked untouched.**
`pulledDestination` gains a `layout` and lifts the record's world Y so the card
sits beneath it. The flanked case is asserted byte-identical (and the "unchanged"
test was itself caught passing vacuously on two NaNs — hardened to require a
finite Y first).

**The lift magnitude was wrong TWICE, both caught by rendering:**
1. A fixed 0.18 fraction of the frame clipped the record off the top — a lift
   that tracks neither viewport nor card height.
2. A screen-space lift that divided by `viewport.height` — but the record maps
   to the CANVAS height (2976px, the whole wall), not the viewport (844px), so
   the lift was 3.5x too large and still clipped. **The seventh instance of this
   unit's one bug: a quantity measured against the wrong frame.** Fixed to
   `wallHeight`, and the record now sits in a complete column above the card.

The pattern held to the end: the arithmetic looked right at 0.18, looked right
at viewport.height, and a screenshot showed a clipped record both times. The
rule stands — a size assertion must name which frame it is a fraction of — and
this unit named the wrong one seven times before the screenshots exhausted the
frames.

## `wall-scene:212` "settles CENTRED" — SECOND SIGHTING, and it is the flake

2026-08-21, step 15 unit 5. Fired in a full suite on the HORIZONTAL axis
(`settledNdcX` 0.35, where <0.05 is required) after the lift/lock work.

NOTES' first-sighting entry said "if it fires again after the fill rule lands,
suspect the change before the harness." Suspicion fell on the change — correct
discipline — and the change was **exonerated by measurement**:

- Isolated, the test passes twice at `--retries=0`.
- A direct probe of the settled world X at 130 records: `worldX=640, destX=640,
  camX=640, ndcX=0` — exactly centred. The lift is Y-only and never touches X.

So it is the timing flake the first entry describes, now seen on X: under
full-suite load the rise's X interpolation has not reached `destination.x` by
the test's fixed 900ms wait, and a partway reading is off-centre. The 0.05
tolerance assumes a settled rise; under load it is not settled.

**Two axes of expression, one flake — now FIXED.** The fix was not to re-suspect
each change (that was tried and cost an investigation) but to make the test wait
for the rise to actually settle. The scene already exposes `pulledProgress`,
which `Math.min(1, …)`-caps and reaches '1' when the rise completes; the test
now `expect.poll`s for that instead of a fixed 900ms. A settle SIGNAL cannot
read a partway position under load, which is what both sightings were. Ran 3x in
isolation green after the change. This closes the flake at its cause rather than
its symptom — the condition-based-waiting fix the deferral named.

## scroll-lock test: the assertion assumed the wrong capture point, corrected

The lock fires on SETTLE (after the rise-scroll centres the record), so the
pinned offset is where the rise LEFT the wall — not the pre-pull scroll. The
first test asserted the pin equalled the pre-pull `before` (600) and failed:
the rise-scroll had moved it to 3293 and the lock correctly captured that.

Corrected to assert what is actually true and load-bearing: the pin is a real
negative offset (not 0 / jumped-to-top), it does not move while out, and the
return restores THAT position — so the record's slot is where the reader last
saw it. Re-mutated after the correction: `overflow:hidden` alone still fails the
position test, so the guard against the jump-to-top failure survives the fix.

## Step 15 unit 5 mobile, ROUND 2: three findings, and #1 and #3 are one question

Reported by the developer against the live wall with a REAL cover (Dire
Straits), where the seeded probe's plain sleeve hid the overlap.

### #1 — the card is OVER the record, still. My "column" was wrong-headed.

Measured: record sleeve band 161–646, card 645–820. They abut in the scan's
centre column but the card is an OPAQUE black rectangle laid over the canvas at
bottom-left, and the sleeve pokes out around it (right side, and below where wall
spines show). It is not a column and not a clean overlay — two things fighting.

**My report said the lift formed a complete column. The render disagreed, and I
trusted the vitest assertion (which only checks the destination Y arithmetic)
over a screenshot.** Exactly the failure this unit has been caught by seven
times: a number that looks right, a picture that shows otherwise.

### #3 reframes #1 — the reference OVERLAYS, it does not stack

The developer's Criterion screenshot (Rosetta) shows the answer: the panel is a
translucent overlay CENTRED ON the case — title, metadata and a SYNOPSIS
scrolling inside the panel, over the lower two-thirds of the artwork, the case
fully visible behind. You stay in the room. It is one object, not a record with
a card beneath it.

So the "lift the record to make a column" model is abandoned: there is no
column. The card becomes an overlay on the full-bleed record, as the reference
does. That subsumes #1 — fixing the overlay IS the column fix — and it is what
#3 asks for.

### #2 — the wall does not return home, and the test asserted the wrong thing

Measured: scrolled to 300, pulled (rise scrolled to 1295 to centre the record),
put back → wall left at 1295, not 300. The return animation is never seen and
the wall is somewhere the reader did not put it.

**The scroll-lock test passed because it asserts position is preserved across
the LOCKED state — nobody asserted the wall returns to where it was BEFORE the
rise scrolled it.** The freeze-in-place decision existed precisely to protect
that continuity, and the implementation preserves the wrong anchor: it restores
the rise-scrolled position (1295), not the pre-pull position (300).

The fix is two parts, as the developer said: the BEHAVIOUR (restore the pre-pull
scroll on return) and the ASSERTION (a test that the wall is back where it
started, not merely stable while out).

### #3 is a DECISION CHANGE and a §10b amendment — scoped, not built

Earlier this unit the tap went to `/records/:id` (A32). #3 changes that: the
chevron EXPANDS IN PLACE over the record — synopsis scrolling inside the panel,
the record behind — and a link to the full page lives INSIDE the expanded panel,
not instead of it. Scoped below; the developer wants the cost before committing.

## Step 15 unit 5: A33 built — the panel expands in place, and #1 is fixed by it

A33 (spec committed first) reframed #1: the reference OVERLAYS the record, it does
not stack a card beneath. So the "column" approach was abandoned wholesale.

### A33a — the record lift is DELETED, the record goes camera-centred

`pulledDestination`'s `layout` / `stackedCardHeight` / lift arithmetic all
removed. The record is full-bleed and centred at every width; the panel is a
scrim OVERLAY on its lower portion (transparent at the top, panel ground at the
bottom), the artwork reading through. **This deletes the two lift bugs the column
fought** — the fixed-fraction clip and the viewport-vs-canvas-height error — a
net simplification, which is the right shape for a fix that was chasing the wrong
model.

Verified on device: the record is centred and whole, the overlay at the bottom,
no floating block and no clipping. #1 fixed.

### A33b/c/d — the panel expands in place, one component, both layouts

`RecordPanel` replaces `SummaryCard` in the live scene (`SummaryCard` stays only
in the retired `/plane` FillComparison scaffold). Collapsed on the phone (title,
attribution, count, chevron); the chevron EXPANDS it — synopsis and facts scroll
inside, the record behind — with the `/records/:id` link INSIDE the expansion
(A33b). Desktop passes `alwaysExpanded` (A33d): the wide panel is the expanded
shape at rest, no chevron.

**A33c held to, and it is the constraint that mattered.** `RecordSummary` gained
`snippet: {text, generated}` and `factGroups` as SEPARATE fields, so the panel
cannot merge them. Mutation-tested at the unit level (flattening the snippet into
factGroups fails) and asserted in E2E: the snippet renders above a boundary,
labelled "A note, written by Claude" (or "Your note" when edited, §4.2), the
facts below, and the snippet text does NOT appear in the fact list. This is 13c's
typed label carried to its last surface — the panel does not assert things about
music without saying which part it made up.

### Tests updated for the contract change, not worked around

`record-layout-fork.spec.ts` encoded A32's contract (stacked card, tap
navigates, `record-chrome-actions`). A33 changed the contract, so the tests were
updated to it WITH the reason stated in the file — not modified to make failing
code pass, but re-pointed at the new behaviour A33 specifies. `record-panel.spec.ts`
is new: expand-in-place, the boundary, the edited label, the desktop
always-expanded. `summary-card.spec.ts` is unchanged and still green — it tests
the scaffold `SummaryCard`, which A33 did not touch.

**A testid collision found and scoped around:** `panel-snippet` exists in both
`RecordPanel` and `Panels.tsx`'s `FactsPanel` (13c), and `/plane` renders both
the live wall and the FillComparison scaffold. The E2E scopes to `record-chrome`
(the wall's chrome) so it reads the live panel, not the scaffold's.

## Step 15 — touch: drag to tilt, and the gesture boundary designed not discovered

§10b's second tilt half ("on touch it is dragged"), never built. Zero touch
handlers in src/ (measured, still true of the pointer path).

### tiltFor reused a SIXTH time, unchanged

The touch effect feeds `tiltFor(touch.clientX/Y, face)` exactly as the pointer
effect feeds it `event.clientX/Y` — touch gives absolute positions, which is
what the pure absolute-position mapping wants. No fork. The prompt asked whether
it fits; it fits without a change.

### The boundary is a raycast, not a rectangle

`live.current.hitsPulledRecord(x, y)` raycasts the PULLED mesh specifically (not
the wall spines) and returns whether the touch hit it. `touch-tilt.ts`'s
`shouldStartTiltDrag` is the decision on top: hit + canTilt + not-reduced-motion.
A touch on the wall returns false and falls through to the tap that pulls or
dismisses — which is what keeps the tap working. Mutation-tested: claiming every
touch (drop `hitRecord`) fails, and springing home on release (drop the held
tilt) fails.

### What rests on the scroll lock — nothing, stated

The record drag is claimed by `touch-action: none` on the canvas (set while a
record is out, restored on cleanup) and by only calling `setTilt` for touches
that hit the record. So a record-drag never scrolls even if the lock were
removed. The lock's own job — a WALL drag while a record is out not scrolling
the wall away — is separate and unchanged. The two do not depend on each other.

### Measured (chromium + CDP touch stream at 390px)

- **Tap still pulls:** true. The touchstart handler returns without
  preventDefault on a wall touch, so the synthetic click survives.
- **Record drag tilts and holds:** rotY 0 -> 0.143 during the drag, 0.143 after
  the finger lifts. The hold rule, seen in the screenshots (mid-drag and held
  are the same frame).
- **Wall drag does not tilt:** a drag started above the record left rotY at its
  held 0.143, unchanged.
- **Idle draws: 0 before, 20 over exactly 20 moves (one per move), 0 after.**
  The dirty-flag discipline holds — the record settles when the finger stops.

### What rests on emulation vs the device

The gesture BOUNDARY and the HOLD are logic — hit test, phase, held angle — and
are pinned by `touch-tilt.spec.ts` (unit + E2E). Those do not depend on feel and
the emulation is trustworthy for them (the fixed-coordinate probe already made
emulator and device agree once). What only the DEVICE can judge is the FEEL:
whether the drag tracks the finger naturally, whether 16° reads as turning a
sleeve, whether the hold feels right rather than stuck. That is Adam's call on
the phone.

**A false alarm worth recording:** a first wall-drag test "failed" (the record
tilted) — but the wall touch coordinate was `box.y + box.height - 20`, and at
390px the canvas is 2976px tall, so that y was off-screen and CDP clamped it
somewhere unexpected. Instrumented `hitsPulledRecord`: a genuine on-screen wall
touch above the record returns false and does not tilt. The boundary was right;
the test coordinate was the ninth "which frame" slip, caught by measuring the
hit test rather than trusting the drag's result.

### touch-action scoped to the record-out state

`touch-action: none` is applied to the canvas only while a record is out and
restored on cleanup, so the wall scrolls normally when nothing is pulled. A
`touch` Playwright project (Chromium + hasTouch, 390px) runs the spec, scoped —
CDP touch is Chromium-only and the WebKit `mobile` project cannot drive it.

## Step 15 — 13b: moving between records, and swipe-to-flip declined (A34)

### A34: no swipe-to-flip, WITH a trigger

Recorded in §10b beside the tilt clause. A flick and a drag differ only in speed
and distance — the undrivable threshold this section already rejected for
`WIDE_RATIO` — and horizontal swipe belongs to MOVING BETWEEN records, so
spending it on flip would force a second invented gesture for the more important
feature. "Turn over" is a button. **Trigger to revisit: R8, or the first real
one-handed use in a shop** — if the button is awkward to reach with a thumb while
holding a record, the swipe earns reconsidering. A decision without a trigger is
a decision never to revisit, and this one might earn it once the app is in a shop.

### What the wall does (Q1): the next record RISES, through the slots

Navigation reuses the exact transition clicking a neighbouring spine does —
`pull(current, nextId)`. The new record rises from its own slot and the old
slot refills; it is not a content swap. Seen mid-navigation (screenshot): the
next record rising out of the wall, the previous slot emptied. This honours the
rise/return rather than bypassing it, and it means put-back returns the
navigated-to record to ITS slot.

### The ends (Q2): the arrow is ABSENT where there is nowhere to go

`adjacentRecordId` returns null at the ends; the arrow is hidden there
(`hasAdjacent`). §10b keeps rejecting an affordance that appears to work and does
not, so the wall stops VISIBLY — the left arrow gone at the first record, the
right gone at the last — rather than a press that silently does nothing.
Stopping-that-looks-live and wrapping-a-linear-shelf were the other two answers;
a shelf is a line and does not loop.

### The order is the WALL's, asserted against its producer (Q4)

Navigation indexes `records` — the deterministic genre order `shelfRecords`
built the wall from. A filtered wall repacks it, so this is next in what is
SHOWN. The E2E reads the order from the `wall-records` accessible list (the same
`records` prop, rendered as links) rather than a literal — the seam-test shape,
and `shelfRecords` is server-only and cannot be imported into a spec anyway. All
navigation tests run against `/plane?artistId=`, which IS a filtered wall.

### The gesture boundary (the part most likely wrong): swipe vs tilt, GEOMETRIC

Both start as a finger moving sideways on the record. Decided at RELEASE, and the
threshold is a GEOMETRIC quantity, not a derived number: a swipe is a drag whose
net horizontal travel exceeds HALF THE RECORD'S ON-SCREEN WIDTH and is dominantly
horizontal. Half the width is centre-to-edge — past the record itself, which
reads as "leave this one". It scales with the record, so it is hand-independent,
which is exactly what A34 rejected the fuzzy version for. During the drag it
tilts (live feedback); a committed swipe snaps the tilt back and moves.

Measured: a short drag (~50px) tilts and stays on the same record; a long swipe
(~250px) navigates. Mutation-tested: dropping the horizontal-dominance check,
the half-width threshold, or flipping next/previous each fails.

### Draws (Q5) and put-back (Q3)

Idle 0 before, 32 over one navigation (the rise), 0 after it settles. Put-back
after navigating 10 records forward into later rows cleared the pulled state —
the record returned to its slot. The scroll lock and return-home from the last
unit carry: put-back still lands right because the navigated-to record's own home
slot is where the pull-transition sends it.

### Emulation vs device

The order, the ends, the boundary and the draws are logic and are pinned in the
E2E (arrows via chromium, swipe via the `touch` project + CDP). What only the
DEVICE judges: whether the swipe feels like turning a page vs fighting the tilt,
whether the arrows are reachable one-handed, whether the rise-between-records
reads as continuous. Adam's call on the phone.

### What must not break — checked

Tap still pulls, tilt drag still tilts and holds, wall-drag still does not tilt,
scroll lock and return-home unchanged, desktop unchanged except for the arrows,
zero idle draws. reduced-motion: navigation reuses `pull`, whose reduced-motion
path is instant (no rise) — the new record simply appears.

## Step 15 — 13b navigation REBUILT as a slide, not a pull

The developer rejected `pull(current, nextId)` for navigation: it returned the
held record to the shelf and rose the next — two full rises — which reads as
"done with this one, get me that one" and as jerky, where moving between records
should be a lateral "let me see the next". Correct engineering (one mechanism, no
second transition), wrong meaning.

### The slide

A new `sliding` phase (`{ fromId, toId, direction }`) and a `slide` action in the
state machine. `setSlide(fromId, toId, direction, progress)` moves both meshes
HORIZONTALLY at the settled depth: the held record leaves one side, the next
arrives from the other. Measured on device: at progress 0.43, fromX=132 and
toX=736 either side of dest=624; at progress 1, fromX off-screen and toX=624
centred. **fromZ = toZ = 1977 throughout** — the same depth, which is what makes
it a lateral move rather than a rise (a rise changes z). Direction follows the
input: `next` (swipe left / right arrow) slides the current record left.

### What the wall does during a slide (the decided question)

**The wall stays as it was.** The two moving records float at destination depth
in front of a frozen, dimmed wall; the wall's slots are not re-animated. That is
what "a lateral move in front of the wall" means — moving the emptied slot with
the selection would turn the transition into a wall event, which it is not. At
rest, only the held record's slot is empty (the leaving record returns to its
slot on settle). Both slots being momentarily open mid-slide is incidental to the
wall being frozen, not a moving-gap animation.

### Put-back still lands right, asserted after a SLIDE

The property from the pull-based version, preserved and verified for the slide:
after sliding 10 records forward, `slotGap` while out is 2034 (the held record's
slot is empty), and after put-back it is 0 — the record returned to ITS own slot,
which is elsewhere on the wall. Asserted in E2E via `slotGap`, published from the
same values that draw the mesh.

### THE BUG the rebuild exposed: one step slot, and a spurious re-rise

The render loop has a SINGLE `step` slot (`animate: (next) => { step = next }`).
Adding `state.phase` to the rise effect's deps — needed so it bails on 'sliding'
— made it re-run on SETTLE too, and without a guard a just-settled record rose
AGAIN, its `scene.animate` replacing the slide's step mid-flight and orphaning
the slide at whatever progress it had reached (measured: stuck at 0.43 during
rapid navigation).

**Root cause found by reading `render-loop.ts`**, not guessed: one step slot
means any `animate` caller cancels the previous. Fixed by guarding the rise to
FRESH rises only (`state.phase === 'rising'`); a settled/flipping record holds
its pose statically (`setPulled(pulledId, 1)`) rather than re-animating. This is
the systematic-debugging Iron Law paying off — the symptom was "slide stuck at
0.43", the cause was two writers to one step slot, and a fix at the symptom
(retrying the slide) would have left it.

### Draws and the rest

Idle 0 before, 17 during the slide, 0 after. Tap-to-pull, tilt, wall-scene
rise/return/flip, and touch all still pass. reduced-motion: the slide jumps to
progress 1 on the first frame (the same instant path the rise uses).
`data-phase` is now published on the wall-scene element so a test can assert the
phase is 'sliding', never 'rising' — the definitive distinction from a pull.

## Step 15 — 13b: a slide RELEASED the scroll lock, scrolling the wall away

Reported by the developer: sliding to a top-row record scrolls the wall to the
top and the held record goes off-screen. Their hypothesis (something in the slide
still moves the wall) was right in effect; the specific cause is the scroll lock,
not the incoming slot.

### Measured

`useScrollLock(state.phase === 'settled' || state.phase === 'flipping')`. A slide
is the `sliding` phase — NOT in that list — so the moment a slide starts the lock
becomes `locked=false`, its cleanup runs, and it `window.scrollTo`s back to
`preRiseScrollY` (the pre-pull position, near the top when the record came from a
top row). The record is placed at the wall's centre in WORLD space, so once the
page scrolls it is off-screen.

    after pull:  bodyTop -178px   (locked, pinned at 178)
    mid-slide:   bodyTop ''       (lock RELEASED — the bug)
    after slide: bodyTop 0px      (re-locked, but at the TOP, not 178)

### Why the scroll-lock test did not catch it

The developer named this: `scroll-lock.spec.ts` asserts the position is preserved
across PULL and RETURN. A slide is neither — it is a third transition the test's
fixtures never exercise, so the lock releasing mid-slide was invisible to it.
Same shape as the CENTRED flake and the put-back-anchor bug: a property asserted
along the axes it was designed for and not the new one.

### The fix

The lock must stay active through `sliding` — a slide is "a record is out", and
the page must stay frozen behind the lateral move. Add `sliding` to the locked
condition. The record then arrives centred on screen regardless of its slot's
row, because the frozen wall does not move under it.

## Step 15 — 13b: the record's screen position is a SCROLL side-effect, not a chosen place

The developer's sharper reframing, from three 1280 screenshots: the record opens
at a DIFFERENT vertical position depending on which row its slot is in. A
middle-row record centres; a top-row record lands high and overlaps the panel; a
bottom-row record runs off the bottom edge. It is not mis-sized — it is
MIS-PLACED, and the place is decided by the wall's scroll clamps.

### The mechanism, read from the code

The camera looks at the wall's CENTRE (`camera.lookAt(width/2, -height/2, 0)`)
and the record's destination is also the wall's centre (`y: -wallHeight/2`). The
canvas is the whole wall (~2976px) drawn 1 world-unit = 1px, so world-y maps to
canvas-px. To see the record at the wall's centre, the page must scroll so
canvas-y ≈ 1488 sits mid-viewport — which is why the RISE SCROLLS. At the top and
bottom rows the scroll CLAMPS (a wall cannot scroll above its own top), so the
record lands wherever the clamp leaves it, not centred.

**My scroll-lock-during-slide fix was necessary but insufficient** — it stopped
the wall moving mid-slide, but it froze the WRONG position. The real fix is the
developer's: do not use scroll to position the record at all.

### The fix: position the record at the VISIBLE viewport centre, not the wall's

The record floats in front of a frozen wall; it should arrive at the same place
on screen every time. Its world-y must be `-(scrollY + viewportHeight/2)` — the
centre of the VISIBLE slice — computed from the scroll position at pull time
(which the lock already captures as `preRiseScrollY`). Then no scroll is needed
to bring it into view, and the rise-scroll effect is DELETED. This also fixes the
phone slide bug: if the record's position never depends on scroll, sliding to a
top-row record cannot yank the wall.

### Two properties to preserve (the developer named both)

1. **The rise still starts at the spine.** It travels from the slot's actual
   world position to the fixed on-screen place — the unit-19 mapping. This must
   not become a fixed START; only the DESTINATION changes.
2. **Put-back still returns to the correct slot** — the property verified after
   sliding ten records forward (`slotGap` 0 after return).

---

### 2026-08-21 — placement fix + easing: verification state (machine starved)

The placement fix (record settles at the visible viewport centre by projection,
wall frozen, rise-scroll deleted) and the per-channel slide easing are done.

Verified on a SETTLED machine, per-suite, all green:
- `record-navigation` (chromium+touch): slide is lateral never rises; slotGap ~0
  after put-back following a 10-record slide; put-back lands right.
- `wall-scene`: settles at viewport centre (settledScreenY ≈ viewport/2, ±60).
- `scroll-lock` (rewritten): wall now frozen AT `before` (no rise-scroll), pin
  == before, scroll-while-out inert, put-back leaves it at `before`.
- `rise*`: rise still starts at the spine (unit-19 mapping intact).
- `cover-unlit`: render 47.0/40.0/31.0 == source 47/40/31 EXACT. The earlier
  failure was the sampler anchoring on the CANVAS centre; the record now floats
  at the VIEWPORT centre, so the shot is clipped to the record's reported
  on-screen position (settledScreenY + settledNdcX) — a locating fix, the
  luminance was never wrong.
- typecheck / lint / build all clean.

The full no-argument E2E run is BLOCKED by machine starvation: a run took 1.6h
under load avg 23-28 (healthy ~10min). Its list reporter printed "251 passed,
20 skipped, 0 failed" (exit 0), but `.last-run.json` showed a stale
`status:failed` with a `failedTests` array and 20 tests were skipped under load
— NOT a trustworthy clean run either way. DISCARD per the load-49 precedent.
Re-run `npx playwright test --retries=0` (no file arg) once load is back to ~2-4
before committing. Do NOT commit on the strength of the starved run.

---

### RULE: a test must FIND the element, not assume where it sits

Three instances in the shelf strand now, same shape:

1. **The fixed-coordinate spine probe** — clicked a hard-coded `(x, y)` to hit a
   spine; broke when the row that was on-screen changed with scroll. Fixed by
   sweeping a grid until `data-pulled` reports a hit.
2. **The off-screen wall-drag coordinate** — asserted a drag "on the wall" using
   a literal y that assumed the record's position; a layout change moved the
   record under that point.
3. **cover-unlit sampled the canvas centre** — the record used to rise near the
   canvas midpoint, so `at(width/2, height/2)` was the face. The placement fix
   floats the record at the VIEWPORT centre instead, and the canvas-centre pixel
   became dimmed wall. The luminance was never wrong; the test located the record
   by assuming where it sits. Fixed by clipping the shot to the record's REPORTED
   on-screen position (`settledScreenY` + `settledNdcX`).

**The rule:** a test that hard-codes a position is asserting a layout it does not
own. It reads like verification but constrains nothing about the code under test,
and it breaks when the layout changes for good reasons — a false failure that
costs a debugging session to distinguish from a real one. Locate the target by
FINDING it (poll a state attribute, scan until a hit, read the element's reported
position) rather than by assuming a coordinate. The scene already exposes what a
test needs — `data-pulled`, `data-phase`, `settledScreenY`, `settledNdcX`,
`slotGap` — precisely so assertions can ask where things are instead of guessing.

Same family as the §2 "name the line it would fail against" rule: a coordinate
literal fails against the layout, not against the behaviour the test names.

---

### 2026-08-22 — the four-row wall minimum is gone (A35, amends A24d)

`MIN_SHELF_ROWS` removed from `wall-layout.ts`: `rowCount = row + 1`. The wall is
as tall as its contents. The "most of the collection is hidden" signal moved to
the heading — `collectionCountLabel` says "N of M records" when a filter is
active, fed by filtered `listRecords.total` (matched) and the new unfiltered
`countAllRecords()` (total). A24d re-satisfied by the count, not the room's size.
SPEC §10b amended; PROMPT-spec-amendments-A35.md written.

Placement proved in ONE pass against the real 125-record collection (live :3000,
throwaway harness, since removed): top/mid/bottom rows + a filtered wall, at 390
and 1280 — every case landed at the viewport centre, **max |delta| = 0px**,
ndcX = 0. The committed twin is `wall-scene.spec.ts` "settles CENTRED at any
collection size" (130 records, 3 rows) — the live proof is not committable
(real DB + real password), so the seeded twin carries the property.

Adam's two flagged regressions checked: **left-edge bleed is NOT present** —
canvas insets 16px (breakout px-4) + 40px WALL_EDGE_MARGIN inside; first spine
reads fully at 1280 and 390 (cropped screenshots confirm). What looked like
clipping in the full-viewport shot was rotated-text density. **Second-row abrupt
end** is the partial last row — correct by design, now explicitly tested
(last row partial, shelf still full-width).

Stale "four rows/shelves" comments corrected in the same unit (wall-scene.spec,
hover-proud.test) rather than left asserting the removed mechanism — the
"a test asserts a layout it does not own" rule, applied to prose.

---

### 2026-08-22 — suite audit: what was measured, what changed, what stays

**The load is not the suite.** Sampled `top` every 20s through a full E2E run:
the suite's own processes averaged 93% of ONE core, peak 284% (two
chrome-headless rendering WebGL). Non-ours averaged 117%: WindowServer 29%,
kernel_task 24%, Docker VM 15%, Creative Cloud 14% (intermittent, top process
in 3 of the last 4 samples as load hit 15 while the suite wound down), Chrome
13%. Idle baseline with nothing of ours running: load 4.5–9.3, `ospredictiond`
bursting to 33%. Load climbing as our CPU falls is the signature. Quit Creative
Cloud before runs; the 37.8-min and 1.6-h runs were external bursts.

**Distribution.** Vitest 2,838 tests / 3.5 min wall: src/ unit tests (~1,200)
cost 1.5s total; test/ integration is 113.7s; ~90s is migrate + transform
overhead. E2E 275 tests / 8.7 min: eleven WebGL-wall specs (~52 tests, 19%)
are ~39% of serial time at ~7.5s each; screenshot decoding is 4 calls, ~17s.

**Removed with reason (supersession):** record-navigation "put back lands
right after navigating away" — the pull-era predecessor of the slotGap test,
same fixture and steps, strictly weaker assertion. Note left in the spec.

**Harness, not coverage:** wall-scene's seed() moved to `seedRecords` (one
INSERT). Measured 200 POSTs = 3.0–4.0s vs one statement 14–22ms; the reason is
seed.ts's own — HTTP fixtures degrade the shared dev server mid-run. wall-scene
predated the helper and never moved (drift). Its teardown moved with it —
`removeRecordsFor` + a SQL artist delete — because a spec that seeds via SQL and
tears down via 200 paginated HTTP DELETEs has the same asymmetry the seed had,
and nothing in wall-scene needs the API delete path (no images, no references).
The `Read-` seed path was never registered for cleanup and leaked one record
per run; it is now.

**truncateAll — measured, and left alone.** Instrumented every call for one
run (patch reverted): 1,272 calls, 54.9s of TRUNCATE at a flat 43ms each —
26% of vitest wall, not "99%" (that figure was integration FILES, which
includes their real work). 312 calls (25%) truncated tables that were already
empty — the previous test wrote nothing — costing 13.6s, concentrated in
discogs-search (39/42), formats (29/32), discogs-versions (23/25), tags, genres.

Decision: no skip-if-empty guard. 13.6s is not worth adding a round-trip to
every call to skip some of them, and it makes "was this table empty" something
the harness reasons about — the shape that fails silently when it is wrong.
Per-test truncate is the mechanism §2 mandates. **Do not re-propose on speed
grounds; the number is here.** The other 41s is 960 needed truncates at a fixed
cost that only a different mechanism would change.

---

### RULE: a test whose expected value comes from the inputs under test cannot fail

Stronger than the vacuous-test rule above, and a different failure. Those tests
*could* have failed and didn't. This class **cannot** fail, for a structural
reason: when the expected value is derived from the same inputs as the value
under test, the assertion compares the code against itself.

The instance. `wall-scene.spec.ts` asserted the pulled record was centred:

    expect(Math.abs(settledScreenY - innerHeight / 2)).toBeLessThan(60)

`settledScreenY` is written by the scene as
`canvasRect.top + ((1 - ndc.y) / 2) * canvasRect.height`, and the destination
that produced `ndc.y` is `scrollY + innerHeight/2 - canvasDocTop()`. Both sides
are `innerHeight` and the canvas rect. It reported **delta 0px at every viewport
and every row** while the sleeve ran off the top of the wall on the phone.

**No mutation catches it.** Change the target from `innerHeight/2` to
`innerHeight/3`, or to a constant, and the record moves — and `settledScreenY`
moves with it, because it is read back through the same geometry. The mutation
moves both sides. Mutation testing is the usual answer to "could this test
fail"; here it answers wrongly.

**The tell**, when reviewing: the expected value is *computed* rather than
*stated*, and its terms appear in the implementation. `toBeLessThan(60)` around
a difference of two derived quantities is the shape.

**The replacement reads pixels.** `the pulled sleeve fits INSIDE the visible
wall region` screenshots the page, scans the sleeve's extent down the middle
column, and asserts it lies strictly inside the region — a claim about the
render, whose expected value (the region's own edges) comes from the DOM, not
from the placement arithmetic. It fails against the broken code (sleeve top 172
pinned to region top 172) and passes against the fix.

**The fixture must be short enough to clip.** At 390x844 the region holds a
322px sleeve aimed at the viewport centre, so the broken code PASSES there;
every real Safari viewport is shorter once the URL bar and toolbar are taken.
The test uses 390x664. A test at 844 would have been green against the defect —
the same "a test at a size the rule already covers cannot see the rule working"
finding as unit 22's plane and the re-wrap fixture.

### The defect itself: viewport centre vs visible wall region centre

The wall starts below the nav and heading (canvas top ~229 at 390). Aiming the
record at `innerHeight/2` ignores that: on a short viewport the visible region
is the LOWER part of the screen and its centre is well below the viewport's. A
322px sleeve aimed at 332 has its top at 170, above the canvas at 229, and is
clipped there. Fixed by `viewRegionCentrePx`, which targets
`(max(canvasTop, scrollY) + min(canvasBottom, fold)) / 2` and clamps so the
sleeve's edges clear the region; when the region cannot hold it, the region
centre spreads the overflow rather than pinning it to one edge.

Also fixed in the same pass: `touch-tilt.spec.ts` hard-coded the record centre
at `195, 400` and the wall drag at `195, 120`. Both now derive from
`settledScreenY`/`settledNdcX` — the find-it-don't-assume-it rule again, third
and fourth instances in this file.

---

### RULE: a scene value written FOR tests is how a test ends up reading back the implementation

The generalisation the tautology audit produced. Every instance of the
self-consistency shape in this strand involves one of the fifteen `data-*`
values `WallScene` publishes for tests to read — `settledScreenY`, `slotGap`,
`meshX/Y`, `layoutSlotX/Y`, and the rest. Those datasets are the mechanism: they
are convenient, and they are also a channel through which a test can compare the
implementation's arithmetic against itself.

**The defence, which has now worked three times:** assert against a SECOND,
INDEPENDENT PRODUCER, or against PIXELS.

  - `meshX/Y` (the render) vs `layoutSlotX/Y` (the packer) — wall-scene's
    re-wrap return, and now record-navigation's put-back.
  - The sleeve's extent decoded from a screenshot vs the wall region's edges
    read from the DOM — the placement fix.

When adding a `data-*` for a test, ask what the test will COMPARE it to. If the
answer is a formula built from the same inputs the scene used to write it, the
assertion cannot fail and a second producer is needed instead.

### The audit itself (2026-08-22)

Checked every E2E and unit assertion that reads one of the fifteen scene
datasets. Full tautologies remaining: **0** (the `settledScreenY` one is fixed).
Sound despite resembling the shape, left alone with reasons: `meshX/Y` vs
`layoutSlotX/Y` (two producers); `recordDepth` vs `SPINE_HEIGHT *
BOX_THICKNESS_RATIO` (a deliberate no-duplication pin, backed by the stated
constant 9.6 which WOULD catch a wrong ratio — the pair is sound, either alone
is not); `boxCameraDistance` fill (inverts the function rather than restating
it, and is recorded as failing against the old fixed distance);
`pulled-destination.test.ts:61` (restates the fallback, but it is the documented
contract and the file's same-apparent-size tests carry the real property — the
weakest of the four, worth revisiting if that file changes).

**Changed: `record-navigation.spec.ts` put-back, from `slotGap` to mesh-vs-slot.**
`slotGap` is `|mesh.position - home|` and the return animates the mesh toward
`home`, so it collapses to ~0 whatever `home` holds — a PARTIAL tautology: it
catches a return that never runs, never a return to the wrong slot. That was
tolerable while a sibling test also covered put-back. It stopped being tolerable
when that sibling was removed as subsumed (same session), leaving this test as
the only guard on exactly the bug a slide can introduce — sliding changes which
record is held, so its home is elsewhere.

Mutation-proved both ways, sending the return 300px off its home:
  - old `slotGap < 5`: **PASSED** against the corrupted return.
  - new mesh-vs-slot: **FAILED**, expected 283, received 583.
That is the difference between a ruler that moves with the thing it measures and
one that does not.

---

### 2026-08-23 — E2E accumulation, unit (a): the mechanism and the guard

**Measured from a genuinely empty database:** one full run ends with **145
records / 129 artists**. `globalSetup` truncates once per run, so that growth is
WITHIN the run — the shape step 15 unit 1 diagnosed, where 724 accumulated
records made `/` slow enough that late specs' logins timed out. Attribution by
fixture prefix: Discharge 67 records (shared across collection-filters,
discogs-prefill, manage), Gallery 8 (images), WidthTest 8, Shelf 7, long tail.
Zero orphans — artists and records leak together.

**The cause is not the three HTTP teardowns.** Those specs cleaned up correctly;
moving them was consistency, not the leak. The leak is **13 specs that seed and
never clean up at all**; shelf (17 seeding sites) and record-detail (15) carry
32 of 47.

**Why not a mid-run truncate.** `global-setup.ts` records the reason and it still
holds: two projects run in parallel against one database, so truncating mid-run
— or in a global teardown while a project is still running — deletes another
spec's live fixtures. The rule-level fix is a shared PER-SPEC teardown plus a
guard, not a shared reset.

**Built:** `trackArtist(id)` / `registerCleanup()` in `e2e/cleanup.ts` (SQL,
records before artist per §7.4, best-effort per artist so one failure cannot
strand the rest), and `test/repo/e2e-cleanup.test.ts`, which fails when a spec
seeds records without registering cleanup. The three HTTP teardowns moved onto
it; `deleteRecordsByArtist` now has no callers in specs.

**The guard is LIVE, not skipped**, with the 13 non-compliant specs named as
explicit exemptions — visible debt rather than a silent skip, since a skipped
test is a test that does not run. Proved it catches a fourteenth offender by
name. It also has a staleness check, so (b) MUST remove each name as it
converts: a list that outlived its debt would quietly grant permission to
regress.

**Two findings from writing the guard, both from it being more accurate than a
manual survey.** A first pattern matched any mention of `/api/records` and named
discogs-prefill, records-routing and want-list — specs that only READ records;
it would have sent (b) to fix work that does not exist. Tightening it then
exposed snippet and suggestions creating through a local `post(page, ...)`
wrapper, and **record-form creating through the UI form** — thirteen saves, no
request literal, which this pattern structurally cannot see. It is exempted with
that limitation written on the line rather than left as a silent hole.

---

### 2026-08-23 — E2E accumulation, unit (b): 145 -> 10, and what the residue is

All thirteen listed specs converted to `trackArtist`/`registerCleanup`. Measured
from a genuinely EMPTY database after each pass, which is what produced the two
findings below — an end-only measurement would have shown a number that looked
like success and hidden both.

**Pass 1 — shelf + record-detail (32 of 47 sites): 145 -> 1.** The surviving 1
was the finding. A `Fulfils-` artist was tracked and still would not delete: of
everything referencing artists and records, only three columns are NO ACTION —
`records.artist_id`, `want_list.artist_id`, `want_list.acquired_record_id` — and
a want-list row pinned both. That is §7.4's refusal to cascade a reference in
use, working correctly. Fixed AT THE RULE: `registerCleanup` deletes want-list
rows first, by artist and by acquired record. Re-measured 0/0/0.

**Pass 2 — the remaining eleven: 145 -> 74.** Not the ~0 predicted, and the
residue was almost entirely `collection-filters`, which the guard called
COMPLIANT. **Partial cleanup read as compliance:** it removes its records via
`removeRecordsFor` and never the artists behind them, and artists outlive
records because `records.artist_id` is NO ACTION. So the guard gained a second
check — creation sites vs removal sites per spec — which named five offenders
(collection-filters, discogs-prefill, manage, want-list, wall-scene; 22
untracked sites). That check is CRUDE ON PURPOSE: it can only show a spec does
not create more than it accounts for, never that the RIGHT artist is removed.

**Pass 3 — after those five: 145 -> 10 records / 13 artists, want_list 0.**
93% closed. Suite green throughout (275 passed), and a minute faster.

**What the residue is, and why it is not the same defect.** Every remaining row
is an artist the APPLICATION creates as the behaviour under test, not a fixture
a spec seeds: `manage`'s merge and match-candidate flows generate `-merge` and
`-answered` artists server-side, and `discogs-prefill` importing a Discogs
fixture creates `Lena Raine`. `trackArtist` structurally cannot see these — the
spec never holds their ids. Removing them needs each spec to query for what the
app created, which is a different mechanism from tracking what the spec seeded.

**Trigger, not permanent debt:** revisit if the from-empty count exceeds ~30, or
if any spec fails in the last quarter of a run with a login or `/` timeout —
the step 15 unit 1 signature. At 10 records the accumulation cannot reproduce
that; at 724 it did. The number is here so the next person can compare rather
than re-derive it.

**`record-form` needed no exemption in the end.** Its 11 API-created artists are
tracked, and its 13 UI saves mostly select an existing tracked artist, so those
records die with it. Exactly one site creates through the UI — the "New artist
name" inline field at `record-form:262` — and it did leave one pair in the pass-2
measurement. It does not appear in the pass-3 residue. The exemption list is
EMPTY; the UI-creation blind spot is documented on `SEEDS` instead, where it
belongs, since it is a property of the pattern rather than of that spec.

---

### 2026-08-23 — step 15's mobile pass: the form screens

§12 step 15 is "mobile pass across ALL screens. E2E #10", and eight of twelve
screens had never been rendered at 390px. Forms first, being the most
viewport-dependent.

`record-form`, `discogs-prefill` and `want-list` added to the `mobile` project
(covering /records/new, /records/[id]/edit and /want-list/new). **All 46 tests
passed at 390x844 — nothing fell out**, and no horizontal overflow on any of the
three. That result means very little on its own: the wall passed every assertion
it had while being unusable on a phone. So each screen was screenshotted and
read.

**What the screenshots show.** Layout is genuinely sound on all three: fields go
full-width, one control per row, real touch targets, genre chips wrap, no
cramping or clipping. The nav wraps to two rows, which costs ~85px of every
screen but is legible.

**The one thing worth judging on the phone: LENGTH.** /want-list/new is 1,022px
— sectioned ("The record" / "How much you want it" / "The dig" / "What you will
pay"), submit reachable in about one scroll, and it reads well. /records/new is
**2,439px** and /records/[id]/edit **2,451px** — roughly three screens, ~20
fields, with Add record reachable only after scrolling past all of them. Nothing
is broken; it is a long form on a small screen. Whether that is acceptable for
"logging a record quickly" (the form's own words) is Adam's call on the device.
/want-list/new demonstrates the sectioning that would shorten it if it is not.

### §11 flow 10's "usable one-handed": judged on device, with a trigger

Flow 10 reads "Run the collection list and lookup flows at a mobile viewport
(390x844) — search and filter must be usable one-handed." The viewport half is
covered: collection-filters, collection-widths and lookup-flows run in the
`mobile` project, spec-mandated for exactly this.

**The "one-handed" half is deliberately NOT asserted.** A touch-target-size
check would pass on a screen nobody can actually use — the same false comfort as
a centred-ness assertion on a clipped record. It is recorded here as judged on
device instead.

**Trigger:** revisit if Adam reports reaching for a control on the collection or
lookup screen with a second hand, or if either screen gains a control that sits
above the fold's midpoint on a 390px viewport. Until then the assertion stays
absent on purpose, not by omission.

---

### 2026-08-23 — step 15's mobile pass: the remaining five screens

`auth`, `record-detail`, `images`, `snippet`, `stats`, `suggestions` added to the
`mobile` project. **All 67 passed at 390x844 — nothing fell out**, no horizontal
overflow anywhere. With the form specs, all twelve routes have now been rendered
at 390px, and the project's testMatch list is the record of that.

Assertions passing means little here, so each screen was screenshotted and read.

**Sound at 390, no action:**
  - `/login` — vertically centred, full-width field and button, large targets.
  - `/stats` — full-width bars, label left / count right, sections spaced.
  - `/suggestions` — good prose measure, clear empty state.
  - `/records/[id]` overall — sectioned Record / Pressing / Acquisition / Filed
    under / Notes, monospace catalogue and matrix, sensible hierarchy at 1,929px.

**One real defect: the snippet panel header** (`SnippetPanel.tsx:88`). A
`flex items-baseline justify-between` row with `shrink-0` on the right-hand
element. At 390 the long "Writing notes is not configured on this deployment."
keeps its full width, squeezing the `h2` into a three-line stack — "ABOUT / THIS
/ RECORD" — beside it. It never wraps to a second row. Everything else on that
page is single-column, so it reads as a broken fragment.

**One uncomfortable, not broken: `/want-list` rows.** Title, priority chip,
"Mark acquired" and "Delete" share one row, with Delete — a destructive action —
immediately beside the primary one and hard against the right edge. Mis-tap risk
on a phone.

**A method note.** The first screenshot run produced five 404s, and the tell was
`scrollHeight=844` on every screen — the viewport height exactly, i.e. no
content. The probe had POSTed pressing fields (`catalogNumber`, `matrixRunout`,
`country`) inline to `/api/records`, which rejects unknown keys; pressings are
found-or-created through `/api/pressings`. A uniform number across unrelated
screens is a broken instrument, not a finding — the same lesson as the luminance
scan that could not tell sleeve from wall.

---

### 2026-08-23 — the mobile fixes: /records/new, the snippet header, want-list Delete

**/records/new was an ORDERING problem, not a length one.** Adam's reading, and
the rest of the pass confirmed it: /records/[id] is nearly as long (1,929px) and
does not have the problem, because its length is reference material you SCAN.
/records/new was length you had to TRAVERSE to reach the button.

§5.7 makes Discogs lookup the primary entry path, so this form is the fallback —
the case is a shop, holding a sleeve. The essentials are what cannot be
reconstructed once the record is back in the rack: **title, artist, catalog
number, matrix/runout**. Catalog number is the collector's identifier (CLAUDE.md
§8) and matrix is what distinguishes THIS pressing from another of the same
album — §8's worst confusion. Both were two-thirds down the page in "Pressing
details"; they now sit with title and artist.

**Media condition was considered and rejected**, on Adam's argument: he holds the
record for as long as he owns it, and a grade assigned under shop lighting is one
he would revise after a listen. Recording a provisional grade as fact is the
confidently-misleading shape §8 rejects. Paid was left out for the same class of
reason — recorded at leisure. Three fields and a button.

Result: **2,439px -> one screen, with Add record at y=662 on an 844px viewport**
— visible without scrolling.

**The same pattern does NOT fit both forms, so it was not forced.** Sectioning
helps both; COLLAPSING helps only create. On /records/[id]/edit the disclosure is
open (`recordId !== undefined`), because editing is a deliberate act with an
intent and the field you came for is usually inside — and worse, a collapsed
section on edit hides values that ARE recorded, which reads as data loss.
`<details>` rather than React state: keyboard-reachable, announced as a
disclosure, works without JS.

**What fell out: 18 E2E failures**, 9 chromium and 9 mobile — every one a
create-mode test filling a field now behind the disclosure. That is the honest
cost of the change and it was a design question, not a test-fixing one: the
tests assert behaviour that still works, and what changed is that reaching those
fields now takes a tap, exactly as it does for a person. So the four copies of
`formReady` open the disclosure. Note `<details>`/`<summary>` do NOT expose
`group`/`button` roles here — both `getByRole` attempts matched zero — so the
helper uses element selectors, verified by probe rather than assumed.

**The snippet header** (`SnippetPanel.tsx`): was `flex items-baseline
justify-between` with `shrink-0` on the message, which held its width at 390 and
squeezed the h2 into "ABOUT / THIS / RECORD". Now `flex-wrap` with `shrink-0` on
the HEADING, so the message drops beneath it when there is no room. Unchanged on
a wide screen.

**The want-list Delete**: was adjacent to "Mark acquired", hard against the right
edge — a destructive control under the thumb, a few pixels from the one you
want. §7.3 already requires a confirmation naming what is lost, so the risk was
never an unrecoverable delete; it was the mis-tap and the interruption. Set
apart with a separator and a leading margin rather than hidden behind a menu,
which would trade a small annoyance for a hunt.

**Leak after the mobile pass: 14, and it is not a regression.** The residue is
the same app-created category documented above, doubled because the mobile
project now runs those specs on two projects: `-answered` and `-merge` artists
that `manage`'s merge and match-candidate flows create server-side, `Lena Raine`
from `discogs-prefill`'s import, and **two** `Inline Artist` rows rather than one
— `record-form:262`'s "New artist name" UI-creation site, now exercised on
chromium AND mobile. Still well under the ~30 trigger.

**A wrong theory, recorded because the correction matters.** The rise from 10 to
14 was first attributed to `wall-scene.spec.ts` running two teardown mechanisms
at once — its own `seededArtists` loop from unit (a) plus `trackArtist` from (b),
deleting every artist twice. That duplication was REAL and is removed (the local
copy also missed want-list rows, the exact gap that pinned an artist earlier),
along with two `artist.json()` double-reads an earlier de-duplication patch had
missed. But it was not the cause: deleting twice leaks nothing. The cause was
simply wider mobile coverage. Measuring the leftovers by NAME is what
distinguished the two — the count alone would have left the wrong theory
standing.

---

### RULE: `toBeVisible()` does not mean ON SCREEN

A Playwright fact this project has now been caught by, written here because the
next test author will otherwise be caught by it too.

`expect(locator).toBeVisible()` means the element is in the layout with a
non-empty bounding box and is not `hidden`/`display:none`. **It is true for an
element scrolled a thousand pixels out of view.** Playwright also auto-scrolls
before interacting, so a `click()` on an off-screen element succeeds silently.

**The assertion that can fail is `toBeInViewport()`** — it reports an
intersection ratio, and the lookup defect below produced "viewport ratio 0": the
element was in the document and zero percent on screen.

Use `toBeVisible` for "this exists and is rendered". Use `toBeInViewport` for any
claim about what a person can SEE without scrolling — which is most claims about
a phone.

### 2026-08-24 — /lookup: "I tap search and nothing happens"

Reported from a phone. **Reproduced in Chromium at 390x844 against the live
server over the LAN** (not on the physical device).

**Neither hypothesis was the cause, and both were checked rather than assumed.**
The button is not dead: the request fires, `GET /api/discogs/search` returns
**200** with live Discogs data, there are no console errors, and the button does
flip to "Searching…". `DISCOGS_TOKEN` is present and valid — an authenticated
curl returned real releases — so the credential-at-point-of-use theory is ruled
out. (`DISCOGS_USER_AGENT` is absent from `.env.local`, but search works without
it; noted, not the cause.)

**The defect is positional.** The 50 results rendered at **y=921 on an 844px
viewport** — below the fold, behind a twelve-field form. A successful search
produced no visible change, which is indistinguishable from a dead button.

**Why 44 passing mobile tests could not see it.** Two reasons, both worth
naming. `lookup-flows` stubs the endpoint with `page.route(...route.fulfill)`,
so it exercises the renderer and never the round trip — correct, since the suite
must not make live calls. And every assertion is `toBeVisible`, which is true
off-screen (see the rule above). Same shape as the wall: the tests assert
EXISTENCE, never that you can see it.

**The fix is a shape, not a scroll.** Scrolling to the results was smaller and
treats the symptom: the form stays a screen tall, and what you look at after
submitting is still the query you just typed — a position that happens rather
than one anyone chose. Instead:

  - Four essentials visible — catno, artist, title, format. Format earns its
    place on a measured finding already recorded in the file: a Carpenters
    search returned 32 results, mostly CD and cassette, when one medium is in
    the hand. The other eight go behind "More search terms"; all twelve §5.7
    parameters stay expressible.
  - **After a search the query collapses to one tappable line** — "Searched:
    Artist Discharge · Edit" — and the results take the screen. Re-opened
    automatically when a search errors or returns nothing, because then the
    query IS what needs attention.

Results now start at **y=345**, on screen with no scrolling. The same collapse
as /records/new an hour earlier, with one difference that argued for going
further: on that form the hidden fields may never be filled, whereas here the
query is re-run, so it must stop being the thing you look at.

**A flake in the sleeve test, found by the full matrix.** The
`fits INSIDE the visible wall region` test failed once in a full run, passed in
isolation against the IDENTICAL database, and passed across all 223 chromium
tests. So it was neither leftover fixtures nor the wall's layout.

The cause: after the phase reaches `settled` — a state flag — the test waited a
FIXED 400ms for the texture to upload and paint. Under the full matrix, where
chromium and mobile compete for one dev server, that is not enough; the scan
photographed a frame where the sleeve had not rendered and found lit wall at the
region top, which is indistinguishable from the clipping defect the test exists
for. It now polls until the sleeve is painted as a solid block.

**A fixed timeout standing in for a render is the same class as a hard-coded
coordinate** — it encodes one machine's timing rather than the condition that
matters. Re-mutated the placement fix afterwards to confirm the test still fails
on the real defect: it does, same `sleeve top 172` message.

**Correction to the DISCOGS_USER_AGENT flag** (2026-08-24). Reported at the end
of the /lookup unit as "absent from `.env.local`". That was right about the file
and wrong about the premise: the Discogs User-Agent is not missing, it is
HARD-CODED in `src/lib/discogs/client.ts` —
`RecordCollection/0.1 +https://github.com/adamshaw/record-collection` — so §6's
requirement is met and there is no absence bug. `DISCOGS_USER_AGENT` is not in
the env schema and nothing reads it.

Checking it properly turned up a real defect instead: **that contact URL 404s.**
The remote is `ashaw315/record-collection`, not `adamshaw`. §6 wants the header
to give Discogs "somewhere to look", and this one names nobody. Added to R6,
which already owns every secret's path from `.env.local` to Vercel, with the
production question attached: it is a literal where every other credential is
environment-derived, so it cannot be changed without a deploy — which matters
when the party you are identifying yourself to is the one asking you to change
it. Not fixed here; R6 decides env-var-vs-literal, and the URL is wrong either
way.

---

# R6 — deploy readiness. 2026-08-24.

Read-only review before step 16. Nothing fixed, nothing deployed. Baseline at
the time of writing: `npm test` 2841 passed / 1 skipped / 184 files, typecheck
clean, lint clean, `npm run build` exit 0.

**The review's own central claim was wrong once, and the correction is the most
useful thing in it.** I observed a production build boot with `env -i`, serve
`/login` 200, and answer `POST /api/auth/login` with 401 "Incorrect password"
and no log line — and drafted it as "fail-fast does not hold". It does hold.
`next start` loads `.env.local` from the project directory regardless of cwd, so
`env -i` never produced an empty environment. Hiding `.env.local` outright gives
the designed behaviour: `instrumentation.ts` throws, EVERY route 500s including
`/login`, and the log names all five missing variables. Verified, then restored.
Standing rule earned again — the wrong version of this finding would have sent
step 16 rewriting a boot path that works.

## Confident, verified by reproduction

1. **`APP_PASSWORD_HASH` accepts a truncated hash at boot.** `z.string().min(1)`
   (`src/lib/env/schema.ts:47`). Probed `parseEnv` directly: the 60→46
   truncation `.env.example` explicitly warns about is ACCEPTED, as are
   `'hello'` and `' '`. Probed bcryptjs: a 46-char hash returns `false` (does
   not throw), so `verifyPassword` yields false and the login route — which is
   NOT wrapped in `withErrorHandling` — returns 401 "Incorrect password" and
   logs nothing. **This is the worst failure mode found**, and worse than the
   all-missing case: all-missing is loud 500s naming the variable, whereas a
   malformed hash boots green, serves a normal-looking login screen, and rejects
   the correct password forever. `SESSION_SECRET`/`CRON_SECRET` carry `.min(32)`
   with stated reasoning; this one carries nothing. A boot-time shape check
   (`/^\$2[aby]\$\d{2}\$.{53}$/`) costs nothing and does not weaken the
   deliberately-vague 401.

2. **The `cause`-chain log leak is real and reproduced.** `describeError`
   (`src/lib/errors/describe.ts`) falls back to `JSON.stringify` for a
   NON-Error cause. Probe output, verbatim:
   `Upload failed ← caused by: {"status":401,"request":{"headers":{"authorization":"Bearer vercel_blob_rw_SUPERSECRET"}}}`
   and a nested one serialising `{"connectionString":"postgresql://user:HUNTER2@..."}`.
   `withErrorHandling` sends that to `logger.error`. Latent locally; the moment
   logs are retained by Vercel it is not. The fix NOTES already specifies
   (redacted projection + a test planting a secret in a nested cause) is right.

3. **The test guard can fire in production.** `isTestContext()`
   (`src/lib/discogs/no-live-calls.ts:46-55`) returns true if `TEST_DATABASE_URL`
   is set AT ALL. It gates Discogs, MusicBrainz AND Anthropic. One stray
   `TEST_DATABASE_URL` in Vercel — a plausible paste, since `.env.example`
   documents it — refuses every external call with *"A test tried to reach
   api.discogs.com… CLAUDE.md §2 forbids live external calls from tests"*, on
   production, with no test running. **Correcting the subagent finding that
   raised it:** the `catch → return true` branch is NOT independently
   reachable, because an unparseable `DATABASE_URL` fails boot first. The
   `TEST_DATABASE_URL` line is the whole risk.

4. **Zero `maxDuration` exports repo-wide and no `vercel.json`.** Grepped: 0
   hits. Every function gets the plan default. Three routes exceed 10s: the
   lineup walk (`walkLineup` awaited inline at
   `src/app/api/artists/[id]/lineup/route.ts:120,130`; ~32 sequential
   MusicBrainz requests at 1/sec plus ~6-8 Neon round-trips per member), and
   both LLM routes (Opus, effort `high`, 4000 max tokens, non-streaming).
   Mitigation already in place for the walk: `walk-lineup.ts:115` commits each
   membership as it resolves, so a kill is not data loss and a re-walk resumes
   from cache.

5. **A serverless timeout burns an LLM quota slot with no refund.**
   `releaseLlmRequest` is called ONLY in the `isAuthFailure` branch
   (`suggestions/ai/route.ts:95`, `snippet/route.ts:133`). A platform kill after
   `claimLlmRequest` leaves the row. 10/hour, so repeated timeouts exhaust it
   silently. Couples directly to (4).

6. **Both rate limiters are per-isolate module state.** Discogs
   (`client.ts:142,183`, 60/min) and MusicBrainz (`musicbrainz/client.ts:120,214`,
   1/sec). `TokenBucket` sets `this.tokens = options.capacity` in its
   constructor (`limiter.ts:43`), so **every cold start hands out a full
   bucket**. `blockedUntil` (`limiter.ts:37`) means a learned `Retry-After` does
   not propagate between isolates. MusicBrainz is the serious one: its limit is
   per-IP and a term of use, and `walk-lineup.ts:141-144` turns the resulting
   503 into a silently PARTIAL lineup. The codebase already reasoned this
   through for the LLM quota (`llm/rate-limit.ts:15-17`, DB-backed with an
   advisory lock — genuinely correct) and did not back-port it.

7. **Discogs has no auth-failure branch.** `discogsErrorResponse`
   (`src/lib/discogs/errors.ts:18-45`) branches on 429 and 404 only; a 401/403
   falls through to *"Could not reach Discogs. Try again shortly."* — retry
   advice for a credential that will never self-correct. This is R5's F1 shape,
   fixed for Anthropic (`isAuthFailure`) and not here. Two paths swallow it
   entirely: `discogs-prefill.ts:113-117` returns null (blank form, no notice)
   and `verify-release.ts:50-58` calls it `unreachable`.

8. **`db:test:reset` leaves an unusable database, exit 0.** Ran it: container
   destroyed and recreated, and because `docker-compose.yml` puts the data dir
   on `tmpfs`, the new database has **0 tables**. Nothing in the script
   migrates. §14 lists it among scripts that must pass. Restored with
   `NODE_ENV=test npx drizzle-kit migrate` → 23 tables.

9. **The Discogs User-Agent URL 404s.** Measured: `adamshaw/record-collection`
   → 404, `ashaw315/record-collection` → 200. Structure is otherwise sound —
   validated at construction, injected via options — so only the literal is
   wrong.

## Verified and NOT a problem — worth recording so they are not re-proposed

- **Production migration works, contradicting the prompt's premise.** `npm run
  db:migrate` DOES reach the Neon branch: `drizzle.config.ts` → `resolveDriver`
  returns `DATABASE_URL` whenever `TEST_DATABASE_URL` is absent. Ran it against
  the dev/prod branch: "migrations applied successfully", exit 0, using the `pg`
  driver over TCP. A supported command exists.
- **No schema drift anywhere.** `drizzle-kit check` → "Everything's fine".
  `drizzle-kit generate` → "No schema changes, nothing to migrate" (no file
  created; `git status drizzle/` clean, still 16 migrations). Both Neon branches
  carry an IDENTICAL 17-row ledger against a 16-entry journal; I hashed every
  `.sql` file and all 16 match a ledger row exactly. The one extra row
  (`1786715119768`, hash `73d1b9eb029c061e`) matches no file in the repo and its
  `id` sequence skips 13-14, consistent with R5's hand-repair. It is harmless
  going forward — drizzle compares by timestamp and it sits below the high-water
  mark. **The open question "what applied 0011-0013 without ledger rows" is
  still not answered**: `~/.zsh_history` is readable but stops at 2026-08-18 and
  contains no `drizzle-kit push` for this project. The distinguishing diff the
  NOTES entry proposed now returns clean, so that evidence has expired.
- **Transactions over the real Neon driver pass.**
  `test/integration/neon-transactions.test.ts` — 10 passed, 1 skipped (the skip
  is the gate's own by-name test, correct when configured). Covers acquire,
  PATCH, import rollback and concurrent acquire. CLAUDE.md §2's "verify before
  deploy, do not assume" is DISCHARGED.
- **`sslmode` is currently the STRONG behaviour, not the weak one.** Measured
  with `pg-connection-string`: `sslmode=require` and `sslmode=verify-full` both
  parse to `{}` (full verification); only `uselibpqcompat=true` yields
  `rejectUnauthorized:false`. So this is a FUTURE risk on a `pg` v9 bump, not a
  present weakness — and it affects the `pg` path (migrations, tests) only,
  since production queries go over the Neon WebSocket driver, which does its own
  TLS. One word, worth taking, but not urgent and not a deploy blocker.
- **Build needs no secrets.** `env -i … npx next build` succeeds. A Vercel build
  cannot fail on missing env — which also means a misconfigured deploy builds
  green and fails at runtime.
- **Filesystem, self-referential URLs, and detached background work are clean.**
  No `fs` in runtime code; images go to Blob; every external URL is an absolute
  https constant; the import route awaits the cover attach with a comment naming
  the frozen-function hazard. Lineup progress is derived from committed DB rows
  rather than a progress table — the right shape for serverless.
- **`nanoid` high advisory is build-time only** — reaches the tree solely via
  `postcss` (`npm ls nanoid`), not the request path.

## The cron does not exist at all

`CRON_PATHS` (`src/lib/auth/routes.ts:37`) and the middleware bearer check
(`middleware.ts:47-55`) are wired for `/api/discogs/refresh-prices`. There is no
such route file and no `vercel.json`. That is step 16's work, not a defect — but
it means §14's "cron job registered" is unmet, and the auth half is already
built and tested, which is the good half. **Coupling to record for step 16:**
`PriceHistory.tsx:64` had its empty-state copy corrected in R4 specifically
because it promised a cron that does not exist. When the cron lands, that copy
has to be revisited or it will understate the truth in the other direction.

## Residue — cannot be checked without deploying

Handed to the after-deploy pass, stated rather than left implicit:
whether the Neon WebSocket pool survives freeze/thaw and how the first query
after a thaw behaves; actual cold-start frequency and therefore how much the
full-bucket-per-isolate problem really costs; real function durations for the
walk and the LLM routes against the plan limit; whether Vercel's env storage
performs `$` expansion on a bcrypt hash (`.env.example` asserts it does not —
unverified by me); and whether `BLOB_READ_WRITE_TOKEN` is auto-injected when a
Blob store is linked, which would make its malformed case unreachable.

**R6's E2E baseline, and a ninth data point on the mobile contention.**
`npx playwright test --retries=0`, no file argument: **390 passed, 20 skipped, 0
failed, exit 0, 10.8m.** Recorded because the mobile contention is a defect that
only shows up as a RATE, and single runs cannot see one. R5's remediation
measured two full runs in three producing seven and five HARD failures, 100%
`[mobile]`, all at login. Step 15 unit 1 diagnosed accumulation WITHIN a run
rather than contention between workers and fixed it with per-spec cleanup; the
four runs after that produced one failure (an unrelated hydration flake). This
run makes five clean-or-near-clean at `--retries=0` since the fix, and the first
with zero failures of any kind. Not proof — the earlier rate was 2-in-3, so one
clean run is weak evidence — but it is the right direction and worth a line so
the next reviewer can count.

---

## Presence is not shape — a standing check, after the third instance

**Named 2026-08-24, fixing R6's finding 1.** Three times now an is-configured
check has tested that a credential is THERE rather than that it is USABLE, and
each time the failure landed somewhere the check could not see.

1. **The placeholder Anthropic key** (R5's F1). `isAnthropicConfigured()` tested
   non-empty. A key ending `-put-your-key-here` passed, claimed a rate-limit
   slot, and produced a 500 the user could not act on. Fixed by
   `PLACEHOLDER_PATTERNS` — a shape check.
2. **The shell-escaped password hash.** Next expands `$VAR` in env values, so an
   unescaped 60-character bcrypt hash silently becomes 46. `.env.example`
   documents the trap in full; nothing enforced it.
3. **`APP_PASSWORD_HASH: z.string().min(1)`** — this one. The trap documented at
   (2) was never checked at the boundary that could catch it.

**Why this one was the worst.** The other two announce themselves: a 500, or a
dev server that will not start. A malformed hash boots green, renders a normal
`/login`, and rejects the CORRECT password forever with 401 "Incorrect password"
and no log line — because bcryptjs returns `false` rather than throwing (probed:
46 chars → false; only an illegal round count throws, and the catch swallows
that too), and the login route is deliberately vague and not wrapped in
`withErrorHandling`. **A deploy that looks healthy and is completely broken.**

**The check to apply, not the fix to copy.** For every credential, ask what
happens when it is ABSENT, MALFORMED, and VALID-BUT-WRONG — and whether the user
is told something they can act on. Presence answers only the first. R6 ran this
against all eight and the survivors are recorded above: `BLOB_READ_WRITE_TOKEN`
still tests presence only (malformed → 500), `MUSICBRAINZ_CONTACT_EMAIL` accepts
any string including `"x"`, and Discogs has no auth-failure branch at all so a
dead token reads as an outage.

**What the fix measured, and it answers R6's open question.** The escaping is
genuinely environment-specific, which was a question and is now a fact:

- **Next expands `$VAR` and needs `\$2b\$10\$`.** Verified by unescaping
  `.env.test` and booting `next dev`: instrumentation threw, naming
  APP_PASSWORD_HASH. Restored.
- **dotenv — which vitest and drizzle-kit use — neither expands nor
  unescapes**, so it hands the same file's value over with the backslashes
  intact, 63 characters long. Verified directly.

So the same file is read two different ways, and the schema is the one place
both paths meet. `APP_PASSWORD_HASH` therefore **normalises before it
validates** — `.transform(unescapeDollars)` then `.refine(BCRYPT_HASH)`. A
backslash appears in no bcrypt hash, so collapsing `\$` to `$` is unambiguous,
and the check itself still demands exactly 60 characters of real bcrypt. A value
mis-escaped for the runtime that reads it still fails; a Vercel value, which
needs no escaping, passes through untouched.

**Two wrong versions of this fix were built and discarded, and the reason is
worth keeping.** The first split the schema so `drizzle.config.ts` validated
only the database variables — which worked for the CLI and left the 902
integration-test failures untouched, because vitest loads `.env.test` through
the same dotenv. The second was to accept the escaped form as a valid shape,
which would have rebuilt the original defect: on Vercel nothing unescapes, so a
genuinely mis-escaped hash would have passed boot and still broken every login.
Normalising is the only version that keeps the check honest on all three paths.

**How the wrong versions were caught, and it was nearly not.** Three full-suite
runs reported exit 0 while this was broken. All three were CONTAMINATED — two
`vitest run` processes were alive at once against the shared test database, my
own harness error. The first clean single run failed 902 tests in 61 files.
**Concurrent runs against one database do not report a weaker version of the
truth; they report a different and false one.** The same shape as the E2E
accumulation finding: passing in isolation is not evidence, and neither is
passing in a crowd.

**A fixture that was never valid.** Both `src/env.test.ts` and
`src/lib/env/edge.test.ts` used `'$2b$12$abc…MNOPQR'` as their "valid
environment" hash. It is **61 characters** — not a bcrypt hash. It passed only
because the schema checked `.min(1)`, so the fixture asserting "this is a
complete valid environment" was asserting something false. Corrected to 60, with
a test asserting the length so it cannot drift back. Same shape as the NFD/NFC
precondition entry: **a test whose precondition is silently wrong tests
nothing.**

---

## "The script ran" is not "the script did what it is for"

**Named 2026-08-24, fixing R6's `db:test:reset` finding.** §14 lists eleven
scripts that "must pass", and passing is checked as an exit code.
`db:test:reset` satisfied that bar for the entire project while being broken:
`docker compose down && docker compose up` destroyed the container, and because
`docker-compose.yml` puts the data directory on `tmpfs`, the recreated database
had **zero tables**. Nothing in the script migrated. Exit 0.

The damage is displaced, which is what makes it expensive: the next `npm test`
fails somewhere unrelated, and the cause is a command earlier that reported
success. R6 found it by running the script and counting tables rather than
reading its exit code.

Fixed by chaining `NODE_ENV=test drizzle-kit migrate`. The `NODE_ENV=test` is
the load-bearing half — `drizzle.config.ts` loads `.env.test` only in that mode,
and without it the CLI reads `.env.local` and points at the Neon database.
`resolveDriver` would refuse, so the failure would be loud rather than
destructive, but aiming a command correctly is not the same as relying on a
downstream guard to catch it.

### The audit R6 was asked for: does any other §14 script have this property?

Checked all eleven. **Two do, and one of them matters.**

- **`db:migrate` — YES, and this is the serious one.** R5 documented it: when
  the ledger and journal diverge, drizzle recomputes the same batch, dies on
  `42701`, rolls back, **prints success and exits 0** — permanently, since a
  failed run changes neither ledger nor journal. That is the same shape as
  `db:test:reset` but against the database where recovery is worst. It is
  already mitigated rather than fixed: `db:verify` exists precisely because "exit
  0 does not prove it" (`test/repo/migrations-complete.test.ts` says so in its
  header), and R6 confirmed both Neon branches are currently consistent —
  `drizzle-kit check` clean, `generate` reporting nothing pending, all 16 file
  hashes matching ledger rows. **Not fixed here** because the fix is a
  post-migrate schema assertion, which is step 16's deploy-path work, and
  because inventing one mid-remediation against a database this session cannot
  safely break is how a worse thing happens. **Trigger: step 16**, alongside the
  cron and `vercel.json`.
- **`db:generate` — yes, harmlessly.** "No schema changes, nothing to migrate"
  exits 0, which is correct: nothing to do IS the job. Recorded so it is not
  re-raised as an instance.
- **`db:test:up` — no.** Its name is a claim about the CONTAINER, and it starts
  one. `test/global-setup.ts` migrates on every run, so the path it sits on
  applies migrations before any test reads a table. `db:test:reset` differed
  because DESTROYING data is the thing it does, which made "and now there is no
  schema" a surprise rather than a description.
- **`dev`, `build`, `start`, `typecheck`, `lint`, `test`, `test:e2e` — no.**
  Each fails non-zero on the thing it is for. The E2E caveat is not exit-code
  shaped: `--retries=0` is what distinguishes "passes" from "passes on the
  second try", and REVIEW-PLAN already carries it as a standing check.

**The general form, worth carrying past this instance:** a script whose exit
code reports the last command in a chain reports that command, not the chain's
purpose. When the purpose is a STATE — a database with a schema, a branch at a
revision — assert the state, not the exit. `db:verify` is the pattern; it exists
because someone had already learned this once about the journal.

---

## Step 16 unit 1 — the serverless limits, and three decisions that are not fixes

**2026-08-24.** The four items R6 parked with "trigger: step 16 itself". Two
were built; two were decided against and recorded, which is the part a later
reader is most likely to misread.

### A slot cannot be released when the isolate is killed — so the claim expires instead

R6 finding 5 named the leak at the release site. **It cannot be fixed there,
and this is a fact about the platform rather than a limitation of the code.** A
function killed at `maxDuration` runs no `finally`, no cleanup callback and no
signal handler; the isolate stops executing. Anything shaped like "release the
slot on timeout" would have to run inside the function being killed.

So the fix moved to the claim: `llm_requests.completed_at`, nullable, and a
claim with no completion stops counting once it is older than
`ABANDONED_CLAIM_MS` (90s). A row claimed and never completed IS the timeout
signature.

**90 seconds is derived, not chosen.** The ceiling is 60s, so nothing can still
be running at 90 — the platform has already killed it. That margin is the whole
safety argument: the rule must never evict a claim whose call is still in
flight, because that would admit an eleventh concurrent request against a budget
of ten. **If the ceiling ever rises this must rise with it**, and the test that
holds the line is `does not evict a claim that could still be running`, which
ages a row to 45s — past R5's measured 44s call and still inside the ceiling.

**The completion is the half that makes the expiry safe**, and it is easy to
read as bookkeeping. Without it every claim looks abandoned after 90 seconds and
the budget refunds itself, which is worse than the leak: a quota that forgets is
not a quota. Both routes mark completion ABOVE their readability check, because
§9.2 is explicit that an unreadable response keeps its slot — it was served and
billed. Only the auth-failure path removes its row, and that distinction is now
asserted in both route test files.

**A test whose fixture had silently stopped describing what it meant.** `a
refusal names when capacity returns` inserted ten rows aged 30 minutes with no
completion. Under the new rule those are ten TIMED-OUT calls, and refusing an
eleventh on their account is exactly the leak being removed — so the test failed,
correctly. The fixture was changed and the assertion was not: this test is about
the refusal MESSAGE, and a genuinely full window now means ten calls that were
*served*. Same shape as the NFD/NFC entry — a precondition that quietly stopped
holding while the assertion still looked right.

### The transport limiters stay in memory — a decision, not an oversight

**A later reader will see per-isolate token buckets next to a DB-backed LLM
quota and read it as something nobody got round to. It was decided.**

The difference is what each limiter protects. The LLM quota caps a **paid
budget** against a **hard external ceiling**, and needed to be durable — it is,
via `llm_requests` and an advisory lock. The Discogs (60/min) and MusicBrainz
(1/sec) buckets protect **politeness to an API that one person's usage will not
strain**: 60 requests a minute is not reachable by someone clicking a UI, even
across several warm isolates. Making them durable costs a database round-trip on
the hot path of every Discogs call — real latency, plus a second thing that can
fail — to remove a risk that does not exist at this scale.

**Trigger: a production 429 from Discogs or a 503 from MusicBrainz.** That is
the observation that would make the exposure real rather than theoretical.

**The coupling that would invalidate this, written down because it would not
look like a change to rate limiting.** What keeps MusicBrainz polite is §12 step
11's design decision that the lineup walk is **on demand, per artist, never a
bulk crawl** — one walk at a time, sequential, self-limiting. If the walk ever
becomes eager or batched, this decision dies with it. That would arrive looking
like a performance improvement.

### Two facts about the deployed app — not defects, things to know before meeting them

**A slow LLM response is killed at 60 seconds and the user gets nothing.**
`maxDuration` covers the WHOLE function — auth, the claim, the collection
summary, the model call, the parse — not just the Anthropic request. R5 measured
44s for one gap analysis, so the nominal 16s of headroom is less than it sounds,
and 60 is Hobby's ceiling rather than a tuned number: there is no larger value
available. The quota slot is no longer lost when this happens, which is what
unit 1 fixed; the answer still is.

**A killed lineup walk keeps its partial data and resumes; the request dies
without a response.** `walkLineup` commits each membership as it resolves and
`saveMemberships` is idempotent (§4.3), so nothing resolved is lost and a
re-walk continues rather than restarting. What is lost is the ANSWER: the UI
shows a network error while the progress sits in the database, and clicking
again picks it up. ~32 sequential requests at 1/sec is ~32s of the 60 before any
database work counts, so this is marginal rather than safe — but it degrades to
slow-and-recoverable rather than to lost.

### `maxDuration` lives in the route files, not in `vercel.json`

It was written as a `vercel.json` `functions` glob first and moved. **A glob
that stops matching — a renamed directory, a moved route — fails SILENTLY back
to the plan default**, and nothing in the build notices. A route segment export
is validated by Next at build time and appears in
`.next/server/functions-config-manifest.json`, which is what Vercel reads.

That manifest is now asserted by `test/repo/serverless-limits.test.ts`, which
began as a probe — reading the manifest to check the value had actually reached
the output — and became a test per CLAUDE.md §2. It also asserts `vercel.json`
declares NO `functions` block, so the drift of two sources for one limit cannot
come back quietly. Verified by mutation: changing the limit to 10 and
re-introducing a `functions` key each failed a test.

**`vercel.json` carries no `crons` key**, because the price refresh is driven by
GitHub Actions (Hobby caps Vercel crons at once a day; Actions has no such cap).
The endpoint's auth is unaffected and was already caller-agnostic — see unit 2.

---

## Step 16 unit 2 — the cron route, and what absence means

**2026-08-24.** `POST /api/discogs/refresh-prices` (§5.7, §6, §7.5). The route
R6 recorded as "wired but nonexistent": `CRON_PATHS` and the middleware bearer
check were built and tested, and there was no handler.

### Absence is not an observation — no data, no row

§6 says to write `price_history` rows from Discogs and **does not say what
absence means**, so this was a decision rather than a reading. A row recording
"no data" and no row at all are different claims and the difference is
load-bearing here, because §7.6's chain reads `price_history` to compute what
the collection is worth.

**There is no honest row for absence.** `price_type` is `new | used | asking`
(§4.2) and all three assert a price EXISTS — so recording "nothing found" means
inventing either a figure or a type, and the value chain then reads it as what
the record is worth. §10a states the governing rule in its own first sentence:
*"later layers degrade to absence, never to a guess."* This project has already
shipped the opposite once, when the market cache wrote `layersFetched:
['floor','ladder']` unconditionally and served an empty range as measured truth
for seven days.

**What makes the choice safe is that absence is COUNTED, not silent.** A run
that wrote zero rows and a run that never happened are the same observation from
outside, which is R6's assert-the-state rule pointed at a cron's own report. The
response carries `attempted / written / skipped / failed`.

**And a 404 is not a 503.** Discogs answering "this release is gone" is a
settled fact about that record — `skipped`. Discogs failing to answer is "we do
not know" — `failed`. Folding them together would report an outage as "nothing
to price", which is absence recorded as fact again. The market route already
draws this exact line for its cache marker; the reasoning is reused rather than
reinvented.

### The floor is an `asking` price, and typing it wrongly would inflate the collection

A marketplace floor is a listing nobody has paid, which is precisely §7.2's
definition of `asking`. Not `used`: **§7.6's estimated-value chain reads `used`
then `new` and excludes `asking` deliberately**, so typing these rows as `used`
would silently inflate the collection's value with prices nobody paid. R4 fixed
the mirror image of this in the sparkline. Mutation-verified: changing the type
to `used` fails the test that names the rule.

### Per-item isolation, demonstrated rather than implied

Append-only means a partial run leaves no corrupt row — but **that is a property
of the TABLE and says nothing about whether the loop keeps going.** A refresh
that aborts on the first failure is equally append-safe and equally useless: one
dead release would freeze every record after it, every week, with nothing to say
so.

So it is proved rather than inferred. The failing record is placed in the MIDDLE
of three, because a failure at the end passes even on a route that aborts.
Mutation-verified: replacing the per-item catch with a rethrow fails four tests,
including the one that asserts the records either side are priced.

The catch is deliberately broad rather than `DiscogsError`-only. An unexpected
throw from a malformed payload is exactly the case where one dead record must
not cost the other forty.

### Three smaller decisions, stated so they are not read as oversights

- **The cache is deliberately NOT read.** `market_cache`'s TTL is 7 days and
  this job runs weekly, so reading it would hand the refresh its own last write
  and record week-old figures as a new measurement. It writes to the cache but
  never reads it.
- **Layer 1 only.** The layer-2 ladder needs a second call per release, doubling
  the largest scheduled spend of a 60/minute budget, and `price_history` stores
  one figure per row.
- **Records only, not the want list.** §10a is explicit that want-list market
  figures sit "beside `max_price`, never merged with it", fetched on demand.
  Refreshing them here would write rows nothing reads.
- **One row per RECORD, not per release.** §4 makes duplicate records legal: two
  copies of one pressing are two rows sharing a `pressing_id`, each with its own
  history. A `DISTINCT` on the release id would leave one copy's history frozen.

### The cron is GitHub Actions, not Vercel Cron

Decided this session: Hobby caps Vercel crons at once a day, Actions has no such
cap. **The consequence worth recording is that the request now comes from
outside the deployment**, so `CRON_SECRET` is the only thing between the
internet and this endpoint.

The middleware check holds for it unchanged, and this was confirmed rather than
assumed: it is a constant-time comparison against an `Authorization: Bearer`
header with **no Vercel-specific signal** — no `x-vercel-*`, no IP allowlist.
§3's wording ("Vercel Cron sends this automatically") describes the original
caller, not a requirement.

**A positive E2E was added**, because only the negative existed. `rejects the
cron endpoint without a bearer token` passes even when the endpoint stops being
a cron path at all — a mutation emptying `CRON_PATHS` leaves it green, since a
session-protected endpoint also 401s without a token. The new test
(`accepts the cron endpoint from any caller presenting the secret`) is the one
that fails on that mutation. The pair pins both directions.

**The secret goes in GitHub's encrypted secrets, never in the workflow file** —
that file is committed and this repository is public.

### The `PriceHistory` copy coupling, checked and deliberately NOT changed

R6 recorded that `PriceHistory.tsx`'s empty state was corrected in R4 because it
promised a cron that did not exist, and warned that when the cron landed the
copy would "understate the truth in the other direction". Checked this unit.

**It is still accurate today and was left alone.** The current copy makes no
claim about a refresh at all — it says either "No prices recorded yet. 'What it
goes for now' above shows what the market says today" or, with no Discogs
release linked, that nothing can look one up. Both are present-tense facts, and
both remain true while the route exists but nothing schedules it.

It becomes understated only once the cron is **scheduled and running**, which is
unit 4. Changing working copy mid-unit against a state that does not exist yet
is the shape CLAUDE.md §4 forbids, so this is recorded rather than acted on.
**Trigger: the first successful scheduled run.**

Worth noting the neighbouring branch already anticipates these rows correctly:
"Nothing here says what a copy sold for — only what someone asked" is exactly
the right sentence for a history made of `asking`-typed cron rows, and it was
written before the cron existed.

---

## Step 16 unit 3 — `db:migrate` asserts state, and WHICH state was the decision

**2026-08-24.** The assertion R6 parked here, declining to invent one
mid-remediation against a database it could not safely break.

### The choice: ledger-versus-journal, not snapshot-versus-schema

Two candidate assertions, decided against the three real incidents rather than
in principle.

| Incident | State when found | ledger↔journal | snapshot↔schema |
|---|---|---|---|
| **Dev** (R5) | ledger 12 vs journal 15; 0011–0013 present and unrecorded; 0014 absent | **catches** | catches, but only via 0014 |
| **Neon test branch** (13c u1) | ledger 11 vs journal 16; 0011–0013 present and unrecorded | **catches** | **MISSES those three** |
| **The orphan row** (both branches) | one inert ledger row matching no journal entry | correctly silent | silent |

**The middle row decides it.** On the Neon branch 0011–0013's schema was already
present and CORRECT — a schema diff reports clean on a database that is one
`db:migrate` away from the permanent 42701 loop. The divergence was in the
bookkeeping, and the bookkeeping is the INPUT to drizzle's decision about what
to run. Asserting the schema checks the output of a process whose input is
already corrupt.

So the stronger-sounding check is the weaker one for the failure this project
actually has. Recorded because "compare the snapshot to the database" is the
obvious answer and would have passed the incident it most needed to catch.

### Directional, and that is load-bearing

**Every journal entry must have a ledger row; extra ledger rows are fine.** Both
Neon branches carry the inert orphan (`created_at=1786715119768`, matching no
file, below the high-water mark so it can never gate anything). NOTES already
recorded that a first verification script asserted "row count equals journal
length" and failed on a HEALTHY database — a check that cries wolf is a check
somebody disables. That mistake is now pinned by a test.

Matched on **hash**, not timestamp: a committed migration edited after being
applied keeps its `when` and changes its bytes, so a timestamp match would call
that consistent while the database holds something the repo no longer describes.
The hash is sha256 of the raw `.sql` bytes — **measured against a row drizzle
itself wrote**, not assumed, and pinned by a test that compares the reader's
hash to the ledger's for migration 0000. Getting this wrong is the worst
available failure here: every entry would look unapplied on a healthy database.

### What it actually did, measured on a drifted database

A throwaway database was migrated, then its three most recent ledger rows
deleted — schema complete, ledger behind, the exact incident shape:

- `drizzle-kit migrate` → **exit 0**, "applying migrations..."
- `npm run db:verify:state` → **exit 1**, naming `0014_odd_susan_delgado`,
  `0015_records_snippet`, `0016_elite_ben_grimm`
- `npm run db:migrate` (now chained) → **exit 1**

That comparison is the unit in one line: the same database, one command calling
it fine and the other naming what is wrong with it.

**The probe is committed as a test** rather than left in the session
(CLAUDE.md §2). It builds and drops its own throwaway database, never the shared
one — the point is to leave a database in a state nothing should be left in.
Mutation-verified: an always-consistent comparison fails 6 tests including that
one.

### Two implementation notes worth keeping

**A script, not a vitest file like `db:verify`.** That one targets the local
container because vitest loads `.env.test`. This must verify whichever database
`db:migrate` just migrated — **including production** — so it resolves its
target through the same `parseEnv` and `resolveDriver` that `drizzle.config.ts`
uses. A verifier pointed at a different database from the migration it verifies
is worse than none.

**No new dependency.** The obvious route was `tsx`, which is present but only
transitively via drizzle-kit — depending on it directly would be an undeclared
dependency. Node 24 strips TypeScript natively (`--experimental-strip-types`),
so the shared comparison is IMPORTED rather than reimplemented in JavaScript. A
second copy of this logic is how two callers end up disagreeing about what
consistent means.

`db:test:reset` gained the same assertion, since it migrates too.

### An E2E finding this unit did not act on: `wall-scene` 1093 fails ~2 runs in 5, byte-identically

**Measured across step 16's five full `--retries=0` runs**, recorded here rather
than fixed because it is outside units 1–3's scope (CLAUDE.md §4).

`e2e/wall-scene.spec.ts:1093` — "the pulled sleeve fits INSIDE the visible wall
region on a short viewport" — failed runs 1 and 5 and passed runs 2, 3 and 4.
Both failures are **byte-identical**:

    Error: sleeve top 172 must clear the wall region top 172
    Expected: > 172   Received: 172

It also passed 3/3 when run in isolation with `-g`.

**Why this is not simply "flake" and should not be filed as such.** NOTES'
moving-failure rule works on the SET: flake presents as different tests failing
each run. This is one test, one assertion, one pair of values, twice. The
symptom is deterministic; only its occurrence is not. That is the signature of a
genuine boundary rather than a race — the test scans screenshot rows starting
AT `region.top` and fails on equality, so a one-pixel difference in WebGL raster
under full-suite GPU contention lands the sleeve's first lit row exactly on the
boundary.

**Two readings, and they need different fixes**, which is why this is recorded
rather than guessed at:
1. The test is right and the scene genuinely clips the sleeve at the wall's top
   edge under contention — a real §10b defect at a specific viewport.
2. The measurement is right at the boundary and the scan should start one row
   above `region.top` so "first lit row == region.top" can be distinguished from
   "sleeve extends above the region".

**The distinguishing evidence is already on disk**: Playwright saved
`test-results/wall-scene-the-pulled-slee-909be--region-on-a-short-viewport-chromium/`
with the screenshot from a failing run. Reading whether the sleeve is visibly
clipped in that image answers which reading is right, without needing to
reproduce the rate.

**Trigger: R6's after-deploy pass**, which is already re-running the suite — or
sooner if it appears in a run where the wall is what changed. Not deploy-
blocking: it is a scene-geometry assertion, touches nothing on the deploy path,
and the app is unaffected.

---

## A DATA change opened an untested branch, and the suite could not see it

**Named 2026-08-25, found in production minutes after the first deploy.** New
shape, and the most uncomfortable one in this file: **nothing in the code
changed, no test failed, and the app broke.**

Removing the wall seed took the collection from 125 records to 4.
`WallScene.tsx:317` sizes the render surface `max(layout.height,
viewportFloor)` — so with 125 records `layout.height` was 1488–3224px and won
every time, and the padding branch **had never once executed**. Four records
make the wall 248px, the viewport wins, and the surface is padded to 974.

`viewRegionCentrePx` then aimed the pulled record at the centre of the visible
slice of that PADDED SURFACE rather than at the wall content, which ends at 248.
Measured before the fix:

| viewport | records | padded | record landed |
|---|---|---|---|
| desktop 879 | 4 | yes | **195px below the shelf** |
| desktop 1280 | 4 | yes | **154px below** |
| phone 390 | 4 | yes | **107px below** |
| any | 125 | no | on the shelf |

It read as "clicking a spine does nothing", because the record was pulled into
the black field below the wall every time. Clicking there dismissed it, and the
return animation flying home through the visible area was the "appears for a
second" the QA report described.

**Why no test caught it, and this is the general form.** Every fixture in the
suite — unit, E2E, and every manual QA pass — used a collection large enough to
fill the viewport. The condition `layout.height < viewportFloor` is not
expressible as a code path anyone forgot to test; it is a property of the DATA,
and the data was always big. A suite whose fixtures are all large cannot see a
branch that only a small one reaches.

**CORRECTION, same day: the first fix for this was WRONG and was reverted.**
Aiming at the wall content put the record's top at page-y 53 on a 974px
viewport — ABOVE the page chrome at 197, behind the heading and controls. I
verified it sat inside the CANVAS, which it did, and never checked it sat below
the furniture drawn on top of the canvas. **A frame error in the verification of
a frame error**, committed one entry after writing the rule. The real defect was
narrower: the canvas's floor was `window.innerHeight` while the canvas starts
~197px down the page, so the surface overshot the fold by exactly that much and
the record settled in padding that existed only because the canvas was too tall.
The fix is the floor (`innerHeight - chromeAbove`), measured to leave tall walls
untouched. See "the canvas is a container" below.

**The check to apply, past this instance:** when a code path is selected by
`max()`, `min()`, or any comparison against a property of the user's data, ask
which side of that comparison the fixtures sit on — and whether ANY fixture sits
on the other. Here every fixture sat on one side for the whole project.

**And a deployment note that generalises:** the four-record state was created by
a database operation approved on its own merits (removing invented seed data
before production). Nothing about that operation looked like a code change, and
nothing about it suggested running the suite afterwards. **A data change can be
a code change, when the code branches on the data's shape.**

---

## The frame family, tenth instance — a POSITION must name its frame too

**2026-08-25.** The standing rule from step 13 says a size assertion must name
which frame it is a fraction of. This is the same defect one axis over: **the
scene surface and the wall content are two different heights, and the record was
aimed at the wrong one.**

    const height = Math.max(layout.height, viewportFloor);  // the RENDER SURFACE
    layout.height                                            // where the SHELVES stop

Both are "the height of the wall" in English. They are equal for every
collection tall enough to fill the viewport, which is what made the confusion
survive ten instances of a rule written to prevent exactly it.

**The amendment: a position expressed in a frame's coordinates must name the
frame, not just the axis.** `viewRegionCentre` now takes `wallContentHeight` and
`sceneHeight` as separate named parameters rather than one `height`, so a caller
cannot pass the wrong one without writing its name. That is the same mitigation
the size rule uses — make the frame appear in the call — applied to position.

Worth noting the two are not interchangeable even in principle: clamping to the
content is right when the wall is SHORT, and following the visible region is
right when it is TALL and scrolls. A single "height" cannot express a rule whose
answer depends on which of two heights is larger.

**A measurement trap inside the fix, recorded because it nearly caused a wrong
second fix.** Checking the result in WORLD coordinates said the record was still
76px below the shelf, and the obvious response was to adjust the clamp. It was
the wrong comparison: `viewY` solves for the world-y that makes the record
APPEAR at the aimed point, and the record floats nearer the camera than the
wall, so its world-y is deliberately not its apparent y. Projected back to
screen it appears at canvas-y 124 — the exact centre of a 248px wall. **The
frame rule applies to the verification as much as to the code.**

### Could the destination fix affect the 1093 intermittent? MEASURED: no, and "unrelated" was worth checking

**The challenge was right.** `wall-scene.spec.ts:1093` ("the pulled sleeve fits
INSIDE the visible wall region on a short viewport") seeds **12 records at
390x664**, which is a **496px wall in a 664px scene — the PADDED branch.** So it
runs through the exact code this fix changed, and calling it unrelated would
have been a claim rather than an observation.

**What the measurement shows: the clamp is inert there.** Computed before and
after, same fixture:

| | aim | sleeve drawn (page-y) |
|---|---|---|
| before | 234 | 255..606 |
| after | 234 | 255..606 |

Byte-identical. The reason is that the clamp is `min(visibleBottom,
wallContentHeight)`, and on that fixture the VISIBLE REGION ends first — canvas-y
467 against a 496px wall — so the new bound never binds. The clamp only changes
anything when the wall is shorter than the visible region, and 12 records at
390px is not that case.

So: shared code path, no behavioural change, measured rather than asserted. The
intermittent stands where it was, now on its **third sighting with byte-identical
values** (`sleeve top 172 must clear the wall region top 172`) across seven full
runs. Still a rate rather than a flake, still not fixed in this unit, trigger
unchanged: R6's after-deploy pass, with the failing screenshot already on disk.

### The two E2E tests, and why the old contract was weakened rather than narrowed

`settles CENTRED in view, at any collection size` asserted two properties at
once, and one of them is now deliberately false. Split rather than narrowed,
because a narrowed test would leave the second property living in a fixture
nobody reads as a contract — **which is exactly how this shipped: no fixture
existed on the short side of the boundary.**

- `settles in the same place regardless of which ROW it came from` — the
  surviving property, the one the original defect was about.
- `a wall SHORTER than the viewport puts the record over the shelf, not below
  it` — the new contract, and the fixture that never existed.

The reasoning is written in the spec file beside the assertions rather than only
here, since a test being deliberately weakened is exactly what a later reader
will otherwise take for drift.

**The counts had to be MEASURED, and the first attempt was wrong.** Spine widths
come from title text, so record count does not map to rows by arithmetic. I
assumed 40 records would be two rows; it is one. Measured at 1280x720: 5 → 1 row
(248px, padded), 40 → **still 1 row**, 90 → 2 rows (496px, still padded), 110 →
3 rows (744px, unpadded), 200 → 4 rows (992px, unpadded). The row test now uses
110 and 200 — same side of the boundary, different row counts, different camera
distances.

Mutation-verified, and the split is confirmed by which test fails: restoring the
bug fails the short-wall test (`screenY 426, wall ends 380`) and leaves the row
test GREEN. Two tests, two properties, no overlap.

`data-wall-content-height` is published for the new test, because asserting the
record is "somewhere on screen" passes against the bug — the record was on
screen, just below the shelf. The assertion has to name the frame.

### The 1093 intermittent, handed forward rather than left implicit

**Four sightings, byte-identical every time**, across seven full `--retries=0`
runs this session (failed runs 1 and 5 of the first seven; failed again after
the destination fix):

    Error: sleeve top 172 must clear the wall region top 172
    Expected: > 172   Received: 172

**It has never once failed differently.** That is a RATE on a deterministic
symptom, not flake — NOTES' moving-failure rule works on the SET, and this set
has one member with one pair of values. It also passes 3/3 when run in isolation
with `-g`, so it needs full-suite load to appear.

**Measured NOT to be touched by step 16's destination fix.** Its fixture (12
records at 390x664) is on the padded side of the boundary, so it shares the
changed code path — but the clamp is inert there: aim 234 and sleeve 255..606
before and after, identical, because the visible region ends at canvas-y 467
before the 496px wall does. Shared path, no behavioural change.

**Whoever picks this up does not start from scratch.** On disk:
`test-results/wall-scene-the-pulled-slee-909be--region-on-a-short-viewport-chromium/`
holds the screenshot from a failing run. Reading whether the sleeve is visibly
CLIPPED at the wall's top edge in that image decides between the two candidate
readings without needing to reproduce the rate:

1. the scene genuinely clips the sleeve at that viewport under contention — a
   real §10b defect;
2. the measurement sits exactly on the boundary and the scan should start one
   row ABOVE `region.top`, so "first lit row == region.top" is distinguishable
   from "sleeve extends past the region".

**Trigger: R6's after-deploy pass**, which re-runs the suite anyway. Not
deploy-blocking — scene geometry, nothing on the deploy path, app unaffected.

---

## The app had never run against a SMALL collection until today

**2026-08-25, and this is the entry to re-read before adding records one at a
time.**

Every fixture, every screenshot, every manual judgement about the wall — the
tilt, the rise, the destination, the panels, the phone pass at 390 and the
desktop pass at 1280 — was made against **125 seeded records**. The seed existed
to make the wall look like a wall, and it did its job. What nobody noticed is
that it also made one branch of the wall's own sizing (`max(layout.height,
viewportFloor)`) unreachable for the entire life of the feature.

Removing the seed was right, and it surfaced within minutes a defect that had
been **latent since the wall was built**: the pulled record aimed at the padded
surface rather than the wall content, and on a short collection landed in the
black below the shelf. On every viewport, including the phone.

**What to expect while the collection grows from four to a hundred.** The wall
crosses the padding boundary somewhere around one full row per viewport — at
1280 that is roughly 40+ records for a second row, and the boundary itself
(`layout.height >= viewportHeight`) around 110 records at 720px, 90 at 390px.
Between four and there, the app is running in a regime nothing has ever
exercised. Specific things worth a look as records are added:

- **The first wrap to a second row**, which changes the wall's height for the
  first time in real use.
- **Crossing the padding boundary itself**, where the destination arithmetic
  switches from content-clamped to region-following. Both sides are now tested;
  the crossing is not.
- **Facet counts, filters and the empty state at small N** — a filter that
  matches one record now produces a one-spine wall, which is the shortest wall
  the layout can make.
- **Anything whose fixture was "125 records"**, which is most of the E2E suite.

**The general rule this earns:** a seed that makes a feature look realistic also
makes the small-N case unreachable, and small-N is the state every real
collection starts in. When a fixture is chosen to look like the mature product,
something else has to cover the immature one — and here nothing did, for the
whole life of the feature.

---

## The canvas is a container, and its height is a constraint on what renders inside it

**2026-08-25, the second fix for the short-collection defect — the first was
wrong and is corrected above.**

`WallScene` floors its render surface at the viewport so a short collection
reads as wall rather than as empty shelves. The floor was `window.innerHeight`.
**The canvas starts below the nav and heading**, so the surface overshot the
fold by exactly that chrome height: at 974px the canvas ran to page-y 1171.

The record then settled at 318..853 — **on screen**, but hanging below a 248px
shelf into black padding that existed only because the canvas was too tall.

**Four candidates, measured rather than argued** (four records, three
viewports):

| | desktop 879 | phone 390 | desktop 1280 |
|---|---|---|---|
| A: aim at wall content (reverted) | 53..589 **above chrome** | 146..497 **above** | 74..569 **above** |
| B: as shipped | 318..853 on screen, detached | 345..696 | 301..796 |
| C: canvas = visible height | 372..799 ✓ | 345..696 ✓ | 355..742 ✓ |
| D: floor = innerHeight − chrome | **identical to C** | identical | identical |

**C and D are the same change described two ways**, which is worth recording:
"make the canvas exactly the visible height" and "correct the floor" converge
because `max(248, 777) = 777`. The one-line version was chosen for blast radius.

**The tall-wall question, answered with numbers before building.** The two cases
do NOT want different things — they want the same `max()` with a correct floor:

| collection | wall | canvas before → after |
|---|---|---|
| 125 @1280 | 992 | 992 → 992 unchanged |
| 125 @390 | 3224 | 3224 → 3224 unchanged |
| 40 @1280 | 496 | 900 → **703** |
| 12 @390 | 496 | 664 → **496** |

When content exceeds the visible height it wins the `max()` and the page scrolls
it exactly as before. **No inner scroll container and no camera panning with
scroll** — both of which a literal "the wall always fills the viewport" rule
would have forced. Asking for this measurement before the third fix is what kept
that out.

**A24a does not say the wall must be viewport-height.** Read again: "the shelf
is a view that owns the screen, not a section of a page… they do not sit above
the wall taking vertical space from it". That is about what sits ABOVE the
canvas, not about the canvas's own height.

**And the wall CONTENT is deliberately not stretched to fill the viewport.**
A24c removed the four-row minimum because empty shelves "say in furniture what a
count says in words"; stretching a 248px shelf to 777px is the same mistake in a
different geometry. The shelf stays its size; the space below it inside the
canvas is what the pulled record comes forward into.

Two E2E tests, mutation-verified as a pair: restoring the old floor fails "a
SHORT wall does not extend the canvas past the fold" (`canvas ends 852, fold
720`) and leaves "a TALL wall still scrolls" green.

---

## UNEXPLAINED: "clicking a spine does nothing" does not match the arithmetic

**Open, not closed, and deliberately not absorbed into the placement fix.**

The reported symptom was *"the spine responds but no record appears"* and *"the
record never opens"*. Under the code that was live at the time (B above), the
record settled at **page-y 318..853 on a 974px viewport — on screen.** So the
symptom and the geometry disagree, and the placement fix does not explain it.

**Two candidate readings, neither asserted:**

1. **It appeared and read as nothing.** A record hanging below a 248px shelf in
   a black field, on a viewport the reader had never used the feature on, with
   four records where every previous look had 125. "That is wrong" and "nothing
   happened" are not easy to separate in the moment.
2. **A second cause not yet found.** Something genuinely prevented the pull on
   that session — a state the code paths read as sound do not cover.

**What would distinguish them:** a spine click that produces NOTHING AT ALL after
the floor fix is live. Under the fix the record lands at 372..799, mid-screen and
overlapping the shelf; if that still reads as nothing happening, reading (1) is
excluded and there is a second bug to find.

**Trigger: the next time a spine click produces no visible record.** Same
treatment as the 1093 intermittent — evidence preserved, trigger named, no story
asserted. The earlier NOTES entry's confident "it read as clicking does nothing
because the record went into the black" was written before the arithmetic was
checked and is corrected by this one.

---

## THE LARGEST FINDING IN THIS PROJECT: a feature that passed every test and had never once worked

**2026-08-25.** §10b's wall — the primary screen, the app's signature feature —
**had never pulled a record in a real browser.** Not once, on any build, since
step 13. 393 E2E tests passed against it, including tests written specifically
to assert that a record leaves its shelf.

### What was wrong

The render loop had ONE step slot (`animate: (next) => { step = next }`). Two
independent animations shared it:

- the **hover ease** (`settleProud`), which pushes a spine proud of the wall;
- the **rise**, which pulls the record out.

`settleProud` guarded itself with an `easing` flag that only the step's FINAL
frame cleared. When the rise's `animate` replaced that step mid-ease, the flag
was never released — so `settleProud` returned early on every subsequent hover,
and **no animation of any kind ran again for the life of the page**.

Observed on production, by eye: hover a spine, it eases proud. Click it, and it
stays stuck out while no record comes off the shelf. Hover any other spine
afterwards and nothing moves at all.

**A second defect sat behind the first**, found only after fixing it: the
closure's `hoveredId` was never cleared when a record was pulled. The guard
"nothing hovers while a record is out" returns BEFORE clearing it, so after the
record went home, re-hovering that same spine gave `previous === next`,
`shouldRedraw` said no, and that spine could never ease again. Same shape one
layer along: a value that outlived the state it described.

### Why no test could see it — and this is the part worth carrying

**You must hover a spine to click it.** A real person hovers, watches the ease,
and clicks a few hundred milliseconds later — while the ease is still running.
The collision is therefore GUARANTEED in real use.

Every test dispatches `page.mouse.click(x, y)`, which moves and clicks in the
same call, landing both in the same frame before `settleProud` has installed its
step. **The fixture could not contain the bug**, because the fixture performs an
interaction a real user cannot perform: a click with no live hover behind it.

That is a different failure from every other instrument finding in this file.
The others were about measuring the wrong thing. This one is about a fixture
whose SHAPE excluded the defect — the test was not wrong, it was describing an
interaction that does not exist outside a test harness.

**The generalisation, and it is R7's territory:** *how many other tests dispatch
an interaction that a real user cannot perform in isolation?* Anywhere a test
synthesises one event where a human necessarily produces a sequence — click
without hover, submit without focus, tap without touchstart, drop without drag —
the test is asserting a path production never takes. This project has one
confirmed instance and has never looked for others.

### The fix

**Two animation lanes, `'wall'` and `'record'`.** The split is the domain's, not
a convenience: the wall and the pulled record are different objects touching
different meshes, and they animate simultaneously in normal use. Within the
`'record'` lane replacement is PRESERVED and load-bearing — rise, return, slide
and flip all write the same pose, and two at once is the orphaned-slide hazard
`WallScene` already documented. Replacement-as-mutual-exclusion survives exactly
where it was correct.

The `easing` flag is **deleted**. Installing into a lane already excludes; a
hand-rolled lock that only its holder can release is what turned a collision
into a permanent one.

`lane` is a REQUIRED parameter rather than defaulted, and the compiler
immediately found all five call sites — including two in `BoxCanvas` and two in
the loop's own tests. A default would have silently put a future animation in
whichever lane it named.

**Also fixed, same unit, same shape:** the return's `setState({ phase: 'idle' })`
was unguarded, where every other settle in the file reads
`(current) => current.phase === X ? … : current`. An animation finishing is a
claim about the motion it ran, not about whatever the state has become since.

### The tests, and the division between them is deliberate

- **Unit** (`render-loop.test.ts`): a record animation does not cancel a wall
  animation; a record animation DOES replace another record animation; a
  finishing step does not remove the step that replaced it. Mutation-verified —
  restoring one shared slot fails the first and leaves the other two green.
- **E2E**: "a spine clicked DURING its hover ease still pulls the record" (with
  an explicit mid-ease wait, and asserting `slotGap` AND the settle, because the
  bug set `data-pulled` correctly while never moving the mesh), and "the wall
  keeps animating after a record has been pulled and returned".

**Measured honestly: the E2E does NOT catch the lane collision.** Putting hover
back in the record lane leaves both E2E tests green, because headless timing
never lands a click mid-ease — the very reason this shipped. The unit test is
the guard for the collision; the E2E is the guard for the stuck-hover state.
Recorded because "we have a test for it" would otherwise be false in the
specific way that caused this.

**A draw-count assertion was written and discarded.** `__drawCount` cannot
distinguish a healthy settled wall from a permanently dead one — both draw
nothing. `data-proud-z`, the hovered spine's own offset, is published instead:
the thing the ease exists to produce.

---

## RULE: report a symptom as what is SEEN, not as what it looks like it means

**Named 2026-08-25, after three descriptions of one defect were all wrong.**

The report was *"the record renders BEHIND the shelf — the shelf plane and its
lit edge draw over the sleeve"*. I accepted it, looked for an occlusion bug, and
proposed checking the destination's z sign and depth testing. A screenshot
appeared to confirm it. Three independent descriptions agreed.

**All three were wrong.** Measurement:

| | value |
|---|---|
| shelf lip's projected screen y (from the MESH) | canvas-y **247**, unchanged before and after a pull |
| bright line "cutting across" the record | canvas-y **361** |
| record's published centre / height | 246 / ~230px → bottom edge ≈ **361** |

The bright line is **the record's own bottom edge**, lit. Nothing was behind
anything. The record is a box at roughly 1:25 thickness, so its bottom edge is a
thin bright horizontal strip — and a thin bright horizontal strip where a shelf
would be *is what a shelf looks like*.

**The description imported a mechanism.** "Behind" is not an observation; it is
an inference from an observation, and it named the wrong object. Every step that
followed searched the space that word defined: z sign, depth testing, render
order, material assignment, layout branch. All clean, because the premise was.

**The rule:** describe the pixels — *"a bright horizontal line crosses the sleeve
about a third up, and the sleeve continues below it darker"* — and let the
diagnosis assign the mechanism. The same rule the project already applies to
tests (assert what is rendered, not what produced it), pointed at bug reports.

**What broke the loop was publishing an object's own position** rather than
inferring it from pixels. `data-shelf-lip-screen-y` exists for that reason and is
kept: the pixel scan could say a bright line was *somewhere*, but only the mesh
could say whether that somewhere was the shelf. Two objects at different heights
had read as one shelf in two places, which is impossible with a fixed camera and
stationary meshes — and the impossibility was the clue that the identification,
not the geometry, was wrong.

---

## The band is composition, not rendering — measured on both viewports

**2026-08-25.** Same column, same record, four records, 390px wide:

| viewport | edge luma | edge y | shelf lip y | separation |
|---|---|---|---|---|
| 664 (short) | **235** | 361 | 247 | **114px** |
| 844 (tall) | **235** | 538 | 247 | **291px** |

**Identical luma. Same object. Only the separation changes.** The record's lit
bottom edge is equally bright on the viewport where it looks correct; there it
sits 291px from the shelf lip and reads as the record's own edge, and at 114px
the eye merges the two into one piece of furniture.

So there is **no rendering defect** — the lighting is not wrong, the depth is
not wrong, and the edge is not being drawn by the wrong material. What differs
is where the record sits relative to the shelf, which is a composition question
for §10b rather than a bug. Left open deliberately rather than fixed: the fix
would be geometric (where the record settles) or about the edge's prominence,
and both are design decisions.

**Trigger: the next §10b pass, or Adam judging it on a short viewport.**

### The registration defect found on the way, and NOT the cause

`wallMaterials` held the pulled record's own `faced` and `plain` materials — four
of its six faces (`[faced, plain, plain, plain, cover, backFace]`) — so
`setWallDim` darkened them along with the wall the record had just left. That is
wrong on its own terms: the wall is what a record is pulled OUT of.

**Mutation-tested, and it is NOT what produces the band.** With the defect the
record's bottom edge measures luma 235; the edge was never dimming. Fixed
separately, in its own commit, for its own reasons — and recorded here so a
later reader does not mistake it for the fix to what was photographed.

The fix keeps resting spines dimming (a spine IS wall) and exempts only the
record that is out, by id.

---

## Step 16 unit 4 — the cron fired from GitHub Actions, end to end

**2026-08-25, 19:08 UTC.** The last unproven piece of step 16: not the route
(which had already answered a direct call with the secret), but the WORKFLOW —
that both secrets resolve, the URL is right, and a bearer header reaches the
route from outside Vercel entirely.

`gh workflow run "Refresh prices"` → **success in 13 seconds**, and the evidence
is the three halves rather than the green tick:

1. **The run's outcome:** `conclusion: success`.
2. **The endpoint's response**, captured in the workflow log by the `tee` the
   step was written with: `{"data":{"attempted":4,"written":4,"skipped":0,"failed":0}}`.
   The counts are what distinguish a run that did nothing from a run that never
   happened, which is why the route reports them.
3. **The rows landed:** `price_history` 7 → 11, exactly four written, each
   `asking`/`discogs` — Dire Straits $5.00, Luther Vandross $2.99, The Blues
   Project $4.99, Discharge $23.24.

**And the negative still holds:** no token → 401, wrong token → 401, on the same
deployed endpoint minutes later. The bearer check is caller-agnostic in both
directions, which is what makes an external scheduler safe here.

Weekly at 04:17 UTC Mondays, plus `workflow_dispatch`. `APP_URL` and
`CRON_SECRET` live in GitHub's encrypted secrets; neither appears in the
workflow file, verified mechanically before the first push.

**§14's "cron job registered" is now met** — and met more strongly than the spec
asks, since it has been observed to fire rather than merely configured.

---

## R6 after-deploy pass — 2026-08-25

The second half of R6, which REVIEW-PLAN specifies as "before step 16, and again
after the first deploy". Everything below was measured against the live
deployment, not inferred.

### The residue R6 handed forward, now answered

R6's pre-deploy pass listed five things "only deploying can show". Four are
answered; one is not yet.

**Neon WebSocket driver under real serverless conditions — WORKS.** The cron
endpoint prices four records, each a live Discogs call plus DB writes, in
**1.4s cold and 0.83s warm**. Three CONCURRENT runs all returned 200
(0.98s/1.74s/1.83s) with no pool exhaustion and no error. Cold starts on static
routes: 0.26s first, 0.12s after. The full-bucket-per-isolate problem R6 worried
about costs nothing at this scale because a cold start is a quarter-second, not
a stall.

**Actual function durations against the plan limit — comfortable.** The refresh
is the only route exercised in production so far and it finishes in under two
seconds against a 60s ceiling. The LLM routes and the lineup walk remain
unmeasured in production (nobody has run them there).

**Whether Vercel's env storage expands `$` in a bcrypt hash — NO.** Answered at
first deploy: the app boots, and since R6's fix `APP_PASSWORD_HASH` is
`.transform(unescapeDollars).refine(BCRYPT_HASH)`, demanding exactly 60
characters of real bcrypt. A `$`-truncated 46-char value would throw at
instrumentation and 500 every route. It did not.

**Whether a linked Blob store auto-injects its token — NO.** The project had a
Blob store attached with `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY` present,
and `BLOB_READ_WRITE_TOKEN` absent. It had to be added by hand.

**Neon pool behaviour across freeze/thaw — STILL OPEN.** Requires a genuinely
idle deployment (hours), not a gap between test requests. Trigger: the first
morning Adam opens the app after not touching it overnight.

### The cron, against R6's four questions

- **Authentication:** holds in both directions on the deployed endpoint. No
  token → 401, wrong token → 401, correct token → 200, verified minutes apart.
- **Idempotence: it is APPEND-ONLY, not idempotent, and that is per §7.5** — but
  the consequence is worth stating. Seven runs produced **seven identical
  observations per record** ($5.00 × 7 for Dire Straits). A weekly schedule
  makes that a true price history; repeated runs make it noise. Nothing dedupes
  a same-day repeat.
- **Partial completion:** per-item isolation is built and unit-tested; not
  exercised in production because no release has failed there yet.
- **Is a failed run visible?** Yes — GitHub emails on workflow failure, and the
  step uses `--fail-with-body` plus `tee`, so the route's own counts are in the
  log whether it succeeds or fails.

### Findings

**1. A misconfigured `APP_URL` fails as 401, not 404.** Measured: POSTing to
`/api/discogs/refresh-price` (a typo, no trailing `s`) returns **401**, because
middleware runs before routing and a non-cron path with a bearer token is simply
unauthenticated. So a wrong path in the workflow reads as "the secret is wrong"
rather than "that endpoint does not exist" — the classic wrong-diagnosis shape.
Not urgent; recorded so the next person debugging a red workflow does not spend
an hour on the secret. **Trigger: if a scheduled run ever fails with 401.**

**2. My own testing wrote 24 duplicate rows into the real price history.**
Seven refresh runs (one workflow, six manual verification calls) × 4 records =
28 `discogs` rows where the collection has seen four distinct prices. Flagged to
Adam rather than cleaned unilaterally: they are real observations of a real
price, just repeated, and deleting rows from an append-only table is a decision
he should make.

**3. `llm_requests` holds 2 rows with `completed_at` NULL, both from
2026-08-20** — five days before the column existed. Pre-existing data, not a
failure of unit 1's completion write; both are far outside the 1-hour window and
count against nothing.

### Attack lines that came back clean

- **Production migration state:** `db:verify:state` → "Migration state
  consistent: 17 of 17 migrations applied", exit 0, against the live Neon
  database. The assertion unit 3 built is now doing its job on the database it
  was built for.
- **Auth boundary across the whole app:** `/`, `/stats`, `/manage`, `/lookup`,
  `/want-list` all 307 to `/login`; `/login` 200. The middleware matcher holds
  in production, not just in tests.
- **Region:** serving from `iad1`, matching `vercel.json`.
- **Discogs User-Agent:** `DISCOGS_CONTACT` is unset in production, which is
  correct — the default names the public repository, which R6 measured as a 200.

### What this pass could NOT check, and why

Everything behind the password. The point-of-use failure paths R6 asked about —
Blob, MusicBrainz contact, Anthropic — are all on authenticated routes, and I do
not have the app password. Those need Adam, or an E2E run against production,
which nothing is set up to do and which would write to his collection.

**Trigger: Adam using the app.** Specifically: an image upload (Blob), a lineup
walk (MusicBrainz contact), and a suggestion or snippet (Anthropic). Each should
fail LEGIBLY if its credential is wrong, and that legibility is what R6's first
attack line asked for and this pass cannot reach.

---

## A deliberate deletion from an append-only table, and why it was legitimate

**2026-08-25.** 24 rows deleted from `price_history`. §7.5 makes that table
append-only, so a deletion needs its reasoning recorded rather than assumed.

**What was deleted:** every `source='discogs'` row except the earliest per
record — 24 of 28, leaving 4.

**Why it is not a violation of §7.5.** The rule exists to preserve a record of
CHANGE. These 24 were seven runs of the same refresh within about five hours,
each recording the identical price ($5.00 × 7 for Dire Straits, $23.24 × 7 for
Grave New World, and so on). Repeating one observation seven times is not price
history; it is the same observation seven times. Nothing in the deleted set
carries information the surviving row does not — verified before deleting: the
doomed set's distinct prices are exactly the four kept prices.

**Provenance is the real argument.** These were not the app doing its job. One
run was the workflow; six were MY verification calls while proving the cron
worked. That is test residue in production data, and the fact that the mechanism
which produced it is append-only does not make the residue an observation.

**What was preserved:**
- one `discogs` row per record, the earliest — the genuine first measurement;
- all three of Adam's own manual entries on *Never Too Much* ($8.00 `new`,
  $120.00 `asking`, $10.00 `used`), untouched. Asserted after the delete, not
  assumed: non-discogs rows counted 3 before and 3 after.

**Backed up first**, to `~/record-collection-backups/deleted-duplicate-prices-2026-08-25.json`
— outside the working tree, so no `git add -A` can reach it. Read back and
verified (24 rows, all `source='discogs'`) before the transaction ran. One
transaction, `rowCount` 24, committed; state asserted afterwards rather than
inferred from the count.

**The two `llm_requests` rows with `completed_at` NULL are LEFT ALONE**, on
Adam's instruction and correctly: they predate the column by five days, so their
absence is accurate rather than missing. A null that means "this predates the
question" is not the same as a null that means "nobody answered".

**The general form:** a table being append-only constrains the APPLICATION, not
the operator. What it forbids is the app quietly losing history. A deliberate,
backed-up, reasoned removal of data the operator knows to be residue is a
different act — but it has to be argued in writing, which is what this entry is.

---

## THE STANDING CONCLUSION: the highest-yield check is Adam using the app

**Re-learned three times now, and today was the sharpest instance.**

- **R5** concluded it: "Manual QA after every step remains the highest-yield
  check available, and it is the one that keeps getting skipped." Four defects
  in this project were found by Adam using the thing — unreachable pressing
  entry, the fabricated 230g weight, a tier-1 badge that could never fire,
  illegible error reporting. None were spec violations, so no reviewer would
  have flagged them.
- **R6's after-deploy pass** reached the same wall from a different side: every
  point-of-use failure path is behind the password, so the question it most
  wanted to answer — does each credential fail LEGIBLY — is one only a user can
  ask.
- **Today, 2026-08-25**: after 393 E2E tests passed, using the app on a real
  browser found **four defects in one session** — the shared animation slot that
  meant the wall had never once pulled a record; the stuck `hoveredId` behind
  it; the canvas overshooting the fold on a short viewport; and the pulled
  record's own faces dimming with the wall. Every one invisible to the suite.

- **2026-08-25, again, hours later**: step 14c shipped with 3019 unit tests and
  409 E2E passing. Adam ran ONE lookup on a real record and found a limit none
  of them could express — the panel resolves to a RELEASE, not a stamper, and
  says nothing about which. Not a defect; a boundary the spec never named. See
  the entry at the end of this file.

**What is still unproven, and it is everything behind the password:** image
upload (Blob), the lineup walk (MusicBrainz contact), suggestions and snippets
(Anthropic). Each fails at point of use rather than at boot, so each is
un-exercised until someone does it.

**This is not a review step.** R7 and R8 are reviews with prompts and buckets;
this is Adam opening the app and using it, and the record of this project says
that is worth more than either. Written here rather than in REVIEW-PLAN because
it belongs to the build, not to the review schedule.

---

## `| tail` discards the exit code, and CLAUDE.md §10's E2E rule is what walks into it

**2026-08-25, session start for step 14c.** The full `--retries=0` E2E run
reported **exit code 0** while `test-results/.last-run.json` said
`{"status":"failed"}` and the terminal output said `1 failed`. Three signals
from one run, one of them wrong.

**The cause is the pipe, and it is NOT Playwright.** Reproduced by probe rather
than reasoned about, because the first reading — "Playwright exits 0 on
failure" — was wrong and would have sent the next person to the wrong file:

| Invocation | Exit |
|---|---|
| `npx playwright test <failing spec>` | **1** |
| `npx playwright test --grep <matches nothing>` | **1** |
| `npx playwright test <failing spec> 2>&1 \| tail -3` | **0** |

A shell pipeline reports the exit status of its LAST command. `tail` succeeds at
tailing whatever it is given, including the output of a run that failed. The
probe was a deliberate `expect(1).toBe(2)` spec, run both ways back to back;
`PIPESTATUS[0]` is empty under `zsh`, so the masking is total rather than merely
inconvenient.

**Why this is the same shape as `db:test:reset` and `db:migrate`, and belongs
with them.** All three are mechanisms whose success signal does not report what
it appears to report. `db:test:reset` exited 0 having produced a database with
zero tables; `db:migrate` exits 0 having rolled back on `42701`; this exits 0
having run a suite that failed. The general form already written there covers
it: **a script whose exit code reports the last command in a chain reports that
command, not the chain's purpose.** A pipeline is that chain, made ad hoc at the
call site — which is worse, because no file records it and it is retyped
differently every time.

**The specific trap, and it is named in CLAUDE.md.** §10's definition of done
requires "a full unopinionated `npx playwright test` run with no file argument".
A full run prints hundreds of lines, so the natural way to invoke it — the way
this session invoked it — is to pipe it through `tail`, `head` or `grep` to see
the summary. **Every one of those pipes destroys the exit code.** So long as a
human reads the summary text, this is harmless: the words `1 failed` were right
there and were acted on. It becomes a defect the moment the run is AUTOMATED —
a CI step, a pre-push hook, a wrapper script — because the automation reads the
number, and the number says the suite passed.

**What saved it here was `.last-run.json`**, which is state rather than an exit
code — exactly the fix pattern `db:verify` established for `db:migrate`. It is
already on disk after every run and it is unambiguous:

    test-results/.last-run.json → {"status":"failed","failedTests":[...]}

**The rule, for anyone automating §10's E2E requirement:** never key on the exit
code of a piped Playwright run. Either do not pipe (let the reporter write and
read the summary afterwards), or assert `.last-run.json`'s `status` field. The
same caution REVIEW-PLAN already carries about `--retries=0` applies here — both
are cases where the invocation, not the suite, decides whether the result means
what it looks like.

**Not fixed, because nothing is currently automated on it.** No CI workflow, npm
script or hook runs the E2E suite piped; §14's audit of the eleven scripts
covered `test:e2e` and correctly found it exit-code-honest, because the script
itself does not pipe. This is a hazard in how the suite is INVOKED by hand and by
whatever automates it next. **Trigger: the first time a full E2E run is put
behind a script, workflow or hook** — that is when the number starts being read
by something that cannot see the word "failed".

---

## The 1093 intermittent: trigger FIRED, sighting five, deciding screenshot on disk

**2026-08-25.** Recorded against the handed-forward entry above rather than
replacing it, because the entry's value is its measurement and that has not
changed.

**Sighting five, byte-identical to the previous four:**

    Error: sleeve top 172 must clear the wall region top 172
    Expected: > 172   Received: 172

Full `--retries=0` run at step 14c session start: **399 passed, 1 failed, 20
skipped**, 10.7m. Re-run in isolation immediately afterwards, 3/3 passed — the
same signature the entry records, needing full-suite load to appear. Five
sightings, one failure mode, one pair of values.

**The trigger has fired.** The entry named "R6's after-deploy pass, which
re-runs the suite anyway"; that pass happened earlier the same day, and this is
a further full run on top of it. Naming this explicitly because a fired trigger
that nobody notices firing is the failure mode a trigger exists to prevent —
this project's own rule that a deferral without a trigger is a decision never to
act has a corollary, which is that the trigger has to be OBSERVED.

**The deciding artifact is on disk, from THIS run:**

    test-results/wall-scene-the-pulled-slee-909be--region-on-a-short-viewport-chromium/

The entry says reading whether the sleeve is visibly CLIPPED at the wall's top
edge in that screenshot decides between the two candidate readings — a real
§10b geometry defect, or an off-by-one in where the scan starts — without
needing to reproduce the rate. That artifact is fresh rather than inferred.

**DELIBERATELY NOT RESOLVED, and by whose decision.** Adam's, at step 14c
session start: it is scene geometry on `/`, untouched by anything in a lookup
unit, and opening a WebGL diagnosis inside 14c is how a unit stops being one
unit. Recorded here so the next reader does not mistake five sightings and an
unopened screenshot for something nobody looked at.

**SIGHTING SIX, 2026-08-25**, on 14c's final full run: byte-identical again
(`sleeve top 172 must clear the wall region top 172`), 409 passed / 1 failed.
The count is now six and the reading is unchanged.

**The consequence for 14c's report, stated in advance so it is not quietly
dropped:** the baseline going into this unit is **one-red**. "Nothing regressed"
at step 7 is therefore a claim about the OTHER ~400 tests, not a clean sheet,
and 14c's report will say so in those words.


---

## Step 14c — verification-by-display, and the fixture that corrected the design

**2026-08-25.** Built as specified in SPEC §12 step 14c. The measurement held;
one thing about the chosen fixture did not, and it made the feature better.

### THE CORRECTION: the collision pair's runouts are BYTE-IDENTICAL

**Promoted to its own entry below** — see "A note that implied a difference, and
a payload that did not". Kept here in summary because it is what shaped this
unit.

The NOTES entry proposing this feature said the two 1984 UK `CLAY LP 3`
Discharge repressings "separate on `LYN-15062 Damont` vs the same runout with
different notes". The second half is right. The first half implies the runout
STRINGS differ, and the captured payloads say they do not:

    4878030  Matrix/Runout: 'Back With Bilbo Clay-LP-3-A2 LYN-15062 Damont'
    10405725 Matrix/Runout: 'Back With Bilbo Clay-LP-3-A2 LYN-15062 Damont'

Identical, both sides. Discogs itself says so in 10405725's notes: *"Identical
(matrix) to [r=4878030] but without the 'Pay no more than £3.99' mention on the
sleeve."* What actually separates them:

| Field | 4878030 | 10405725 |
|---|---|---|
| `Lacquer Cut At` | Tape One | *absent* |
| runout descriptions | "Runout side A"/"B" | `null` |
| notes | — | names the sleeve difference |

**Why this made the fixture better rather than worse.** A pair whose runouts
differed would have passed against the NAIVE implementation — display the runout
values and stop. This pair fails that implementation, because on it the runout
values resolve nothing. **Mutation-verified**: stripping companies and
descriptions from `pressingEvidence` makes the collision E2E fail with "Tape
One: element(s) not found". The fixture I *described* would not have caught
that; the fixture Discogs actually holds does.

**And it delivers the honest case in the primary fixture.** These two records
genuinely cannot be told apart by deadwax — the distinguishing fact is printed
on the sleeve. §12 step 14c's rule is that the correct behaviour is to SHOW they
are the same, never to invent a difference. That is now pinned by a test
(`reports the runouts as identical, because they are`) rather than described,
and it arrived in the main fixture instead of needing the Portuguese Misfits
bootlegs as a separate case.

### The design change the fixture forced: two new normalizer fields

`NormalizedRelease` discarded exactly the two things that separate this pair,
and **both omissions are correct for their own purpose** — this is an addition,
not a correction of a defect:

- `pressingPlant` narrows four companies to the one that pressed the record,
  because §4.2's `pressing_plant` is ONE COLUMN. `Lacquer Cut At: Tape One` is
  not a pressing plant and must not become one.
- `matrixRunout` is the strings alone, because §5.7's form field wants them.

So `manufacturingCompanies` and `matrixRunoutDetail` were added ALONGSIDE, and
the existing fields are untouched — verified by the 33 pre-existing normalizer
tests still passing, and by leaving the prefill path (`discogs-prefill.ts`,
`save-destination.ts`, `record-detail-format.ts`) unmodified. Changing the shape
of a field the add-record form depends on is not in this unit's scope.

`manufacturingCompanies` stays an ALLOWLIST for the same reason `PRESSING_ROLES`
is one: "Published By" and "Distributed By" are identical on both members of the
pair, so admitting them adds rows to a comparison without adding anything to
compare.

### The verbatim rule needed a THIRD guard, at the CSS layer

The prompt said the parse layer was guarded and the render layer was not. That
was right, and the render layer turned out to have two separate failure modes,
not one:

1. **The DOM string** — a `.trim()` or whitespace collapse in the panel.
   Mutation-verified: adding one fails 6 hazard-string tests.
2. **What the user SEES** — CSS. `white-space: normal` is the browser default
   and it COLLAPSES interior double spaces, so a runout can reach the DOM
   perfectly intact and still render tidied. `textContent` cannot see this.

**Mutation-verified, and this is the finding worth keeping:** removing
`whitespace-pre-wrap` from the panel leaves `textContent` byte-perfect while
`innerText` reads `BSK-1-3010 LW2 F12 (scratched out) △21970 ✲ KP` instead of
`BSK-1-3010  LW2 F12 (scratched out)  △21970  ✲ KP`. Every double space gone,
silently, with no code change to any string. So the E2E asserts BOTH
`textContent` and `innerText` — the second is the one that catches a
class-name refactor, and a project whose whole feature rests on "the user's eye
is the matcher" has to assert what the eye receives.

**The general form:** a rule about what the user SEES is not fully guarded by an
assertion about what the code HOLDS. Same family as the frame findings and "a
page that told the truth in text and a lie in pixels".

### My own hazard list was three-fifths decorative, and the precondition test caught it

**Promoted to its own entry below** — see "A hazard fixture that does not
exercise its hazard".

The first version of the verbatim test used five hazard strings. Three —
`'BSK-1-3010 LW2 F12 (scratched out)-W-1 KP'`, `'△␗ • glyphs'`,
`'JW10 FS7• #2'` — survive `.trim().replace(/\s+/g,' ')` UNCHANGED. They would
have passed against a normalizing implementation and proved nothing: CLAUDE.md
§2's decorative-test shape, written by me, in the test for the rule the feature
lives or dies by.

**What caught it was the precondition test** — the one asserting each hazard
string is actually changed by tidying. It failed on the first run, which is the
only reason the list was rewritten with strings carrying BOTH a whitespace
hazard and a content hazard. §2's instruction to assert a precondition rather
than assume it paid for itself inside one unit.

### Calls, pacing and what was NOT built

- **One call per expand**, asserted as a call count in E2E rather than inferred
  from the UI. Two cards expanded = exactly `[4878030, 10405725]`.
- **Nothing fetched until asked**: a separate test asserts the count is `[]`
  after a search returning two results, because a panel that is merely hidden
  would still have spent the call.
- Goes through `/api/discogs/release/:id`, so it is paced by the existing 60/min
  transport limiter and served from the 7-day cache on a second look. **No new
  endpoint, no new dependency, no schema change, no migration.**
- **NOT built, per the carve-out:** any storage of the identification, any
  matching, scoring or confidence value. The panel answers "which of these am I
  holding" at the moment of asking and records nothing.

### The full-suite run caught what the chromium run could not — twice over

**Both of these were invisible to `--project=chromium`, and CLAUDE.md §10's
"full unopinionated run, no file argument" is the rule that found them.**

**1. All five new E2E tests failed on `[mobile]` while passing on chromium.**
Not a mobile defect in the feature — a defect in MY tests. Two omissions, both
of the established idiom in the file they were added to:

- the button is named **`Search Discogs`**, and I wrote `Search`. Playwright's
  accessible-name matching is substring-tolerant, so chromium matched anyway
  and mobile did not;
- I omitted **`formReady(page)`**, the `form[data-hydrated="true"]` wait every
  other spec in `lookup-flows.spec.ts` uses before filling a field.

Symptom was `toHaveCount(2)` receiving 0 — no result cards at all, which reads
as "the feature is broken on mobile" and was nothing of the kind. Fixed, then
re-run on BOTH projects: **10/10 pass**. The lesson is the one §10 already
states — a green spec-scoped run is not evidence — arriving through the project
axis rather than the file axis.

**2. `manage.spec.ts:450` (lineup picker) failed once under load**, taking
**17.3s against 2.2s in isolation**, and passed on the next full run. Load-
sensitive timeout, same family as the 1093 intermittent. **Not mine**: grepped
`manage.spec.ts` for `lookup|pressing-evidence|normalize-release` → 0 hits, and
14c touches no MusicBrainz path. Recorded rather than acted on; if it recurs it
wants the same treatment 1093 got.

**Final baseline: 409 passed, 1 failed, 20 skipped.** The one failure is 1093,
**sighting six**, byte-identical again. So "nothing regressed" in this unit is a
claim about the other 409 tests, not a clean sheet — as the 1093 entry above
committed to saying in advance.

### OBSERVATION (out of scope, not acted on): Discogs lists one company twice

The evidence panel renders `Pressed By: Lyntone Recordings Ltd.` **twice** on
both members of the collision pair. Verified it is not a rendering bug: the
payload genuinely carries two entries with the SAME `id` (310516) and the same
`resource_url`. Real duplicate data at Discogs.

**Deliberately not deduplicated**, and the reasoning is 14c's own: the panel
shows what Discogs holds, and silently collapsing rows is the same class of act
as tidying a runout — a decision the app makes on the user's behalf about what
is worth seeing. It is also harmless here, where both rows agree.

**But it is worth a decision later**, because the honest fix is not obvious: two
entries with the same id are clearly one company, while two with different ids
and the same NAME might be two plants a collector would want to tell apart.
**Trigger: a panel where duplicate rows make a comparison harder to read**, or
Adam judging it noise on a real lookup.

---

## A note that implied a difference, and a payload that did not

**2026-08-25, out of step 14c.** The finding of that unit, recorded separately
because it is not about verification-by-display. It is about what a written
measurement carries forward and what it quietly drops.

**What my own NOTES entry said**, proposing the feature: the two 1984 UK
`CLAY LP 3` Discharge repressings "separate on `LYN-15062 Damont` vs the same
runout with different notes."

**What the captured payload shows:**

    4878030   Matrix / Runout: 'Back With Bilbo Clay-LP-3-A2 LYN-15062 Damont'
    10405725  Matrix / Runout: 'Back With Bilbo Clay-LP-3-A2 LYN-15062 Damont'

Byte-identical, both sides. Discogs itself says so in 10405725's notes:
*"Identical (matrix) to [r=4878030] but without the 'Pay no more than £3.99'
mention on the sleeve."* The distinguishing fact is printed on the SLEEVE. The
deadwax cannot separate these two records at all.

**The sentence was not false — "the same runout with different notes" is
literally correct.** But read forward six weeks it implies the runout STRINGS
discriminate, because that is what a feature called verification-by-display
would be expected to lean on. The phrase carried an implication its author did
not check and its reader had no way to test.

**Why the correction improved the work rather than costing it.** A pair whose
runouts differed would pass the NAIVE implementation — render the runout values
and stop. This pair fails it, because on it the runout values resolve nothing.
Mutation-verified: stripping companies and descriptions from `pressingEvidence`
makes the collision E2E fail with `"Tape One": element(s) not found`. **The
fixture I described would not have caught the obvious wrong implementation; the
fixture Discogs actually holds does.**

**And it moved the honest case from the margin to the centre.** §12 step 14c
names "genuinely indistinguishable candidates" as a case to handle — the
Portuguese Misfits bootlegs, byte-identical because bootlegs copy each other's
stampers — and the correct behaviour is to SHOW two things are the same, never
to invent a difference. That was going to be a secondary fixture demonstrating
an edge. It is now the PRIMARY fixture, pinned by a test that fails if the
runouts ever stop matching (`reports the runouts as identical, because they
are`). The feature's most delicate rule is exercised by its main test rather
than by an afterthought.

**The general form, which is the reason this is its own entry:**

> A measurement written as prose keeps its NUMBERS honest and loses its
> IMPLICATIONS. "93% of groups resolve" survives being read later; "they
> separate on X" does not, because it silently answers a question — *which
> field discriminates* — that the measurement may never have asked.

Related in shape to "a partial mutation understates coverage", and to the
`master-versions-hot-tuna` docblock that claimed five identical versions while
the committed capture showed three. Same family: **a written claim about data,
with nothing in the repository able to contradict it.** The fix is the same one
that worked there — commit the data and let a test assert the property, so the
prose is checkable rather than merely quotable.

---

## A hazard fixture that does not exercise its hazard

**2026-08-25, out of step 14c.** Recorded separately because it generalises past
runouts, and because it happened in the test guarding the rule the feature "lives
or dies by" — written by someone who had just finished explaining why that rule
mattered.

**What happened.** The verbatim test used five hazard strings. Three of them —

    'BSK-1-3010 LW2 F12 (scratched out)-W-1 KP'
    '△␗ • glyphs'
    'JW10 FS7• #2'

— survive `.trim().replace(/\s+/g, ' ')` **unchanged**. They look hazardous:
parenthetical transcription notes, unicode glyphs, the exact texture of a real
runout. They exercise nothing. Against a normalizing implementation all three
pass, and the test reports that the verbatim rule holds when it does not.

**Two of five were real, so the test would still have failed on a tidying
mutation** — which is what makes this the dangerous version rather than the
harmless one. It would have gone on passing and looking thorough, with 60% of
its coverage decorative, and nobody would learn that from a green run.

**What caught it: the precondition test**, asserting that each hazard string is
actually changed by tidying. It failed on its first run. That test exists only
because CLAUDE.md §2 demands a precondition be asserted rather than assumed —
the rule written after the NFD/NFC string was silently normalized on being
written to disk.

**The general form:**

> A fixture chosen to exercise a hazard must be verified to CONTAIN the hazard.
> Looking like the real thing is not the same as being hard in the way that
> matters, and the resemblance is exactly what stops anyone checking.

Same shape as the fixture README's own rule — "a fixture without its property is
worse than no fixture: it looks authoritative, and the test built on it passes
for the wrong reason" — arriving one level down, in the hand-written strings
inside a test rather than in a captured payload. **The README's discipline was
applied to the fixtures and not to the test data**, which is where it was
needed just as much.

It is also the same shape as a test asserting what the schema already knows: in
both cases the assertion runs, passes, and constrains nothing. The difference is
that a schema-shaped test is visibly redundant on reading, while a hazard string
that does not exercise its hazard is invisible without running the mutation —
which is why the precondition has to be a TEST and not a careful eye.

**The rewritten list** carries a whitespace hazard AND a content hazard in every
entry, so each guards two mutations rather than resembling one. Mutation-verified
after rewriting: adding `.trim()` and whitespace collapse to the panel fails all
six.

---

## The panel resolves to a RELEASE, not to a stamper — the limit named on first real use

**2026-08-25, found by Adam using the app on a real record**, hours after step
14c shipped. The standing conclusion holds again: the highest-yield check is
Adam using the thing, and this is a boundary no test would have surfaced because
every test asserted the feature does what it claims — which it does.

**The lookup that found it.** Deadwax reads `EKS-75005-A-1 CTH`. Two candidates:

- **card 1** — CSM / Santa Maria, `-A-2` stamper. **Not his.**
- **card 2** — Terre Haute. Its *"Runout side A, variant 3"* reads
  `o T 1 EKS-75005-A-1 CTH D`. **Matches.** The 1855 Broadway rim text in its
  notes corroborates independently.

**The feature worked exactly as specified**: two candidates the search could not
separate, resolved by the user's eye against the object, with the app asserting
nothing. Plant and stamper both discriminated, and a second field in the notes
agreed.

### The limit

**Card 2 lists SIX runout variants for one release.** So a match tells you WHICH
RELEASE you hold and not WHICH STAMPER — the variant that matched is one of six
Discogs files under a single release id.

**This is Discogs' data model, not a defect here.** A release groups pressings
that share a catalogue entry; stampers within it are recorded as variants of the
same identifier. The panel displays what Discogs holds, so it inherits that
granularity exactly. There is nothing to fix in `pressingEvidence`.

**It is the common case, not an oddity — measured across the committed
fixtures**, and this is what makes it worth an entry rather than a passing note:

| Fixture | Runout identifiers |
|---|---|
| `release-detailed` | **8** (4 variants × 2 sides) |
| `release-discharge-hear-nothing` | **8** |
| `release-no-year` (Carpenters) | **6** |
| collision pair A / B | 2 each |

**Three of five committed release fixtures carry multiple variants, and the
panel has been rendering them since it shipped.** Nothing in SPEC §12 step 14c,
the tests, or the UI copy says what a variant match does and does not establish.
The tests all pass because they assert the panel DISPLAYS what Discogs holds —
true, and silent about what the display MEANS.

### Why this matters more than it first reads

**CLAUDE.md §8: "A pressing is not an album."** Step 14c narrowed the question
from "which album" to "which release", which is a real advance — the whole
measured case. But §8's distinction has a further level the app now sits one
step above: **a stamper is not a release.** Two records off different stampers
of one release are different objects, and a collector hunting a first stamper
cares about exactly that difference.

**The honest reading of what shipped:** verification-by-display resolves the
level the SEARCH could not — release, from a set of look-alike candidates. It
does not resolve the level BELOW that, and it currently does not say so. Same
family as the identical-row collapse: the app is at its most useful when it
names the limit it has reached instead of letting a match imply more precision
than it carries.

### What is NOT decided, and must not be smuggled in

**No change to the panel yet.** Three options exist and they are not equivalent:

1. **Say nothing** — defensible. A user reading six labelled variants can see
   for themselves that they are variants; Adam did, unprompted, on first use.
2. **Label the limit** — one line near the runouts saying a match identifies the
   release, and that variants are stampers within it. Cheap, honest, and the
   same shape as the collapse message.
3. **Mark the matching variant** — NO. That requires the app to decide which
   string matches, which is machine-matching messy transcriptions: the research
   project §12 step 14c exists to skip, arriving through the back door with a
   friendlier name.

Option 3 is ruled out on the reasoning already recorded. **Between 1 and 2 is
Adam's call**, and it is a UI-copy decision rather than a defect fix.

**Trigger: the next lookup unit, or a lookup where the variant count misleads
rather than informs** — a match read as more precise than it is, which is the
failure this entry exists to make visible in advance.

### The general form

> A feature that narrows a question by one level should say which level it
> reached. Every test here asserted the panel shows what Discogs holds — all
> true, all silent on what showing it ESTABLISHES. The gap between "displays
> correctly" and "means what the reader takes it to mean" is not test-shaped,
> and the only instrument that has ever found it in this project is someone
> using the app with the object in their hand.


---

## DECIDED: the variant limit is labelled. Option 2, one line.

**2026-08-25 (Adam), resolving the entry above.** Built the same day.

**The copy, quoted because a test quotes it:**

    Variants are different stampers within this release — a match identifies
    the release.

**Phrased as what a match ESTABLISHES, not what it fails to.** A person standing
in a shop wants the boundary of the answer, not a disclaimer about it. And it
does NOT explain what a stamper is — anyone reading a deadwax already knows, and
explaining it would pad the line into something skippable.

**Why option 1 lost, and the argument is Adam's own and better than mine.** The
case for saying nothing was that he read six labelled variants and drew the
right conclusion unprompted. His correction: *"I drew it while reading carefully
with you watching, not because the screen said so."* The observed success came
with a condition attached that does not hold in a shop with a record in one hand
— which is the case the screen exists for. **A user succeeding under favourable
conditions is not evidence the interface communicated.**

**Shown only where variants exist**, and that is load-bearing rather than tidy:
a limit named where it does not bite is noise, and noise trains the reader to
skip the line in the case where it does.

### Detected by DESCRIPTION, never by counting runouts

`hasVariants` matches the word "variant" in the identifier description, because
Discogs writes `Etched runout side A, variant 3` and `Side 1 Etched, variant 2`.

**Counting rows is the obvious wrong implementation and it is wrong on a real
case**: a double LP carries four runouts — sides A, B, C, D — with no variants
at all, so a count rule announces a stamper limit on every gatefold in the
collection. **Mutation-verified**: replacing the description test with
`runouts.length > 2` fails `reads a four-sided release as sides, not as
variants`, and nothing else. That test exists only because the wrong
implementation was considered before it was written, which is what a
count-shaped rule looks like from the inside.

### Option 3 stays ruled out

Marking WHICH variant matched requires the app to decide which string matches —
machine-matching messy transcriptions, the research project §12 step 14c exists
to skip. Rejected on first raising, rejected again here, and recorded twice so
it is not proposed a third time with a friendlier name.

---

## 14c IN REAL USE: several records added, identification accurate each time

**Adam, 2026-08-25**, after using the feature on his own collection rather than
on fixtures:

> I have since added a number of records through the lookup and the
> identification has been accurate each time.

**Recorded because it is the evidence the suite structurally cannot produce.**
3023 unit tests and 411 E2E assertions establish that the panel displays what
Discogs holds; none of them establish that the displayed evidence lets a person
find their own record. That is a claim about the world, and only use can make it.

**And it closes the loop on the trigger that fired this feature.** The deferral
entry named three triggers, the second being "a lookup ends without the user
being able to tell which row is theirs, three times". The reverse now has
evidence: several lookups where the user COULD tell. The measured 93% held up in
practice on this collection.

**The one limit found in real use is the variant/stamper boundary above**, now
labelled. Adam's report: *"this copy change is the last thing I have noticed
about it."* Step 14c is done as a feature, not merely as a build step.


---

## FIRST SIGHTING: `wall-scene.spec.ts:449` "the return re-measures the slot"

**2026-08-25**, on the full `--retries=0` run verifying the variant-limit copy
change. Recorded at first sighting rather than after four, because the 1093
entry's cost was that nobody wrote the first three down.

    Error: the record is back in its own slot, horizontally
    expect(received).toBeCloseTo(expected)
    Expected precision:    0
    Expected difference: < 0.5
    Received difference:   401.5

**Not 1093, and 1093 PASSED on this same run** — which is itself information:
that intermittent is genuinely intermittent rather than load-monotonic, and two
different wall-scene tests now fail under full-suite load in different runs.

**401.5px is not a rounding wobble.** `toBeCloseTo(x, 0)` wants < 0.5, so the
record landed in a DIFFERENT SLOT, not slightly off its own. Whatever this is,
it is a whole-slot error, which argues for a genuine mis-measure under
contention rather than a tolerance that needs loosening. **Do not "fix" this by
widening the precision** — that would convert a slot-level error into a passing
test, which is the shape CLAUDE.md §2 forbids.

**Passes in isolation** (1/1, 8.3s). Needs full-suite load, same as 1093.

**Verified NOT caused by the change under test:** `wall-scene.spec.ts` contains
zero references to `lookup` or `pressing-evidence`, and the variant-limit change
touches one module, one component and one spec, all under `/lookup`. The
14c tests all passed in this run — 16 matching ✓ lines across both projects.

**Evidence on disk from the failing run:**
`test-results/wall-scene-the-return-re-m-fbdd0-slot-rather-than-caching-it-chromium/`

**Trigger: the next §10b or wall-scene unit**, or a second sighting — at which
point it is a rate rather than an event, and the two wall-scene intermittents
should be diagnosed together, since "the scene mis-measures under contention"
would explain both.


---

# /suggestions on the real collection — 2026-08-26

Four items from Adam using §9.2 against his own records. Diagnosed before any
fix, per the standing rule; **two are defects, one is the feature working as
designed, and one is a product question that needs answering before it is
built.**

## 1. Miles Davis — Bitches Brew: NOT A DEFECT. The prompt says it and the model obeyed.

**Adam asked which of two it was — the prompt does not say it, or it says it and
the model ignored it. It is neither.** The prompt says it, the model followed it,
and the reason line Adam read is *the prompt asking for that sentence*:

    'The list above names the artists they own but not which records, so a',
    'different record by an artist they already own is a welcome suggestion —',
    'say so in the reason when that is what you are doing. Do not recommend',
    'anything already on their want list, which is listed with titles.'
                                          — src/lib/llm/client.ts:226-229

So "the suggestion's own reason says 'a different record by an artist they own'"
is not evidence the model knew and suggested anyway. It is the model **complying
with an explicit instruction to disclose what it was doing.** The disclosure that
made the behaviour look like a bug is the honesty mechanism working.

**This is A29g, exactly as decided.** The payload sends artist names, counts and
genres — no owned titles — so "already own" is only enforceable at artist level.
A29g welcomed same-artist suggestions deliberately and required the model to say
so. `client.test.ts` pins all three clauses.

**The live case is a GOOD suggestion by A29g's own reasoning**, same shape as the
Dire Straits case recorded there: an artist with records on the shelf is
demonstrably collected, so naming another is the gap the feature exists to find.

**What would change it, and it was declined once already:** sending owned record
titles would make a record-level rule enforceable, at the cost of putting every
title in the collection on the wire. §9.2's disclosure boundary is deliberately
narrow. **Not re-proposed here** — but noted that the cost of A29g is exactly
this moment: a suggestion that looks wrong, is right, and needs a paragraph to
explain. If Adam judges that trade badly made, it is a spec decision, not a bug.

## 2. DEFECT: the want-list form dead-ends on a new artist, and /records/new already fixed this

**Confirmed, and the fix already exists twenty lines away in a sibling file.**

| screen | unmatched artist message |
|---|---|
| `/records/new` | "…not in your collection yet — **it is ready to add under Artist**" |
| `/want-list/new` | "…not in your collection yet — **add them in Manage first**" |

`records/new/page.tsx:118` carries a comment recording that the want-list wording
is a version this project ALREADY diagnosed and fixed on the other screen:

> It previously read "add them with + New artist", which was a dead end on a new
> collection: nothing matches, so every import lost its label.

**`RecordForm` uses `InlineCreate` four times. `WantListForm` has a bare
`<select>` and no create path at all.** So the fix is not new work — it is
applying an existing component to the second form.

**Why this is worse than it looks.** §9.2 exists to surface records the
collection does NOT have, and an LLM suggestion is by construction most often an
artist the collection has never heard of (`want-list/new/page.tsx:92` says
exactly this). **So the dead end is not an edge case of the suggestion flow; it
is the modal case.** Every good suggestion — the ones naming a genuinely new
artist — hits it. Throbbing Gristle is not unlucky, it is typical.

**§10's constraint is real and the fix must respect it:** "Reference rows are
matched, never created: a prefill is not a commitment, and an artist created for
an abandoned form is debris nothing points at." `InlineCreate` satisfies this —
it creates on a deliberate user action inside the form, not from the prefill.

## 3. The suggestion's knowledge does not transfer — and the existing reasoning says it SHOULD NOT

**Adam's instinct that "it may belong nowhere" is already the recorded decision,
and the reasoning is stronger than the observation.** `want-list/new/page.tsx:70`:

> It is CONTEXT, never data: nothing here reaches the `want_list` row. A
> suggestion is true of a collection at a moment, and freezing it into a row
> would leave a stale claim behind the first time the collection changed. There
> is also nowhere honest to put it — `best_dig_notes` is the only free text on
> the table and §7.2 gives it a different meaning.

Three separate arguments, each sufficient:

1. **`best_dig_notes` means something else.** CLAUDE.md §8: "best dig" is the
   highest-fidelity pressing worth hunting. A model's reason for suggesting an
   album is not a pressing note, and putting it there makes the field mean two
   things — the exact flattening §8 forbids.
2. **`target_pressing` cannot be filled at all.** It is a FK to a `pressings`
   row. The model named an artist and a title; it knows nothing about a
   pressing, and inventing one is the fabricated-230g-weight failure again.
3. **A reason is true at a moment.** Written into a row it becomes a stale claim
   the first time the collection changes.

**So: nothing transfers into the row, and that is correct.** But there is a real
gap Adam is pointing at, and it is not about storage:

**The reason is DISPLAYED on `/want-list/new` only when §9.1 can regenerate it
for an artist the collection already owns** (`suggestedArtistId`, from
`suggestions({limit:200})`). For an LLM suggestion of a NEW artist — the modal
case from finding 2 — there is no `artistId`, so `suggestionReasons` is empty and
**the page shows nothing at all.** The user arrives at a blank form having just
read a paragraph about why this record matters.

**The honest fix is display-only and needs no storage**: carry the reason so the
form can SHOW what the model said, marked as the model's claim, while still
writing nothing to the row. The existing code refuses to carry it in the URL for
a good reason — "attacker-controlled text rendered on a page… would let a URL
claim a reason the engine never produced" — so a URL parameter is the wrong
mechanism and that refusal stands.

**Not designed here.** Recorded as the real finding underneath Adam's
observation: **the decision "it belongs nowhere" is right about the ROW and
wrong about the SCREEN.**

## 4. QUESTION: should gap analysis be cached? The two products are different.

Adam asked the right question and named the fork himself. Neither is "caching"
in a way the other reader would recognise:

**(a) Return the same suggestions.** A read-through cache: the second ask inside
the window returns the stored list and spends no budget. **Product: suggestions
are a document you can re-open.** Cheap, but a "Suggest" button that returns
byte-identical output feels broken — and it is a lie about freshness if the
collection changed in between.

**(b) Suppress the fresh call.** Refuse or defer the second ask with a message.
**Product: suggestions are an event with a cooldown.** Honest about spending
nothing, and it makes the limit legible rather than silent — but it gives the
user nothing for the click.

**A third exists and may be what he wants: PERSIST the last result.** The
suggestions from the last run stay on the page across navigation, with their
timestamp, and "Suggest" always means a fresh call. Re-asking twice stops being
necessary because the first answer never went away. **This addresses the actual
cost — Adam burned a call re-asking for something he had already been told —
without making the button lie.**

Note what §4.3 already provides: `llm_requests` records every call with a
timestamp, so "when did I last ask" is answerable today. What is NOT stored is
the RESPONSE.

**Not decided. Needs Adam's answer**, because (a), (b) and (3) are three
different products and the implementation follows from the choice, not the other
way round. **Recorded rather than guessed at**, per the standing rule.


---

## RULE: two things that look like the same field are not the same KIND of claim

**Named 2026-08-26, on the fourth instance.** Recorded as a finding rather than
as a scheduling note (Adam's instruction), because the scheduling consequence is
the smallest thing about it.

**The instance that named it.** Finding 3 above asked for the §9.2 suggestion's
reason to render on `/want-list/new` "as it already does for §9.1". Both are a
sentence saying why this record is worth wanting, in the same place on the same
screen. They are not the same kind of claim:

| | §9.1's reason | §9.2's reason |
|---|---|---|
| origin | COMPUTED from `artist_influences` / `artist_memberships` | ASSERTED by a language model |
| checkable against | the user's own data | nothing |
| regenerable | yes — walk the edges again | no |
| survives the collection changing | recomputed, so yes | becomes stale silently |

**Which is why "regenerate it server-side for the §9.2 path" cannot be built.**
Not a missing parameter — there is no derivation to run. §9.1's reasons come
from graph edges between `artists` ROWS, and a model naming Throbbing Gristle
names something with no row, no edges and no lineup. Passing an artist id
through does not rescue it either: for a genuinely new artist there is no id,
and creating one to have something to pass is §10's forbidden debris.

**The failure it prevents is the one that matters.** Rendering the model's
sentence through §9.1's mechanism would give a model's assertion the standing of
a computed fact — identical presentation, identical position, no way for the
reader to tell which they are looking at.

### The other three instances, which are the same shape

1. **§7.8's snippet against the facts.** `RecordSummary` carries
   `snippet: {text, generated}` and `factGroups` as SEPARATE fields so the panel
   cannot flatten them; the snippet renders above a boundary with a generated
   label. A generated sentence and a recorded fact look alike in a paragraph.
2. **§12 step 14c's notes against the identifiers.** A runout is transcribed off
   the object and checkable against what the user is holding; `notes` is
   someone's description of the release. Both are text in the same panel, and
   the panel keeps them structurally apart with a rule and a label.
3. **The search qualifier against the runout** (14c's measurement). Both name
   something about the pressing; one is a search-payload string present on 24%
   of rows, the other is evidence off the deadwax. Treating the qualifier as
   sufficient is what made cards collide.

**The general form:**

> Two values that occupy the same slot, read as the same sentence, and answer
> the same question can still be different KINDS of claim — computed versus
> asserted, checkable versus not. The presentation is where the distinction is
> either preserved or destroyed, and destroying it is silent: nothing fails, the
> reader simply believes the wrong thing about where the sentence came from.

**The check to apply**, and it is cheap: for any field about to be filled from a
second source, ask **what would make this wrong, and could the reader tell?** If
the two sources fail differently, they need different presentation — a label, a
boundary, a separate structural field — not merely different content.

**Binding on the finding-3 unit when it lands** (Adam, explicitly): whatever
renders the model's reason must be attributed and visually separable in the same
way the snippet is, so it cannot later be read as something the app worked out.


---

## A36 — inline create on the want-list form. The clause forbade a PREFILL, not a button.

**Amended 2026-08-26 (Adam), before the code, per the standing rule.** SPEC §10's
want-list row previously read:

> Reference rows are matched, never created: a prefill is not a commitment, and
> an artist created for an abandoned form is debris nothing points at.

Now:

> **No reference row is created FROM A PREFILL** (A36): a prefill is not a
> commitment, and an artist created for an abandoned form is debris nothing
> points at. Inline create is available on this form as it is on the record form
> — it creates nothing until a deliberate click, so the commitment is the user's
> rather than the form's.

**The clause's own stated reason decides it.** "A prefill is not a commitment"
and "an artist created for an abandoned form" are both about a row appearing
WITHOUT the user asking. `InlineCreate` creates nothing until a deliberate click,
so the reason is satisfied and the literal reading was over-broad.

**And the literal reading made §10 contradict itself**, since the same section
mandates "Inline create for artist/label/store/tag". A reading under which one
sentence forbids what another requires is the reading to suspect.

### The ambiguity was found by a DEAD END, not by reading

**Worth its own line, because it is the second time this week.** Nobody
mis-implemented this clause: `WantListForm`'s bare `<select>` is a faithful
reading of what it said, and it survived review, R5, R6 and every full-suite run.
What exposed it was Adam clicking "Add to want list" on a Throbbing Gristle
suggestion and hitting a wall.

The other instance: §12 step 14c's variant limit, where the panel displayed six
runout variants correctly and said nothing about what a match established — also
invisible to 3023 tests, also found by one real use.

**The shape:** a clause that admits two readings does not announce itself. Both
readings produce working, testable, reviewable code, and the tests pin whichever
was implemented. **The disambiguating instrument is someone trying to do the
thing the clause is about** — which is the standing conclusion arriving from a
new direction: not "manual QA finds bugs" but "manual QA finds AMBIGUITY, and
ambiguity is invisible to a suite by construction."

**The check that falls out**, cheap and applicable at spec-reading time: when a
rule states a REASON, test the literal reading against that reason. If the
reason is narrower than the rule, the rule is probably over-broad — and the
place it will bite is wherever a user first tries to act on it.


---

## Finding 2 built — inline create on the want-list form (A36)

**2026-08-26.** The dead end Adam hit on a Throbbing Gristle suggestion, fixed by
applying `InlineCreate` to the second form. `RecordForm` uses it four times;
`WantListForm` had a bare `<select>` and no create path.

**Reused, not rebuilt.** `InlineCreate` was imported unmodified — it already
handles the pre-filled suggestion box, collision-as-success (§5.4's
`existingId`), and `cleanName` normalisation. Editing it would have been the
signal that the reuse was misread.

**Copy changed to the wording `/records/new` already settled**: "add them in
Manage first" → "it is ready to add under **Artist**". That project had recorded
the identical fix on the other screen; this form never got it.

### The A36 regression test, and why it is asserted against the DATABASE

**Adam's addition, and it changed what the test can catch.** The obvious version
checks the UI — the box is closed, the field is empty. That version **passes
against a form that creates the artist on arrival and hides the fact**, which is
exactly the helpful-feeling shortcut A36 forbids and exactly what someone would
add in good faith to save a click.

So: arrive with a name that does not exist, ABANDON the form without clicking
create, and ask `artists` whether a row appeared.

**Mutation-verified, and the first attempt was WRONG in an instructive way.**
Injecting an auto-create into `want-list/new/page.tsx` failed the test — but on
`expect(unmatched-artist).toBeVisible()`, not on the row count: the auto-created
artist now MATCHED, so the message disappeared. That test would still have passed
against an implementation that created the row *and* kept showing the message.
Re-keyed the wait to the title input, which a matching artist does not change,
and re-ran the mutation:

    Error: A36: arriving at the form with ?artist=Throbbing Gristle mta1za4w
           must not create an artists row
    Expected: 0   Received: 1

**Now it fails on the assertion it exists for.** The general form is the one this
project keeps meeting: a test can fail for the right reason and still be pinned
to the wrong observation, and only a mutation shows which.

### The A29g copy change — DISCLOSURE KEPT, FRAMING CHANGED

    When that is what you are doing, make it the REASON rather than a caveat:
    "You own Miles Davis but not this one" is the point, not an admission.

A29g's requirement that the model disclose a same-artist suggestion is
unchanged, so §9.2's honesty is not traded — only the sentence the model writes.

**UNVERIFIED, and it cannot be verified here.** The test pins the INSTRUCTION;
whether the next real gap analysis reads as a reason to buy is judgeable only by
running one against a real collection. Same standing as the format hints.
**Trigger: Adam's next /suggestions run.**

### Suite

- Unit **3024 passed**, 1 skipped. Lint, typecheck, build clean.
- E2E **416 passed, 2 failed**, 20 skipped.

**Both failures are `record-detail.spec.ts` at `login()` on
`toHaveURL('/')`** — the documented accumulation signature (step 15 unit 1), not
this change. Ruled out rather than assumed:

- **17/17 in isolation.**
- **No residue from the new tests**: `SELECT name FROM artists WHERE name LIKE
  'Throbbing Gristle%'` → 0 rows after the run, so the created row was cleaned up
  and the abandoned prefill genuinely created nothing.
- The only want-list reference in that spec posts to the want-list **API**, not
  the form, and that test PASSED; the two that failed are journal and price
  tests with no want-list involvement.

**Baseline note: the red is now moving between runs rather than sitting on one
test.** 1093 (six sightings), wall-scene 449 (one), and now two record-detail
logins. All share the late-in-run `login()` timeout shape, which the step 15
diagnosis attributed to accumulation. **Worth treating as one question rather
than three intermittents** when a harness unit next opens.


---

## LLM_UNREADABLE on a real gap analysis — and the diagnostic that was never written

**2026-08-26, reported by Adam** on a 17-record collection. `POST
/api/suggestions/ai` → 502 `LLM_UNREADABLE`, "The suggestion service returned
something we could not read."

### THE FIRST FINDING: the answer does not live anywhere

Adam's instruction was to read what actually came back — "the server logs the
response body or its parse failure, and that is the only place the answer lives."
**It does not, and this is the more serious finding of the two.**

- `parseSuggestions` swallows BOTH failure paths into a bare
  `{ ok: false, reason: 'unreadable' }`: the `catch` around `JSON.parse`
  discards the error, and `envelope.safeParse` discards `.error.issues`.
- The route logs NOTHING before returning 502.
- `withErrorHandling` logs only THROWN errors. `LLM_UNREADABLE` is a RETURNED
  response, so it never reaches `logger.error`.

**Confirmed against production**: `vercel logs` for the live deployment has no
suggestion, LLM, 502 or error line for this call. The information was never
written down.

**So a billed, user-visible failure is undiagnosable after the fact.** The user
pays a slot, sees an error, and the one artefact that would say WHY — the raw
text, or the parse issues — is discarded at the moment it is known. This is the
same family as the earlier findings where a mechanism's own signal did not report
what it claimed, except worse: there is no wrong signal, there is no signal.

**And it makes the retry advice hollow.** The message says "Try again", which is
correct if the failure is transient and wrong if it is structural — and nothing
recorded can distinguish those, so the app is advising a second billed call
without knowing whether the first was reproducible.

### The diagnosis, by mechanism rather than by log

Both of Adam's candidates were tested against `parseSuggestions` directly:

| input | result |
|---|---|
| JSON cut mid-object (truncation) | `{ok: false, reason: 'unreadable'}` — **matches the symptom** |
| complete, valid JSON | `{ok: true, suggestions: [...], dropped: 0}` |
| out-of-vocabulary genre | `{ok: true, suggestions: [], dropped: 1}` — **200, not 502** |

**A29d is RULED OUT, as Adam predicted.** Genre validation is per-suggestion and
returns `ok: true` with a `dropped` count; it cannot produce this status.

**Truncation is the leading hypothesis and the numbers support it.** R5's live run
returned **34 suggestions in 2994 output tokens** against a
`GAP_ANALYSIS_MAX_TOKENS` of 4000 — 75% of the ceiling — and stopped on
`end_turn`, meaning it finished by luck of fit rather than by design. That was a
SMALLER collection. §9.2 has no count limit, deliberately (R5 finding 4), so a
larger, more varied collection invites a longer answer, and the ceiling is the
only thing bounding it.

**NOT PROVEN, and it cannot be proven from what exists.** `stop_reason` would
settle it in one field — `max_tokens` versus `end_turn` — and it is on the
response the client already receives and does not record. **This is the same gap
as the first finding: the evidence existed at runtime and was thrown away.**

**Measurement declined rather than faked:** building the real prompt needs
`buildCollectionSummary`, which is `server-only` and whose driver guard refuses
to point test code at the production database. That guard is correct and was not
worked around, so the exact payload size is unmeasured.

### The quota, since it was asked

    COUNTING AGAINST THE QUOTA: 1 of 10
    REMAINING NOW: 9
    gap_analysis 8m ago | completed: yes | frees 14:04Z

**The slot correctly stayed spent** — `completed_at` is set, so the failure was
billed and counted, exactly as §9.2 requires and as the refund carve-out (401/403
only) intends.

### What this asks for, not built here

1. **Record `stop_reason` and the parse failure.** One log line at the moment the
   parse fails, carrying `stop_reason`, output token count, and the first N
   characters of the raw text. Without it every future instance is equally blind.
2. **Then decide about `max_tokens`** — raising it, or asking for a count in the
   prompt as R5 already identified as the honest place. **Do not raise it before
   (1)**: that is fixing the hypothesis rather than the fault, and if truncation
   is not the cause the raise is invisible and the next failure is identical.

**Ordering note:** this now precedes finding 4 (persisted results). A feature that
stores the last successful result is less useful than one that can say why a call
failed — and 4's store would have had nothing to store here.


---

## OPEN, not yet actionable: §9.2 does not scale, and max_tokens is a ceiling not a fix

**Raised by Adam 2026-08-26** while deciding the logging unit, recorded rather
than acted on because **the evidence that would choose between the options does
not exist yet** — that is what the logging unit produces.

**The problem, if truncation is confirmed.** Raising `GAP_ANALYSIS_MAX_TOKENS`
moves the wall; it does not remove it. §9.2 deliberately has NO count limit (R5
finding 4), so the model returns as many suggestions as it judges warranted — 34
on R5's smaller collection. At 17 records that may already be the ceiling. At 200
it returns whatever a 200-record collection warrants, and the ceiling is hit
again at whatever value was chosen.

**Three shapes, Adam's, worth weighing when evidence lands:**

1. **Bounded overall** — ask for five rather than thirty-four. Cheapest, and R5
   already identified the PROMPT as the honest place for a count rather than a
   server-side slice, which would discard output already billed for.
2. **Scoped by genre** — "what am I missing in UK82". Smaller payload, sharper
   question, actionable in a shop, and it relieves token pressure STRUCTURALLY
   rather than by raising a ceiling.
3. **Scoped by depth** — "where am I one record deep". **Computable from the
   user's own data before any model is involved**, which makes it the only one of
   the three that can be partly answered without spending a slot at all.

**The measurement that decides it, and it is not yet taken: is the pressure on
INPUT or OUTPUT?** The summary is names, counts and labels — cheap per artist —
so a 200-record collection might still send a small prompt while the model's
ANSWER grows without bound. If the pressure is output-side, (1) fixes it and (2)
is optional; if input-side, (2) is the structural answer and (1) alone will not
hold. **`stop_reason` plus input/output token counts answer this**, and the
logging unit is what starts recording them.

**Trigger: the first logged gap-analysis failure or success carrying token
counts.** Until then any choice here is a guess with a number attached.


---

## The gap-analysis diagnostic, built — and what "log the raw text" turned into

**2026-08-26.** The fix for the undiagnosable 502. Three changes: the parser says
WHICH failure, the client stops discarding `stop_reason`, and the route logs and
tells the truth.

### What was checked before logging model output, rather than assumed

Adam's instruction: raw model output is a new category of thing to log, and R6's
cause-chain rule applies — "it should not contain anything from my collection,
but say what you checked."

**Checked, and the assumption does NOT hold.** `CollectionSummary` sends
`artists[].name`, `labels[].name`, `wantList[].{artist,title,priority}` and the
genre vocabulary. The model's reply is generated FROM that, and A29g explicitly
asks it to reference owned artists in its reasons. So the response can echo the
collection by design.

| category | can appear in model output? | sensitivity |
|---|---|---|
| credentials / tokens | **no** — never in the prompt; the key is a header | — |
| the user's collection | **yes, by design** | personal, not secret |
| the model's own suggestions | yes | not sensitive |

**So it cannot leak a credential, and it can put a want list into Vercel logs
readable by anyone with dashboard access.** That is exactly the argument that
turned `describeError` into a redacted projection after R6 reproduced a Blob
token and a connection-string password reaching a log line.

**DECIDED (Adam): shape only, no raw text at all.** His reasoning, which is
better than the option I recommended: *"a deliberate log should not get a weaker
standard than an accidental one"*, and the diagnostic case for a tail is weaker
than it looks — `stop_reason` alone settles truncation, which is the live
hypothesis. A tail only helps for malformed-but-complete output, which nothing
has evidence for. **If shape-only proves insufficient that is a finding, and we
widen it deliberately.**

So the failure carries `reason`, `length`, `stopReason`, `inputTokens`,
`outputTokens` — and quotes nothing. **Mutation-verified**: adding
`tail: raw.slice(-200)` to the parse failure fails `carries no response TEXT,
only its shape`.

### `cut` versus `malformed`, decided from STRUCTURE not from the error message

A JSON syntax error's text is engine-specific prose. Bracket balance is a fact
about the document, so `isUnclosed` counts braces and brackets OUTSIDE string
literals, honouring escapes — a value containing `{` would otherwise be counted
as structure. Depth below zero is malformed rather than cut.

**A contract change, not a test bent to fit code.** `parse-suggestions.test.ts`
had a test asserting `reason === 'unreadable'` — the single value that made the
live failure undiagnosable. It now asserts `'cut'`. That is a REFINEMENT in the
direction the test was already reaching: its own title said "truncated", its
input is truncated, and nothing it protected is given up. Reasoning recorded in
the test rather than in a commit message.

### The copy, and the sentence that was cut from it

    ran out of room: "The suggestion service ran out of room before finishing
    its answer. This used one of your ten hourly requests, and trying again will
    likely stop at the same place."

    unreadable:      "The suggestion service returned something we could not
    read. This used one of your ten hourly requests. Trying again may work."

**"Try again" was advice the app had no reason to believe** — the same shape as
the 401 that said "try again" until R6 fixed it. On truncation a retry stops in
the same place and spends another of ten.

**The cost is named**, because the app knew it and the screen did not say it.

**AND A SENTENCE WAS CUT, which is the finding worth keeping.** My draft ended
*"your collection has outgrown what one request can cover."* Adam rejected it:
`stop_reason: max_tokens` proves the ANSWER ran out of room; it does not prove
the COLLECTION is why — *"the model could have written thirty-four verbose
suggestions about four records."*

**That is the app publishing a hypothesis as a diagnosis**, in user-facing copy,
where it reads as something measured. Exactly the failure this project keeps
naming: the fabricated 230g weight, the tier-1 badge that could never fire,
"presence is not shape". **A test now pins it** — `does not blame the collection
for a truncated answer` fails against copy matching
`/collection|outgrown|too (large|big|many)/`.

**Offering nothing beats offering a guess.** When the scaling work lands and
there is a narrower request to offer, the copy can point at it.

### Mutation-verified, both guarantees

- **Log removed** (reproducing the live defect) → `logs stop_reason and token
  counts` fails.
- **Response tail added** to the failure → `carries no response TEXT` fails.

### What this does NOT do

`max_tokens` is unchanged. The evidence to choose between raising it, bounding
the count in the prompt, or scoping the request does not exist until a real
failure is logged. **Trigger: Adam's next gap analysis** — success or failure, it
now records `stop_reason` and both token counts, which is the measurement the
scaling entry above says will decide between the three shapes.

### Suite: the first fully green E2E run this session

Unit **3033 passed**, 1 skipped. E2E **418 passed, 0 failed**, 20 skipped —
`.last-run.json` `"status": "passed"`. Typecheck, lint, build clean.

**Worth recording because the baseline has been one-red or two-red all session**
and the red kept MOVING: 1093 (six sightings), wall-scene 449 (one),
record-detail 395/423 (one). All three share the late-in-run `login()` timeout
shape. A clean run does not disprove them — it is consistent with a rate, which
is what the 1093 entry established — but it does mean **none of them is a
deterministic break introduced by recent work**, which was the open question.
The accumulation reading survives; the harness question stays open with its
existing trigger.

---

## A37 — bound the count in the prompt. The log answered the scaling question.

**2026-08-26.** The diagnostic unit built yesterday paid for itself on its first
real failure: one log line confirmed the hypothesis AND chose between the three
scaling shapes that were recorded as open.

    [api.suggestions.ai.unreadable] reason=cut stop_reason=max_tokens
    chars=3399 in_tokens=1533 out_tokens=4000 max_tokens=4000

**Truncation confirmed** — `stop_reason=max_tokens`, `out_tokens` exactly at the
ceiling. The hypothesis was right, and it is now measured rather than guessed.

**And the input/output question the scaling entry said would decide it is
answered: 1,533 input tokens for 17 records.** The summary is names, counts and
labels, so it is cheap; the pressure is **entirely output-side**. Even at 200
records the input would not be the problem.

**That eliminates two of the three shapes.** Scoping by genre or by depth
(options 2 and 3 in the scaling entry) reduce the INPUT, which was never the
constraint. They may still be good features for other reasons — a narrower
question is more actionable in a shop — but they do not fix this, and building
them as a fix would have been the wrong tool aimed at a measured problem.

**Raising `max_tokens` is also eliminated, and this is the useful part.** With no
count the model returns as many suggestions as it judges warranted — R5 measured
34 — and that number grows with the collection. A higher ceiling buys a few more
suggestions and fails again at 40 records. **A count fixes it at any size.**

### The number is SIX, and it is a product judgement

Recorded with the same standing as A27's 2.0 and 1.5 link weights, which are
also chosen rather than derived — that precedent is why this is written down as a
judgement rather than presented as a result.

**The reasoning, which is about reading rather than about fitting:** R5's run
produced 34 suggestions and Adam read the first six. A gap analysis is a prompt
for the next dig, not a catalogue. Six fills a phone screen without scrolling and
is small enough that the sixth is still considered rather than skimmed.

**Deliberately NOT chosen by what fits the ceiling.** ~34 would fit a raised
ceiling; that is the wrong question. The count is set by what gets read, and the
token saving is a consequence rather than the goal.

**Revisit if the list is consistently too short** — a real signal, and the number
is one line of prompt text.

**"At most", never "exactly".** A quota to fill invites padding a short list with
weak suggestions — output produced to satisfy a number rather than because the
gap is real, which is the fabricated-field failure in a new place.
**Mutation-verified**: changing the prompt to "exactly six… padding if needed"
fails `states the count as a maximum, not a quota to fill`.

### A bounded response CAN still truncate, and the copy says so honestly

Adam asked this explicitly rather than letting the count be assumed to remove the
failure mode. **It does not.** The count bounds how many suggestions are asked
for, not how long each reason may be.

Measured from R5's complete run: ~88 output tokens per suggestion, so six is
~530. A model writing reasons **three times** longer than average still lands
near 1,600 against 4,000 — roughly **2.5x headroom**.

**So truncation goes from expected to implausible, not impossible.** The `cut`
path stays, and its message stays accurate — but the advice softened from
"trying again **will likely** stop at the same place" to "**may** stop at the
same place", because with a bounded request a retry is now worth something in a
way it was not when the model was returning 34 unbounded. The test asserts the
softened wording, so the change is pinned rather than incidental.

### Suite

Unit **3035 passed**, 1 skipped. E2E **418 passed, 0 failed**, 20 skipped —
green twice running now. Typecheck, lint, build clean.

### Still unverified, and only Adam can

Whether six is the right number, and whether the next gap analysis completes.
The prompt change is pinned by tests; what the model DOES with it is judgeable
only by running one. **Trigger: Adam's next /suggestions run** — which will also
be the first to log `stop_reason=end_turn` and a real `out_tokens` under the
count, the measurement that says how much headroom six actually leaves.

