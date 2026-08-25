# Step 13 unit 20 — the wall claims the screen

Baseline `324d12f`. **This unit touches the real shelf**, not `/plane` — the first time
since unit 13 that units 10–13's code is in scope.

No canvas, no three.js, no rise. CSS only. The renderer work stays where it is.

---

## Why

QA against the reference settled two things.

**The record does not read as rising out of a slot**, and the cause is structural rather than
a tuning problem: the canvas is a separate box below the spine strip, so the record travels
from one container into another. The mapping is correct — `scaleX = 11/420` exactly, verified
at `scrollY = 2928` — it maps to the right place, and the right place is in the wrong
container.

**The reference's wall fills the window.** Criterion's spines dominate the frame, which is
what makes a case emerging from them read as emerging from *something*. Its "List View /
Closet View" toggle is exactly the `?view=` structure this app already has; the shelf simply
is not claiming the space.

So the shelf becomes the closet view: full-bleed below the nav, spines tall enough to read as
a wall. The canvas overlay is unit 21 and is deliberately not in this one — if the wall does
not read as a wall, an overlay is solving the wrong problem, and a layout change plus a
transparent canvas plus a re-derived mapping produce the same symptom when they fail.

---

## What changes

**`?view=shelf` fills the viewport below the nav.** Table and grid are unaffected and keep
their current layout — this is the closet view, not a change to how the collection is read as
a list.

**Spines get taller.** `SPINE_HEIGHT` is currently 160. In the reference the spines dominate;
here they sit in a short strip. Raising it changes things that are derived from it, and that
is the point of them being derived:

- `SPINE_ROW_HEIGHT` = `SPINE_HEIGHT + SHELF_EDGE`, already derived.
- `SPINE_TEXT_BUDGET` = `Math.floor(SPINE_HEIGHT / 5.4)`, already derived — so a taller spine
  holds more characters and the truncation tests will move. **That is the derivation working.**
  Do not pin the budget back to its old value; update what the tests expect and say what
  changed.
- The 1:12 width ratio (§10b) is a rule, not a number — a taller spine is proportionally
  wider. Check that the wall does not become a wall of planks.

**Pick the height by looking.** Render candidates at real size against the real collection and
choose. This is the same instrument that settled 1:12, the 40% minimum and 1:25, and it is the
only one that answers "does this read as a wall".

**The page scrolls; the wall does not scroll internally.** Decided deliberately: page-scroll
is the arrangement unit 19's mapping is already proven correct against, and unit 21 has enough
new surface without a new scroll container. The reference's fixed room is closer to the ideal
and is a later decision.

---

## What must not break

§10b's rules that already have tests, and which a layout change is exactly the thing that
breaks:

- **A shelf is no wider than it needs and no shorter than a shelf** — the `min-width: 40%`
  floor and the `w-fit max-w-full` ceiling, both mutation-tested (unit 9). Full-bleed changes
  what "the content column" means. State what the floor is measured against now.
- **No section headings, no per-genre band.** Adjacency does the grouping.
- **Determinism** — the same collection always produces the same wall.
- **A spine is a link.** Cmd-click opens the record; the accessible name carries the
  untruncated title. Eight specs across five files find records by role and name, and the
  spine broke all of them once already.

---

## Tests

The existing shelf specs cover most of this and several will legitimately need updating —
notably the text budget and any width assertion measured against the old container. **Update
them with the reason, do not relax them.** Anything asserting a number that is now derived
differently should assert the derivation.

Add one for the new property: at `?view=shelf` the wall occupies the viewport below the nav.
Assert what a user can see rather than a class name — `toBeVisible` and measured geometry, not
`toHaveClass`.

---

## Screenshots

1. The wall full-bleed at 1280, real collection.
2. Each spine-height candidate, cropped at real size, so the choice is visible.
3. A crop of spine text at the chosen height — is it still legible, and does the longer budget
   help or just fill?
4. The wall at 390px. §10 makes mobile an equal priority and a full-bleed wall is a different
   proposition on a phone.
5. `?view=table` and `?view=grid`, confirming they are untouched.

---

## Report

1. **Does it read as a wall now?** Frame 1, your own reading.
2. **What height did you choose and what did the rejected candidates look like?**
3. **What moved because it was derived from `SPINE_HEIGHT`?** This is the derivation earning
   its place — say what changed without being edited.
4. **What did the 40% floor become measured against?**
5. **At 390px, is a full-bleed wall right, or does it need its own answer?** Record the answer;
   do not solve it here — step 15 owns mobile.

Full E2E, no file argument. This unit changes a screen that eight specs across five files
depend on, so a scoped run proves nothing.

Commit hash, confirm `HEAD` moved.

Then stop. **This is a QA gate** — Adam judges whether it reads as a wall before the canvas
goes over it.
