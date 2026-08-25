# SPEC.md amendments — retiring §8, and recording what exists

**Purpose.** Make SPEC.md describe the app that exists at `47b0ac0`. No implementation
follows from this document; it is edits to SPEC.md only.

**Two judgement calls, applied here rather than asked about:**

1. **§8.1 and §8.2 are amended in place and compressed, not deleted.** Four live things
   reference them — §10b's sparseness rule, the shelf's genre-grouping rule, §4.3's
   membership prose, and §9.1's scoring vocabulary — so deletion would leave dangling
   references in sections that describe working code. §5.6 already sets the precedent for
   a "built and retired, here is why" note. What goes is the payload shape and the
   community-detection algorithm; what stays is one paragraph of reason plus a pointer to
   git. Reverse this if you'd rather delete outright, but harvest A6, A7 and A9 first —
   those move surviving rules out of §8 and into the sections that use them, and they are
   the reason deletion is currently unsafe.

2. **E2E #6 and #7 are redefined, not renumbered.** NOTES, REVIEW-PLAN and
   `playwright.config.ts` all cite flow numbers (#4, #10, #11). Redefining 6 and 7 in
   place keeps every other reference valid and keeps §14's "eleven" literally true.

**One decision still open, marked below as A14:** §10b's "on desktop" qualifier. The
amendment written here matches the spec to the code. The alternative — gate the shelf by
width at step 15 — is a product decision, not a drift correction.

Amendments are ordered by section number, not by importance. A1, A2, A3 and A11 are the
ones that block or mislead the next unit.

---

## A1 — §1 Overview: both signature features are retired

**Why.** §1 names the network graph and shelf ordering as the two features the reference
data exists for. Both are gone. This is the first page of the document.

**REPLACE:**

> Around those sit reference data (artists, genres, labels, stores, pressings) that make two signature features possible:
>
> 1. **Network graph** — a force-directed visualization of the collection where artists and genres are nodes and influence/membership relationships are edges.
> 2. **Shelf order** — a derived linear ordering of the physical collection based on graph clustering, so the shelf reads as a genealogy rather than an alphabet.
>
> Plus a **suggestion engine** that recommends records to acquire based on gaps in the graph.

**WITH:**

> Around those sit reference data (artists, genres, labels, stores, pressings) that make two signature features possible:
>
> 1. **The shelf** — the collection rendered as a wall of spines, ordered by genre so related records stand together, with a record that can be pulled out and turned over (§10b). It is the default view of the collection.
> 2. **In-store lookup** — a structured Discogs search that answers "do I already own this pressing?" and "is this a fair price?" while standing in a shop (§5.7, §7.7, §10a).
>
> Plus a **suggestion engine** that recommends records to acquire from the relationships in the collection: influence edges the user has asserted, shared band membership imported from MusicBrainz, and genre overlap (§9).
>
> An earlier version of this spec named a force-directed network graph and a derived shelf *ordering* as the two signature features. Both were built and retired at step 13; §8 records why, and §10b is what replaced them. The relationship data they read from is untouched and still feeds §9.

---

## A2 — §2 Stack: D3 is unused, three.js and sharp are undeclared

**Why.** §2 is described as non-negotiable and is the list CLAUDE.md §5 checks a new
dependency against. It currently mandates a library whose only consumer was deleted, and
omits two the app requires — one of which (`three`) is needed by the very next unit, so as
written that unit cannot start without a spec violation.

**REPLACE the row:**

> | Graph viz | D3 (`d3-force`) rendered to SVG |

**WITH the rows:**

> | 3D | `three` — **only** for the pulled record (§10b). The shelf itself is CSS, and that is a rule, not an accident: see §10b. |
> | Image processing | `sharp` — spine colour averaging at import (§10b). Present transitively via Next; **declared explicitly** so a Next minor release cannot remove it. |

**And add beneath the table, with the other constraints:**

> - **`d3-force` is no longer part of the stack.** It was specified for §8.1's graph, which is retired. Before uninstalling, grep for importers — a null result from a search that could not have found it is not evidence (NOTES). If nothing imports it, remove it; the dependency and this line go together.
> - **`three` is scoped to the pulled record and nothing else.** §10b's wall is deliberately 2D. A change that renders the shelf in WebGL is a spec change, not an implementation detail.

**Also amend the secrets line.** REPLACE:

> Secrets (`DISCOGS_TOKEN`, `ANTHROPIC_API_KEY`, `APP_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`) live in env vars

**WITH:**

> Secrets and required environment values (`DISCOGS_TOKEN`, `ANTHROPIC_API_KEY`, `APP_PASSWORD_HASH`, `SESSION_SECRET`, `CRON_SECRET`, `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `MUSICBRAINZ_CONTACT_EMAIL`) live in env vars

> `MUSICBRAINZ_CONTACT_EMAIL` is not a secret but is required by MusicBrainz's terms of use in the `User-Agent` (§12 step 11), and §14 requires every variable documented in `.env.example`. Three of these fail at point of use rather than at boot — Blob, MusicBrainz contact, Anthropic — which R6 is tasked with checking.

---

## A3 — §4.2 `records`: `spine_colour` is missing

**Why.** The column exists (migration, both write paths, a backfill script, a gap-fill
rule), and §4 — the authority on schema — does not mention it. §10b says a colour is
"computed once at import and stored" without saying where.

**ADD to the `records` table:**

> | spine_colour | TEXT | nullable. The average colour of this record's cover as `#rrggbb`, computed once when a cover image is attached and stored (§10b). |

**And beneath the table:**

> **`spine_colour` is written once and never overwritten** (§7.8). It is computed from the *cover* image only — a matrix or label photograph averages to the vinyl or the label, not the sleeve, and would give a spine matching nothing on the shelf. `null` means no cover has been processed and is treated as absent rather than as a decision, so a record whose first cover failed to decode still gets a colour when a readable one arrives. A null spine renders plain (§10b): an honest absence, not a gap in the wall, and never a default colour.
>
> The averaging rule itself is a product decision recorded in §10b, not a schema concern. The one schema-adjacent constraint: the value is stored, not derived per render, because computing it needs the image bytes.

---

## A4 — §4.2 `records`: storage for §10b's snippet *(decision, not a correction)*

**Why.** §10b mandates a stored, editable, deletable snippet that a regeneration must not
overwrite. §7.8 requires knowing whose text a field holds, and NOTES' release-versus-copy
rule says a field the user may have edited is indistinguishable from one they wrote unless
something records the difference. Building the snippet against a schema §4 does not specify
would be the step-11 shape: a feature scoped before its storage was designed.

Not applied automatically — it specifies unbuilt work. Take it or drop it deliberately.

**ADD to the `records` table:**

> | snippet | TEXT | nullable. Two or three generated sentences about the album (§10b). Absence is normal. |
> | snippet_edited_at | TIMESTAMPTZ | nullable. Set when the user edits the snippet. |

**And beneath the table:**

> **`snippet_edited_at` is what makes §7.8 enforceable here.** Null means the text is as generated and a regeneration may replace it; non-null means the user owns it and a regeneration must refuse rather than overwrite. A boolean with a default would not do: `false` would mean both "generated" and "never asked", and the two become indistinguishable at write time (NOTES). Deleting a snippet sets `snippet` to null and leaves `snippet_edited_at` alone — a deliberate deletion is an edit.

---

## A5 — §4.3: `artist_memberships` prose cites a retired section

**Why.** Three forward references into §8.1 for link types and weights. The membership data
and the shared-member derivation are both still correct and still wanted by §9; only the
drawing is gone.

**REPLACE, in "Membership is never written to `artist_influences`":**

> and §8.1's graph already treats `influence` and `member_of` as distinct link types with different weights.

**WITH:**

> and membership and influence are different claims: one is a sourced fact about a lineup, the other is the user's judgement about sound. Collapsing them would fill a 1–5 `strength` with a number nobody measured.

**REPLACE the paragraph:**

> **Shared membership is still a real connection and the graph draws it.** Two groups sharing a person — Discharge and Broken Bones — is evidence of a genuine link, derived from `artist_memberships` at query time rather than denormalized into an influence row. §8.1 gains a fourth link type, `shared_member`, weighted by the number of people in common. It is drawn differently from `influence` because it means something different: a fact about lineups, not a claim about sound.

**WITH:**

> **Shared membership is a real connection and §9 may read it.** Two groups sharing a person — Discharge and Broken Bones — is evidence of a genuine link. It is derived from `artist_memberships` at query time, weighted by the number of people in common, and never denormalized into an influence row. §8.1 drew it as a `shared_member` edge; that screen is retired (§8) and the derivation went with it, but the data and the reasoning stand and are exactly what §9.1's "linked to artists you own" term should read. The weight distinction matters when it is rebuilt: a tribute act overlaps by one hired player, a genuine side project by several, and that difference is the signal.

---

## A6 — §5.6: finish the correction that stopped halfway

**Why.** The `/api/graph` row carries R4's note; `GET /api/shelf-order` beneath it does not,
and the heading still says "Graph & shelf". With both rows gone the section has no
endpoints, so it becomes a note rather than a table. Keep the number — §5.7, §5.8 and §5.9
are cited throughout.

**REPLACE all of §5.6** (heading, table and both rows)

**WITH:**

> ### 5.6 Graph & shelf — retired, no endpoints
>
> This section listed `GET /api/graph` and `GET /api/shelf-order`. Neither exists.
>
> `/api/graph` was built, integration-tested, and called by nothing: §5.6 required the endpoint while §8.1 independently required `/graph` to be a server component calling `buildGraph()` directly. Both mandates were followed and they could not both produce a live endpoint. The server component won on merit and the spec line was the defect. `buildGraph` itself was later deleted with the graph screen (§8).
>
> `/api/shelf-order` was never built. §10b replaced the feature before step 13 reached it (§8.2).
>
> **The rule this leaves behind, because §14 will otherwise recreate the first mistake:** §5 lists endpoints a client actually calls. Where a server component or a query-layer function is the only consumer, the contract and its tests live at that layer, and no endpoint is built to satisfy §14's completeness line.

---

## A7 — §7.1: the graph is not a caller any more, the shelf is

**Why.** §7.1's hierarchy rule binds every caller that filters by genre. The graph was one
and is gone; `shelfRecords`'s top-level-ancestor walk is a new one and is not named. NOTES
records that this sentence being correct-but-scoped is what let `buildGraph` use flat
equality for months.

**REPLACE:**

> 1. **Genre nesting**: a record tagged with a child genre is implicitly a member of all ancestor genres for filtering and graph purposes. Compute this with a recursive CTE; do not denormalize.

**WITH:**

> 1. **Genre nesting**: a record tagged with a child genre is implicitly a member of all ancestor genres — for collection filtering, for `/api/records/facets` counts, and for the shelf's ordering (§10b). Compute this with a recursive CTE; do not denormalize. Every caller uses the same walk, from one shared module: two callers with their own copies is how one of them ends up matching only the exact genre while the other walks the subtree, and both return a plausible 200.

---

## A8 — §8: replace both subsections with a retirement note

**Why.** §8.1 and §8.2 specify, in full detail, software that has been deleted (§8.1) and
software that was never written (§8.2). Together they are the largest block of dead
specification in the document.

**REPLACE the whole of §8 — the heading, §8.1 and §8.2 — WITH:**

> ## 8. Graph & shelf ordering — retired at step 13
>
> Both features in this section are gone. They are recorded here rather than deleted because three sections still in force were written against them, and because the reasons are worth keeping.
>
> ### 8.1 Network graph — built, then retired
>
> `GET /api/graph` returned artist and genre nodes with `influence`, `member_of`, `genre_parent`, `shared_member` and `has_genre` links; `/graph` rendered them with a D3 force simulation. It shipped at step 12 and was retired at step 13 unit 5, along with `buildGraph` and the `has_genre` derivation. The implementation is in git at `src/lib/db/queries/graph.ts`, commit `bfc8f08^`, with the tests that pinned its clustering behaviour.
>
> **Why.** It drew a picture that told the user what they already knew. The collection's structure — punk things, rock things, two singletons — was legible from the shelf without a force layout, and the screen's real value turned out to be the data behind it, which §9 reads directly.
>
> **What survives, and where it went.** The tables are untouched and still written correctly: `artist_memberships`, `artist_genres`, `artist_influences`, `record_genres`. Three rules moved rather than died:
>
> - **Genre grouping and its tie-break** — an artist or record is attributed to the top-level ancestor of the genre with the most of its owned records, ties broken by genre name so the same collection always groups the same way. This was the graph's colouring rule and is now the shelf's ordering rule; it is stated in §10b, which is the section that uses it.
> - **Sparseness is not disguised.** A collection of unrelated artists is genuinely a scatter, and a view that implied structure the data lacks would be the confidently-misleading shape CLAUDE.md §8 forbids. Restated in §10b rather than referenced from here.
> - **`has_genre` was a count, not a boolean** — the number of an artist's owned records tagged with a genre, derived at query time from `record_genres` and never stored (§7.1). §9.1's genre-overlap term is the same aggregate and should be written against §9's requirement rather than restored wholesale: a payload builder shaped for a force layout is the wrong shape for a scoring function.
>
> **People are edges, not nodes** was the graph's answer to a real problem that outlives it: a membership import pulls in every session player and side project, and 71 artists of which 4 have records is a hairball. Any future view over this data inherits the problem. The graph's answer was to collapse a person who links two groups into a weighted edge between them; it is recorded here because the next reader will meet the same 67 artists.
>
> ### 8.2 Shelf order — specified, never built
>
> `GET /api/shelf-order` proposed a linear filing order for the physical collection, derived by greedy-modularity community detection over an artist graph weighted by `INFLUENCE_WEIGHT` and `GENRE_WEIGHT`, with bridge records marking the transitions.
>
> **Why it was retired before it was built.** It needed three things the collection does not have: enough records for clusters, a built-out genre hierarchy, and hand-entered influence edges. Its output for a real collection today is "punk things, rock things, two singletons" — which a genre sort gives for free, without a tuning knob no test can validate. `WIDE_RATIO` had already failed to validate twice against a case with a known answer; `INFLUENCE_WEIGHT`/`GENRE_WEIGHT` would have been the same bet, twice over.
>
> **One requirement survived and is load-bearing.** *"The same collection must always produce the same shelf order."* A wall scanned by eye cannot reshuffle between page loads, or it is re-scanned every time. §10b inherits this and states it; `shelfRecords` breaks every tie deterministically and a test pins it. The requirement was about the problem, not the algorithm, which is why it outlived the mechanism.
>
> **What replaced both:** §10b.

---

## A9 — §9.1: "the graph" no longer names anything

**Why.** §9 is step 14. Its scoring is defined in terms of a structure §8 no longer
describes, and its genre-overlap term is `has_genre` under another name.

**REPLACE:**

> For each artist **not** in the collection but reachable in the graph (i.e. appearing in `artist_influences` linked to an owned artist), compute:

**WITH:**

> For each artist **not** in the collection but reachable from one that is — appearing in `artist_influences` linked to an owned artist, or sharing a member with one through `artist_memberships` (§4.3) — compute:

**And add beneath the scoring block:**

> **"Genre overlap" is a count, not a flag.** For each artist, the number of their owned records tagged with each genre, rolled up through the hierarchy per §7.1 and derived at query time from `record_genres` — never stored. Ties break on genre name so the same collection scores the same way on every call. This is the aggregate §8.1's retired `has_genre` link computed; it is specified here because §9 is now its only consumer.

---

## A10 — §10 screens table: two screens do not exist, one is described wrongly

**Why.** This table is the app's index. It lists `/graph` and `/shelf`, neither of which
exists, and describes `/` as a two-way grid/table toggle when the shelf is its default view.

**DELETE both rows:**

> | Graph | `/graph` | The force-directed network. Controls: genre subset, reset zoom. Owned records only — there is no want-list view (§8.1). |
> | Shelf order | `/shelf` | Ordered sections, bridge records marked, print stylesheet, alphabetical toggle. |

**REPLACE the Collection row:**

> | Collection | `/` | Filterable, sortable list/grid of owned records. Prominent search. Filter chips for genre/label/store/tag. Toggle grid ↔ table. |

**WITH:**

> | Collection | `/` | Three views of the owned collection: **shelf** (default, §10b), grid, and table. Prominent search. Filter chips for genre/label/store/tag. Filtering, sorting and paging apply to grid and table; the shelf is a wall, not a result set. |

**And add beneath the table, with the other §10 notes:**

> **The shelf has no route of its own.** It is a view of `/`, selected by the absence of `?view=`, with `?view=grid` and `?view=table` as the alternatives. Pulling a record out is a state of that screen, not a navigation — but a spine is still a link to `/records/:id`, so cmd-click, middle-click and a failed hydration all behave correctly (§10b).
>
> **`/graph` and `/shelf` were listed here and are retired** (§8). Nothing links to them and no route exists.

---

## A11 — §10b: four corrections inside the section itself

**Why.** §10b contradicts itself on three.js, names a survivor that did not survive, cites a
section being retired, and does not carry the two rules the shelf inherited from §8.

**A11a — the intro is wrong about the 3D engine. REPLACE:**

> Inspired by thecriterioncloset.com, and worth being explicit about what is borrowed: a wall of spines in perspective, a crosshair that names what you are aimed at, and a case that comes off the shelf and can be turned over. What is *not* borrowed is the 3D engine — see below.

**WITH:**

> Inspired by thecriterioncloset.com, and worth being explicit about what is borrowed: a wall of spines in perspective, a crosshair that names what you are aimed at, and a case that comes off the shelf and can be turned over. The 3D engine is borrowed for one thing only — the pulled record — and deliberately not for the wall. Both halves of that split are reasoned below, and the reasoning is the point: the wall is flat, so CSS is right for it; the record is an object you turn, so it is not.

**A11b — `has_genre` is not surviving data. REPLACE, in "What this replaces":**

> `/graph` is likewise retired as a screen. The data behind it — `artist_memberships`, `has_genre`, `artist_influences` — remains and feeds §9's suggestions, which is what it was actually useful for. Drawing it added a picture that told the user what they already knew.

**WITH:**

> `/graph` is likewise retired as a screen. The tables behind it — `artist_memberships`, `artist_genres`, `artist_influences`, `record_genres` — are untouched, still written on every import, and feed §9's suggestions, which is what they were actually useful for. Drawing them added a picture that told the user what they already knew.
>
> Note that `has_genre` was **not** among the survivors, though an earlier version of this paragraph listed it. It was never a table: it was an artist-to-genre count derived inside `buildGraph` on every call, and it was deleted with it. §9.1 specifies the equivalent aggregate for the one consumer that still wants it.

**A11c — the sparseness bullet cites a retired section. REPLACE:**

> - **Sparse is fine.** Six records is a short shelf, and the view does not pad, fake, or hide itself until the collection is large enough to flatter it. §8.1's rule applies here too.

**WITH:**

> - **Sparse is fine.** Six records is a short shelf, and the view does not pad, fake, or hide itself until the collection is large enough to flatter it. A view that implied more structure than the data has would be the confidently-misleading shape CLAUDE.md §8 forbids — which is exactly why the shelf has a minimum length rather than a full-viewport one: the emptiness must not imply a collection that should have filled it.

**A11d — the ordering bullet must carry the two inherited rules. REPLACE the last sentence of the "Records stand as spines" bullet:**

> That ordering is the shelf's own, not a proposal for the physical one.

**WITH:**

> That ordering is the shelf's own, not a proposal for the physical one.
>
>   **A record occupies one position, so exactly one genre wins.** A record carrying several genres appears once, filed under the top-level ancestor of the genre with the most of that record's owned siblings, ties broken by genre name. This is the rule §8.1's graph used to colour an artist, kept deliberately identical: two views grouping one collection by different genre logic would disagree about what belongs together, and the disagreement would read as a bug in whichever the user checked second. Records with no genre file last, under no heading, as themselves.
>
>   **The order is deterministic.** The same collection always produces the same wall — every tie broken explicitly, down to the record id. Inherited from §8.2, which stated it about a physical filing order and was right about the problem rather than the algorithm: a wall you scan by eye cannot move between loads, or you re-scan it every time.

**A11e — name where the colour is stored. REPLACE:**

> - **A spine's colour is the average colour of its cover**, computed once at import and stored. A record with no cover gets a plain spine — an honest absence, not a gap in the wall.

**WITH:**

> - **A spine's colour is the average colour of its cover**, computed once when the cover is attached and stored in `records.spine_colour` (§4.2). The average is taken in linear light and weighted by alpha, not by the most populous colour bucket — measured against real sleeves, a dominant-bucket rule gives a warm brown portrait a near-black spine, which is a wrong answer rather than a different one. Saturation is never boosted: a spine is a claim about a cover, and a shelf prettier than the sleeves on it is inventing colour the record does not have. A record with no cover gets a plain spine — an honest absence, not a gap in the wall.

---

## A12 — §11: tests for deleted features, and no tests for the built one

**Why.** Four required tests cannot pass, and `e2e/shelf.spec.ts` exists with seven tests
that §11 does not know about. §14 gates on this section.

**A12a — DELETE both unit bullets:**

> - Shelf-order algorithm — community detection and ordering on fixture graphs, incl. degenerate cases (zero artists; one artist; no edges at all; every artist in one community; two disconnected components).
> - Shelf-order **determinism** — same fixture in, byte-identical output across repeated runs.

**REPLACE with:**

> - **Shelf ordering determinism** — the same collection produces byte-identical order across repeated runs, including the tie-break chain (§10b).
> - **Shelf genre attribution** — a record carrying several genres appears exactly once, under the correct top-level ancestor, with ties broken by name; a record with no genre files last.
> - **Spine colour** — average-in-linear-light against known inputs, alpha weighting, and the null case (no cover, or a fully transparent image) returning absence rather than black.
> - **Spine text fitting** — the character budget derives from spine height rather than being declared, the truncation gives way in the right order (title, then artist, never the catalogue number), and the degenerate case where artist plus catalogue number alone exceed the budget.

**A12b — REDEFINE E2E flows 6 and 7** (do not renumber; other documents cite these numbers):

> 6. Load the collection at its default view, confirm the shelf renders spines for owned records, and click one — verify it leads to that record.
> 7. Pull a record out of the shelf and turn it: verify the back face renders label, catalogue number and pressing details for a record with no photographed back, and that the gatefold affordance is **absent** on a record with no inner image.

**A12c — the mocking line names two APIs and there are three. REPLACE:**

> Mock the Discogs and Anthropic APIs in tests. Never hit live external APIs in CI.

**WITH:**

> Mock the Discogs, MusicBrainz and Anthropic APIs in tests. Never hit live external APIs in CI. The no-live-call guard is host-agnostic by design and already covers all three; it keys off the database target rather than a flag, and R6 owns the case that breaks (a test run against a remote database).

---

## A13 — §12: step 12 shipped and was retired; its rationale paragraph is about deleted code

**Why.** The build order describes work whose product does not exist, and closes with a
paragraph arguing for an ordering that only made sense for the graph.

**REPLACE step 12:**

> 12. Graph endpoint + visualization. E2E #6.

**WITH:**

> 12. Graph endpoint + visualization. **Built and retired at step 13** — see §8. Kept in this list because the steps are numbered and referenced; the work happened, the screen no longer exists, and the data it read from is still populated by steps 10 and 11.

**REPLACE the closing paragraph:**

> **Why 10 and 11 come before the graph.** The original order put the graph immediately after the stats screen, and the graph reads its edges from `artist_influences` — a table nothing populates automatically. Built in that order, the graph renders unconnected dots, nobody can tell whether the force layout or the clustering works, and step 13's shelf ordering inherits the same blindness, since it runs community detection over the same edges. Seeding the table first makes all three verifiable. Market data moves ahead of both because it has no dependency at all and answers the question the app exists for.

**WITH:**

> **Why 10 and 11 come before 12.** The original order put the graph immediately after the stats screen, and it read its edges from `artist_influences` — a table nothing populated automatically. Built in that order it would have rendered unconnected dots, with no way to tell whether the layout or the clustering was at fault. Seeding first made it verifiable, and what that verification eventually showed was that the screen was not worth keeping (§8) — which is a better outcome than shipping it blind. Step 11's membership data survives the screen and now feeds §9. Market data moved ahead of both because it has no dependency at all and answers the question the app exists for.

---

## A14 — §10b: "on desktop" *(decision, applied — reverse if you'd rather gate by width)*

**Why.** §10b says the shelf is the default view of `/` on desktop. The code makes it the
default at every width and hides only the *control* on small screens, so nothing becomes
unreachable and a grid URL shared from a desktop still opens as a grid. The code's
behaviour is reasoned and commented; the spec's qualifier is not enforced anywhere.

Applied as: match the spec to the code, and hand step 15 the open question rather than a
silent disagreement.

**REPLACE:**

> This is the default view of `/` on desktop.

**WITH:**

> This is the default view of `/`, at every width. Only the view *control* is hidden on narrow screens, so nothing becomes unreachable and a `?view=grid` link shared from a desktop still opens as a grid.
>
> Whether a phone should default to the shelf at all is genuinely open and belongs to step 15's mobile pass, which is the first time the wall will be judged at 390px. If it is gated by width then, the gate goes on the default and not on availability: a view a URL can reach must stay reachable.

---

## After applying

Three claims in the drift list are about the repository rather than this document and are
worth one command each before the next unit:

1. Is `d3-force` still in `package.json`, and does anything import it? A2 removes it from
   the spec; the dependency is a separate act, and a negative search result is only evidence
   if the search could have found it.
2. Does `AppHeader` still carry a Graph link? If not, NOTES' step-15 entry describes six
   links and there are five — the measurement behind it (three links off-screen at 390px)
   was taken with Graph present and needs retaking before step 15 acts on it.
3. Does `src/app/shelf/` contain a `page.tsx`? A10 asserts `/shelf` is not a route.

**Then the gate is achievable again:** with A12b applied, §14's "all eleven E2E flows in
§11 passing" is literally true against `e2e/shelf.spec.ts`, and A6 removes the §5
completeness line's ability to demand an endpoint nothing calls.
