# NOTES.md

Out-of-scope observations recorded during build steps, per CLAUDE.md §4.
Most of this file is observations that have NOT been acted on; the exceptions
are the entries marked CORRECTED or RESOLVED, which record something that was
believed and turned out to be false. Each entry names the step it was noticed
in.

---

## CURRENT POSITION — read this first

**Updated: 2026-08-08, end of the step 5+6 adversarial remediation.**

**Where we are.** **Step 6 is COMPLETE** (SPEC.md §12: "Want list CRUD +
acquire flow. E2E #5"), and so is the five-unit remediation that followed the
adversarial review of `records` + `want_list` + the acquire path.

The remediation fixed: `tagIds` silently discarded on acquire; two create
schemas that agreed rather than one shared definition; the concurrent loser
getting a 500 instead of §5.3's 409; `target_pressing_id` dropped instead of
prefilling the form; and `purchaseDate` accepting `2026-13-45`. SPEC.md §5.3
was amended in the course of it and is the authority for all five.

**Step 7 is next**: the Discogs integration.

**Last verified, and when.** 2026-08-08, all on the current tree:

| Check | State |
|---|---|
| `npm test` | **1293 passed, 1 skipped, 68 files** |
| `npx playwright test` (full, both projects) | **150 passed, 2 failed, 2 skipped** — the 2 are the known flake, see below |
| `npm run typecheck` / `lint` / `build` | clean |
| Neon transaction gate | **9 passed, 1 skipped** — the skip is the gate's own marker correctly NOT firing |

Note the Neon row is the file's own count, not a suite total. Run it as
`npx vitest run test/integration/neon-transactions.test.ts`; there is no
`test:neon` script, and asking for one wastes a round.

**Three caveats a green suite will not tell you.**

1. **The Neon gate's closing test was hollow until the step 5 remediation** and
   reported green from the day it was written — it never reached Neon at all.
   Fixed. Do not read "the gate was closed in unit 1" as "it was verified from
   unit 1".

2. **The E2E suite has one open flake**, ~1 run in 5, in
   `collection-filters.spec.ts` on both projects. NOT skipped. **If it fails,
   re-run that file two or three times before investigating: a MOVING failure
   is the flake, a FIXED failure is a regression.** Full signature below.

3. **The 2 skipped E2E specs are the desktop-only view toggle**, skipped by
   design on the mobile project — not quarantined. The two `/manage` genre
   specs that WERE quarantined for weeks are now unquarantined and passing; both
   their causes were environmental.

**What step 7 inherits.** Every acceptance criterion below is discharged for
BOTH `records` and `want_list`, item 14 included. Step 7 starts with no open
gate — the first step since step 4 to do so.

**Before step 7 can be planned, two things:**

1. **Adam confirms his Discogs token works.** Nothing in the repo can verify
   this, and CLAUDE.md §2 forbids a live external call from a test — not even
   once. So the token is checked by hand, outside the suite, before the work is
   scoped.

2. **The next adversarial review is SECURITY-FOCUSED and lands AFTER step 7,
   not before.** §6's rate limiter, cache and normalization are this project's
   first untrusted external input: everything so far was written by the one
   authenticated user, and Discogs data is user-submitted, imperfect (CLAUDE.md
   §8), and arrives over a network that can be slow, hostile, or lying. A
   general review before that work exists would find nothing; the same effort
   spent on the boundary afterwards is where the defects will be.

**Entries that bear directly on step 7**, beyond the standing rules:
- **the unspecified-bounds entry** — the importer is the first thing besides
  the API to write these columns, and §4's prose ranges are enforced at the API
  boundary only;
- **the two-want-list-items-one-record deferral** — explicitly a step 7
  decision, not step 14, because the importer is what makes it reachable;
- **the mock-scope rule** — step 7 mocks an external API throughout, and a mock
  that intercepts every call disables the function it stands in for;
- **the fixture rules**, especially the discriminating-power one: Discogs
  fixtures are large, and a payload where every candidate match agrees proves
  nothing about which rule matched;
- the two `/manage` limitations, still unfixed.

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
  Noticed: step 6, unit 5.

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

- **RULE: Zod's convenience modifiers silently change MEANING at the boundary.
  Treat any `.coerce` or `.default` in a request schema as suspect.**

  Three instances, all in this build, all invisible to every downstream test —
  because each produced a *valid-looking* value rather than an error:

  | Modifier | Input | Becomes | Consequence |
  |---|---|---|---|
  | `.default([])` on `genreIds` | absent | `[]` | "leave alone" becomes "REMOVE ALL" — silent data loss on PATCH |
  | `z.coerce.number()` on `yearFrom` | `''` | `0` | applies `release_year >= 0`, drops every undated record behind a 200 |
  | `z.coerce.boolean()` on `includeUndated` | `'false'` | `true` | the flag cannot be turned off; every non-empty string is true |

  **Why they are hard to catch.** A validation bug that REJECTS is loud — a 400
  arrives and someone investigates. These three all ACCEPT, and produce a
  plausible value, so the endpoint returns 200 with the wrong rows. Nothing
  downstream can tell: the query layer received a legitimate number, the
  handler received a legitimate array. The defect exists entirely in the gap
  between what the caller wrote and what the schema decided they meant.

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
