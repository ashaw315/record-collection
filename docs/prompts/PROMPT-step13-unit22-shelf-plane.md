# Step 13 unit 22 — the shelf is a plane, not a box

Baseline `cd9bc27`. Real shelf, `/`, CSS only. No three.js — the canvas overlay is next and
has to map onto whatever shape this unit settles.

---

## The finding this implements

Unit 21 rendered four candidate minimums at five records and all four failed:

| Minimum | Timber | Reading |
|---|---|---|
| none | 151px | a thumbnail — a UI tile, not furniture |
| 40% | 499px | a partly-drawn box |
| 70% | 874px | the same failure, wider |
| full | 1248px | missing data — implies records that should be there |

**They are one object at four widths.** A black rectangle terminating in a hard vertical
edge, and that edge is what makes it read as a container. No width setting removes an edge.
A softened edge was tried and read worse — a grey smear resembling a loading state.

This is unit 9's finding one level up. Unit 9 concluded *the defect was never the empty
space; it was what the empty space implied*, and solved it with a floor because the shelf sat
in a content column whose own edge did the containing. Full-bleed removed that, and exposed
what the floor was really doing. `MIN_SHELF_FRACTION` and the `w-fit`/`max-w-full` pairing
are already deleted.

**A real shelf ends where the wall ends, not where the records do.** That is the change.

---

## What to build

**The shelf edge runs the full width, edge to edge.** The horizontal band and its lip are
furniture: they span the wall regardless of how many records stand on them. Records sit on
the plane starting from the left; the rest of the plane is empty shelf, which is what an
under-filled shelf looks like.

**Full-width must not mean a black rectangle filling the screen.** The `full` candidate
failed for a real reason — 1111px of timber implied records that should have been there. The
distinction to get right:

- **The shelf plane** is the surface records stand on: the band they rest on, its front edge,
  its shadow.
- **The wall** is what is behind and above them, and it is not shelf.

An empty stretch of shelf should read as *shelf with nothing on it*, not as a dark void where
records were removed. **What the empty portion looks like is the question this unit answers**,
and it is a looking question, not an arithmetic one. Render candidates — how dark the wall is
against the plane, whether the plane carries any surface at all beyond its edge, how the two
separate — and choose by looking at five records and at a seeded 120.

**Rows still wrap and the wall still grows downward.** Every row gets its shelf edge, as it
does today via the repeating background. That mechanism is right and is not what this unit
changes.

**Square on, vertical scroll only** (§10b, A24b). No perspective, no camera. This is a flat
wall.

---

## What must not break

- **A spine is a link.** Cmd-click opens the record; the accessible name carries the
  untruncated title. Eight specs across five files find records by role and name.
- **Determinism** — the same collection always produces the same wall.
- **Filtering repacks** and the filter reaches the wall (`dc6e04c`). A24d's gaps are still
  deferred and are not this unit.
- **The geometry test from unit 21** measures the timber, not the wrapper. It currently
  asserts the wall spans the screen — check whether that assertion still means what it should
  once the plane is full-width, and say so. An assertion that becomes trivially true is the
  vacuous-wrapper problem returning by a different route.

---

## Tests

The plane spans the wall regardless of record count — assert at one record and at many, so a
test cannot pass because the records happen to fill it. That is the discriminating fixture:
with enough records the full-width plane and a content-sized one are the same observation.

Whatever distinguishes plane from wall needs an assertion that would fail if they became the
same colour. Both extremes of `spine_colour` are already known to matter elsewhere; if this
uses any derived colour, sweep rather than spot-check — unit 17 found that two endpoint
assertions can both pass while a band between them collapses.

---

## Screenshots

1. Five records at 1280 — the real collection.
2. Candidates for the empty portion, so the choice is visible.
3. A seeded 120 records, several rows deep.
4. One record, the degenerate case.
5. 390px.
6. A filtered wall.

---

## Report

1. **Does it read as a wall now?** Frames 1 and 3.
2. **Does five records read as a short collection rather than as broken?** That is what the
   floor was protecting and it now has to come from the shape instead.
3. **What did you choose for the empty portion, and what did the rejected candidates look
   like?**
4. **Does unit 21's geometry test still constrain anything?**
5. Anything that changed in table or grid, which should be nothing.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. **QA gate** — Adam judges the wall before the canvas goes over it. This is the
last CSS unit before three.js comes to `/`.
