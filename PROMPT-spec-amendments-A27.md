# SPEC.md amendment A27 — an asserted influence and a shared member are two terms, not one

Baseline `e27583d`.

**Anchors quoted from SPEC.md at that commit.** If any does not match, stop and quote what is
there rather than guessing at the intent.

---

## Why

§9.1's reachability clause was amended at A9 to admit a second route: an artist can be reached
either by an `artist_influences` edge or by sharing a member through `artist_memberships`. The
scoring block underneath it was not amended to match. It still carries one link term:

> (2.0 × number of owned artists directly linked, weighted by edge strength)

`strength` is a column on `artist_influences` only. A shared membership has no strength and
§4.3 is explicit that it must never acquire one — "mapping membership onto influence would
fill a 1–5 `strength` with a number nobody measured". So the scoring block as written can
only score one of the two routes it now admits, and the obvious repair — feeding shared
members into the same term — is the thing §4.3 forbids, arriving through the back door.

**The two inputs are different kinds of claim.** `artist_influences.strength` is a 1–5
judgement the user typed. Shared-member count is a fact with a source, imported from
MusicBrainz. Combining them in one term requires an exchange rate between an opinion and a
measurement, and nothing in the collection can supply one.

**This project has already paid for that mistake once.** `WIDE_RATIO = 3` was a guess that
became a threshold; NOTES records two rounds of measurement against the one master with a
known answer, and it fired the wrong way both times. A weight of "one shared member ≈ N
strength points" would be the same shape — unfalsifiable against the data available, frozen
on first write, and thereafter cited as though it had been measured.

**A sum also destroys the signal the data was imported for.** NOTES measured, after the first
live lineup walks, that Dire Straits Experience shares exactly one member with Dire Straits
while a genuine side project shares several — "a side project is interesting because it might
have records worth buying, a tribute act never does". §4.3 says the same: "a tribute act
overlaps by one hired player, a genuine side project by several, and that difference is the
signal". Adding shared members into a link total makes one strong influence edge and four
shared members indistinguishable, which is precisely the discrimination the step 11 import
exists to provide.

Keeping them separate costs one term and one clause in the reason string, and it lets the user
judge two different claims separately — "linked to 3 artists you own" and "shares 4 members
with Discharge" are not the same sentence.

---

## A27a — §9.1: the scoring block scores both routes

**REPLACE:**

> ```
> score =
>     (2.0 × number of owned artists directly linked, weighted by edge strength)
>   + (1.5 × genre overlap with the user's top 3 genres by owned count)
>   + (1.0 × label overlap with labels appearing 2+ times in the collection)
>   - (3.0 if already on the want-list)   // suppress, don't hide
> ```

**WITH:**

> ```
> score =
>     (2.0 × number of owned artists directly linked, weighted by edge strength)
>   + (1.5 × number of owned artists sharing members, weighted by people in common)
>   + (1.5 × genre overlap with the user's top 3 genres by owned count)
>   + (1.0 × label overlap with labels appearing 2+ times in the collection)
>   - (3.0 if already on the want-list)   // suppress, don't hide
> ```

---

## A27b — §9.1: why the two link terms stay apart

**ADD immediately beneath the scoring block, before the "Genre overlap is a count" paragraph:**

> **The two link terms are separate on purpose, and must not be merged.** An
> `artist_influences` edge carries a 1–5 `strength` the user typed; a shared membership carries
> a count of people imported from MusicBrainz. Merging them into one link total requires an
> exchange rate between a judgement and a measurement — a number nothing in the collection can
> supply, which would be guessed once and cited as settled thereafter. §4.3 already forbids the
> version of this that writes membership into `artist_influences`; scoring them as one term is
> the same conflation one layer up.
>
> Merging also destroys the distinction the membership import was built to expose. A tribute
> act shares one hired player with a band the user owns; a genuine side project shares several
> (§4.3). In a sum, four shared members and one strong influence edge are the same number, and
> the tribute is indistinguishable from the side project — the one comparison this data answers.
>
> **Weight the shared-member term by people in common**, not by whether any exist: the count is
> the signal. Ties break on artist name, so the same collection scores the same way on every
> call.

---

## A27c — §9.1: the reason string names which link contributed

**REPLACE:**

> Return the top `limit` sorted descending, each with a **reason string** assembled from which terms contributed — e.g. "Linked to 3 artists you own; shares the UK82 genre; on Clay Records, a label you own 4 records from."

**WITH:**

> Return the top `limit` sorted descending, each with a **reason string** assembled from which terms contributed — e.g. "Linked to 3 artists you own; shares 4 members with Discharge; shares the UK82 genre; on Clay Records, a label you own 4 records from."
>
> The two link terms appear as separate clauses, naming which one fired. "Linked to 3 artists
> you own" and "shares 4 members with Discharge" are different claims about different evidence,
> and a reader who can see which one produced a suggestion can judge it; a merged clause asks
> them to trust an arithmetic they cannot see.

---

## A27d — §11: the unit tests name both link terms

**Why.** §11's unit list says "every scoring term independently". With a second link term that
line still reads as satisfied while leaving the new term untested, and the merge this amendment
forbids would pass a suite written against the old wording.

**REPLACE:**

> - Suggestion scoring function — every scoring term independently, plus the want-list suppression case.

**WITH:**

> - Suggestion scoring function — every scoring term independently, plus the want-list suppression case. The two link terms are tested separately, including a case where an artist is reached by shared membership alone and one where it is reached by an influence edge alone: a single fixture carrying both cannot tell a correct implementation from one that merged them.

---

## After applying

§9.1 scores both routes it admits, and the reason string distinguishes them. Nothing about
§9.2 changes.

The amendment is deliberately silent on **1.5 as the shared-member coefficient beyond its
being distinct from 2.0**: an asserted influence edge is a stronger claim than a shared player,
since the user typed it about this specific pair, so it ranks above. That ordering is a
product judgement and is stated here; the two numbers are not measured against anything and
should not be described as though they were. What the amendment fixes is the *structure* —
that the terms are separate and weighted by their own evidence — which is what a later
measurement would need in place before it could say anything at all.
