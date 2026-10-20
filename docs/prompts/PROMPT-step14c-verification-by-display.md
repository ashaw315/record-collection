# Step 14c — verification-by-display

Build it. The spec is written (SPEC §12 step 14c), the measurement is done, and everything it
needs exists.

---

## What it is

A per-card expand on `/lookup` results. Tapping it fetches release detail for that candidate
and shows the fields that distinguish pressings — **so the user's eye does the comparison
against the record in their hand.**

That is the whole design. The app shows what Discogs has; the person holding the record
decides. **The app never claims a match it cannot justify.**

---

## Why display rather than matching

The deferred matrix design's expensive half was machine-matching messy transcriptions. The
measurement showed why that is a research project and this is not:

```
BSK-1-3010 LW2 F12 (scratched out) -W-1 KP SUB #1 MASTERED BY CAPITOL
BSK-1-3010 JW10 FS7• #2  MASTERED BY CAPITOL  ✲  KP
BSK-1-3010 F24 (Runout Side A, Etched - variant 1)
BSK-1-3010 LW1 F6 4  △21970 4 MASTERED BY CAPITOL   KP
```

Four *Rumours* pressings identical on every displayed column. Matching a typed runout against
those means handling spacing, strikethroughs, unicode glyphs and per-contributor conventions.
Reading your own deadwax and finding your row takes seconds.

**93% of collision groups resolve on identifiers and companies alone; 100% including notes.**
It works on Discharge and Misfits, where the search-level qualifier is 0% and 2% — which is the
case that mattered, because those are the genres being collected.

---

## Decisions already taken

**Per-card expand, not automatic.** Median 3 calls per collision group is affordable
on-demand; paying it on every search including the ones the display columns already separate
is not. An expand is also honest about what it is — the user is asking to compare, not being
told the answer.

**Identifiers and companies first, notes last and labelled.** A runout is transcribed off the
object and checkable against what the user is holding; notes are someone's description of a
release, running to 444 characters in one measured case. Keep them distinguishable the way
§10b keeps a snippet distinguishable from the facts — notes earn their place because they
resolved the one group identifiers could not, but they read as context rather than evidence.

**Runout strings render verbatim.** This is load-bearing and already guarded: `bounded()` only,
no `meaningful()`, no trim. The user's eye is the matcher, so anything normalised is
discrimination thrown away. The guard is mutation-verified — adding `.trim()` and whitespace
collapse fails three tests. **Whatever renders these must not tidy them either**, and that
needs its own assertion at the render layer, not just at the parse layer.

---

## What must not be built

**No storage of the answer.** Display resolves "which am I holding" at the moment of asking; it
does not record what was decided. `pressing_confidence` and `identification_evidence` are a
separate feature with a separate justification, deliberately carved out so they cannot be
smuggled in here.

**No matching, no scoring, no confidence enum.** If two candidates are genuinely
indistinguishable — three Portuguese Misfits bootlegs share byte-identical runouts, because
bootlegs copy each other's stampers — the correct behaviour is showing that they are the same,
not inventing a difference.

---

## What must not break

- **The existing lookup flow** — search, add to collection, add to want list, check the market.
- **The no-live-call guard.** Release detail is fetched through the existing client and route;
  tests must not reach Discogs.
- **Rate limiting.** The transport limiter paces at 60/min; an expand that fires several calls
  must go through it rather than around it.
- **Absence reads as absence.** A release with no matrix — 3 of 41 measured — shows that it has
  none, not an empty row that looks like a missing field.

---

## Tests

**The discriminating fixture is a collision group**, not a single release. A test that expands
one card cannot show that the feature distinguishes anything; the point is two candidates that
were identical becoming different.

**Assert the runout renders verbatim**, with a fixture carrying the real hazards — interior
double spaces, leading whitespace, `△ ✲ •`, `(scratched out)`. The parse layer is guarded;
the render layer is not.

**Assert notes are visually and structurally separable from identifiers**, so a future change
cannot merge them — the same shape as `RecordSummary` carrying `snippet` and `factGroups` as
separate fields so the panel cannot flatten them.

**Assert the calls go through the limiter**, and that an expand on a candidate with no
identifiers says so rather than rendering blank.

---

## Report

1. **Does expanding two identical-looking candidates make them different?** Screenshot the
   before and after on a real collision group.
2. **What renders, in what order, and how are notes marked as context?**
3. **How many calls does an expand cost, and do they pace?**
4. **What happens on a release with no matrix**, and on a group that is genuinely
   indistinguishable.
5. Anything the live payload shows that the fixtures do not.

Full suite, no file argument, `--retries=0`. Push and confirm the deploy — this is a
Git-connected project, so committed is not deployed and the report should say which.
