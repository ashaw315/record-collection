# NOTES.md

Out-of-scope observations recorded during build steps, per CLAUDE.md §4.
Most of this file is observations that have NOT been acted on; the exceptions
are the entries marked CORRECTED or RESOLVED, which record something that was
believed and turned out to be false. Each entry names the step it was noticed
in.

---

## CURRENT POSITION — read this first

**Updated: 2026-08-06, end of the E2E stability unit.**

**Where we are.** Step 5 (SPEC.md §12: "Records CRUD + collection list + record
detail + add/edit form. E2E #2"). The **API is complete and remediated**. The
**collection screen at `/` is built**: shell, list, search, filter chips with
facet counts, sort, the undated toggle, and `matchedVia` rendered. **What
remains in step 5:** the grid/table toggle and pagination controls (unit 7d),
record detail at `/records/:id`, the add/edit form, and E2E #2 — to be written
as soon as the form lands, not deferred to the mobile pass.

**Last verified, and when.** 2026-08-06:

| Check | State |
|---|---|
| `npm test` | 1026 passed, 1 skipped, 51 files |
| `npx playwright test` | 82 passed — with one known flake, below |
| `npm run typecheck` / `lint` / `build` | clean |
| Neon transaction gate | **closed** — 7 tests against the recreated branch |

**Two caveats a green suite will not tell you.**

1. **The Neon gate's closing test was hollow until this remediation** and
   reported green from the day it was written. It blanked `TEST_DATABASE_URL`
   to point the primitive at the branch, which made `resolveDriver` throw — and
   a bare `.rejects.toThrow()` accepted that refusal as if it were the rollback
   under test. It never reached Neon. Fixed 2026-08-06. Do not read "the gate
   was closed in unit 1" as meaning it was verified from unit 1.

2. **`e2e/collection-filters.spec.ts` flakes at roughly one failure per full
   suite run**, varying between three specs, on both projects. NOT skipped —
   a skipped test is a false claim of coverage. It passes 14/14 when the file
   runs alone, and each spec's logic is verified. Ruled out by measurement:
   cross-project contention, device emulation, viewport width, worker
   concurrency, elapsed time, fixture accumulation, and Fast Refresh. See the
   E2E stability entry below; the diagnosis is open.

**The two quarantined `/manage` genre specs are UNQUARANTINED** as of this unit
— 9/9 across every configuration once the E2E reset and `force-dynamic` landed.
Both causes were environmental, not the logic the four earlier fixes targeted.

**What is queued next**, in order: unit 7d (grid toggle, pagination), record
detail, the add/edit form, then E2E #2. Three entries below bear on that work —
the undated-records year-range gap, §7.6's two-prices hazard, and `/manage`'s
own unfixed 200-row assumption.

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

**They all still apply UNDISCHARGED to `want_list` (step 6)**, and 14 was always
want_list-only. The prediction that the template would not stretch was correct:
the review found six defects in the records query layer, four of them in
exactly the "no precedent" items 9–12.

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

14. **`want_list` acquire (§5.3) is transactional and never deletes the
    want-list row** — it marks `is_acquired` and links `acquired_record_id`
    (§7.3). The want list doubles as acquisition history. A forced
    mid-transaction failure test is required by §11.

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

  **Current state**, verified 2026-08-06: `test/integration/neon-transactions.test.ts`
  runs 7 tests against a real throwaway Neon branch over
  `drizzle-orm/neon-serverless` — the only place in the suite that driver is
  exercised at all. Both nested-write primitives are covered:
  `writeRecordWithNested` (create) and `updateRecordWithNested` (PATCH).

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

  **Still deferred, and unaffected by the above:** SPEC.md §5.3's
  `POST /api/want-list/:id/acquire` is step 6 work and its §11-required
  mid-transaction failure test does not exist yet. A partially-applied acquire
  (a `records` row with `want_list.is_acquired` never set) would silently
  corrupt §7.3's want-list-as-acquisition-history invariant. The harness to test
  it on Neon now exists; the acquire flow does not. Step 6 cannot be closed
  without it.

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
