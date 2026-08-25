# Step 13 unit 23 — the canvas comes to the wall

Baseline `ab77ec7`. This is the integration unit: five units of three.js work move from
`/plane` onto `/`, over the real shelf.

**The gap this closes, stated plainly.** Everything from unit 15 onward was built on a
scaffold. `/plane` uses placeholder spines and does not render `Shelf.tsx`, so nothing has yet
proven the rise's mapping against the real wall's layout, its scroll container, or its
wrapping rows. That is the kind of gap that hides defects until the moment of integration —
which is now.

---

## What lands

A transparent, full-bleed canvas over the wall, and the pulled record rendered into it: the
box, the four texture slots with their fallbacks, the tilt, and the rise from a real spine.
The panels come with it.

**What does not land yet:** the flip is still `key={face}`'s CSS turn if that is simpler to
keep working for one more unit — say which you chose and why. The gatefold hinge, touch, and
A24d's gaps are all out.

**The CSS implementation stays in the tree until the end.** If the overlay works, deleting
`PulledRecord.tsx`'s CSS path is the *last* thing in this unit, in its own commit, so the diff
is reviewable and revertible. If it does not work, nothing has been lost.

---

## The two things that will bite

**1. Pointer events.** A transparent canvas over the wall eats every spine click unless it is
`pointer-events: none` at rest and takes them only while a record is out. That is a state two
systems share — canvas interactivity and whether a record is pulled — and it is exactly the
smell this project keeps meeting. Design it rather than discovering it: one source of truth
for "is a record out", with the canvas deriving from it.

**Unit 21's finding applies directly here**: every measurement it took was correct and green
while the view toggle offered a one-way trip, because none of them asked *can a user still do
the thing*. The equivalent question here is **can a spine still be clicked, cmd-clicked and
found by role and name with the canvas present**. Eight specs across five files depend on
that contract; if they pass, that is necessary and not sufficient — check by hand too.

**2. The mapping against the real wall.** The rise maps a spine's rect to world coordinates.
Unit 19 proved that at `scrollY = 2928` against placeholder spines in a wrapping row. The real
wall differs in ways that matter:

- the wall is `calc(100svh - 205px)` with its own layout, not a strip;
- rows wrap and each row has a shelf line;
- the page scrolls, and the canvas may or may not scroll with it — establish which by
  measurement, and remember unit 18's lesson: **keep everything in one coordinate system
  rather than adding a correction term.**

**Verify numerically before judging visually.** The record must begin exactly where the spine
is — same position, same size. Unit 19's round-trip is the strongest check available: project
the computed world position back to screen coordinates and confirm it lands on the spine's
rect. A rise that starts 30px off looks fine in motion and is wrong.

Test it on a spine in the **second or third row**, not the first. A first-row spine at the
left is the case most likely to work by accident.

---

## What must not break

- **A spine is a link.** `getByRole('link', { name: title })`, cmd-click, middle-click.
- **The wall itself** — full-bleed, viewport-height, one shelf line per row, records standing
  on it. Unit 22's pixel-sampling instrument (`findShelfBands`) is the one that catches
  regressions here; a rect will not.
- **Filtering reaches the wall** (`dc6e04c`), and the seam test that pins spine count to the
  heading.
- **Table and grid**, untouched.

---

## Tests

The mapping is pure and already tested from unit 19 — the new surface is the integration:
that the canvas exists over the wall without intercepting spine clicks, and that a rise from a
real spine starts on that spine.

**The discriminating case is a spine that is not the first one.** A test that only ever pulls
the first record cannot distinguish a correct mapping from one that ignores position.

Assert the pointer-events contract in both states: at rest a click reaches the spine beneath;
with a record out, the canvas has the pointer.

`prefers-reduced-motion` — no rise, record appears in place. Prove it bites.

---

## Screenshots

1. The wall at 125 records, canvas present, nothing pulled — must be indistinguishable from
   today.
2. A rise from a third-row spine, at ~15%, ~50%, settled.
3. The same with the page scrolled.
4. The record tilted, over the wall.
5. The fallback record (no cover, no back) pulled.
6. 390px.

---

## Report

1. **Does the record now rise out of the wall** rather than into a box beside it? This is the
   thing that has never been seen.
2. **Does it start exactly on the spine?** Numerically, from a non-first-row spine.
3. **Can a spine still be clicked, cmd-clicked, and found by role and name?** Answer by hand
   as well as by test.
4. **What owns "is a record out", and what derives from it?**
5. Anything the DOM/canvas boundary did silently.

Full E2E, no file argument. This changes the screen eight specs depend on.

Commit hash, confirm `HEAD` moved. If the CSS path is deleted, that is a separate commit.

Then stop. **QA gate** — this is the first time the whole thing can be judged together.
