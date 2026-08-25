# SPEC.md amendment A28 — §9.1 scores what it has a source for

Baseline `97fbd85`.

**Anchors could not be extracted by execution.** If any does not match, stop and quote what is
there.

---

## Why

Two of §9.1's four scoring terms have no data source, measured rather than assumed:

**Genre overlap.** `artist_genres` has a schema, FK cascade rules, a `REFERRERS` entry,
conformance tests and merge logic — and **no writer, ever**. Not the MusicBrainz walk, not the
Discogs import, not the artists endpoint, not any UI. `mergeArtists` moves rows between artists
and cannot create one. Live: 139 artists, 81 `record_genres` rows, **0 `artist_genres` rows**.

**Label overlap.** There is no `artist_labels` table at all — absent, not empty. `labels` is
referenced only by `records.label_id` and `want_list.label_id`, so a label attaches to a
pressing-bearing row and never to an artist. The collection half of the term is healthy (38
labels, 37 of 38 records carry one); only the candidate half has nowhere to come from.

**A candidate owns nothing by definition**, so neither term can be rescued by deriving from
records — that yields zero for every candidate, which would make the term silently inert and
the reason string simply never mention genre, with nothing indicating why. That is the
absent-versus-unknown failure in a scoring function.

**The terms are not wrong.** `artist_genres` is the correct source for "shares the UK82
genre"; it has never been populated. So they are recorded as specified-not-built with
triggers, rather than deleted — this document has twice found that a retired clause's
requirements outlive its mechanism (§8.2's determinism rule, §8.1's colour tie-break).

---

## A28a — §9.1: the scoring block

**REPLACE the scoring block and the terms beneath it** with the two link terms only, and add
beneath it:

> **Two terms are specified below and not yet scored, because nothing populates their source.** Measured, not assumed: `artist_genres` has never held a row, and no `artist_labels` table exists. Both are recorded at §9.1a with what each would need.
>
> What remains is a **relationship engine**: an artist is suggested because you asserted an influence edge to them, or because they share members with a band you own. That is scene adjacency, and it is what the data actually supports today. §9.2's LLM gap analysis is where genre-aware suggesting lives, and it is unaffected — it summarises the collection from `record_genres`, which is populated.

---

## A28b — §9.1a: the two unbuilt terms

**ADD a new subsection after §9.1:**

> ### 9.1a Two terms awaiting a source
>
> Both were specified in §9.1 and are not scored. Each is recorded with what it needs, because the term is right and the data is missing rather than the reverse.
>
> **Genre overlap — `1.5 × overlap with the user's top 3 genres by owned count`.** "By owned count" ranks the top 3; it does not say whose records supply the overlap. The overlap is between the candidate and those three genres, and a candidate's genres are a property of the artist — `artist_genres` (§4.3) — not of records they do not own. §9.1's own example reason string says *"shares the UK82 genre"*, a claim about an artist.
>
> **Trigger: when anything populates `artist_genres`.** The obvious candidate is the Discogs import, whose release payloads carry genres and styles.
>
> **But that is a measurement before it is an implementation**, and the measurement comes first. Discogs genres are a property of a *release*. Deriving "this artist is a UK82 artist" from one release's tags is a claim about an artist assembled from claims about records, which is the move §4.3 already refuses when it declines to write membership into `artist_influences` — MusicBrainz has no influence relationship, and mapping one onto the other would fill a 1–5 strength with a number nobody measured. Whether a release's genres honestly characterise its artist is answerable against real payloads and must be answered before this is built. If the answer is no, the term needs a different source or it does not ship.
>
> **Label overlap — `1.0 × overlap with labels appearing 2+ times in the collection`.** Needs an artist-to-label relationship, which does not exist in §4 in any form.
>
> **Trigger: a schema decision, taken deliberately, not as a side effect of building the term.** The same question applies harder than for genres: a label is a property of a *pressing* (§4.2), and an artist releasing once on Clay does not make them a Clay artist. A table asserting otherwise would be the app inventing a fact about an artist from a fact about a record.
>
> **Neither term is deleted, because neither is wrong.** They are claims this app cannot currently substantiate, and §8's rule is that an unsubstantiated claim is not made quietly.

---

## A28c — §11: the unit-test line

**REPLACE §11's suggestion-scoring line** to require only the terms that are scored, and add:

> The genre and label terms are unbuilt (§9.1a) and have no tests. **Do not write tests asserting they return zero** — a test pinning an unsourced term to zero would pass for the wrong reason and would keep passing after a source arrived.

---

## A28d — NOTES-worthy, recorded in SPEC because it governs the schema

**ADD to §4.3, beneath `artist_genres`:**

> **This table has never held a row.** It has a schema, cascade rules, a `REFERRERS` entry, conformance tests and merge handling — all correct, none of which check that anything writes to it. `mergeArtists`' handling of it was found broken during a review, diagnosed, fixed and pinned with a test, for rows that cannot exist; the test builds its own fixture and genuinely proves the code works, and no test can notice that the production path feeding it has no source.
>
> Recorded here rather than only in NOTES because it is a fact about the schema: **a table can read as populated because everything around it behaves as though it is.** The dead-code sweep finds a module with no callers by following imports; a table with no writers is not findable that way. The check is whether a write path exists, not whether rows are present — a table can be legitimately empty and fully wired.

---

## Verify

```
grep -n "artist_genres\|artist_labels" SPEC.md
grep -n "9.1a\|genre overlap\|label overlap" SPEC.md
```

Classify every hit. Then read §9 end to end and answer: **does it now describe an engine that
can be built from the data that exists, with the rest recorded rather than implied?**

## Commit

```
git add SPEC.md
git commit -m "SPEC: A28, §9.1 scores what it has a source for"
```

Then stop. Unit 2 is the two link terms wired into `GET /api/suggestions`, not the genre term.
