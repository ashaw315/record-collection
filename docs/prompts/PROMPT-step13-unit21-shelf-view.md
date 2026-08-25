# Step 13 unit 21 — the shelf view owns the screen

Baseline `22d79a8`. This touches the real shelf and `/`, not `/plane`. No three.js — the
canvas overlay is the next unit and depends on this landing first.

Four things, and the third is the one that must not be skipped.

---

## 1. The controls move to an overlay

§10b as amended by A24a: below the nav there is the wall and nothing else. Search, the filter
chips and sort are reachable from the shelf but do not occupy vertical space above it.

**One control opens all of them.** Search, chips and sort in a single panel — they are one
logical group and fewer floating elements over the wall is the point. The view toggle stays
separate, as the reference does with its List/Closet switch.

**When a filter is applied and the panel is closed, the control must say so.** The gaps in
the wall are the primary feedback (A24d), but a wall with holes and no indication of why is
the absent-versus-unknown problem this project keeps catching: it cannot be distinguished
from a collection that is simply small. A count, a dot, an active state — whatever reads;
the requirement is that a closed panel never hides the fact that the wall is filtered.

**`?view=table` and `?view=grid` are untouched.** Their controls stay on the page, above the
rows. A list wants its controls visible, and §10's screens table now states this asymmetry
explicitly. **If you find yourself changing the table or grid layout, stop** — that is a
signal the overlay was built at the wrong level.

The URL state is shared across all three views and must stay shared: a filter applied on the
wall survives a switch to the table.

---

## 2. The minimum, re-derived by looking

A24c removed the 40% number deliberately and left the rule stated as a rule. Re-derive it.

**By rendering candidates against a viewport-owning wall at a real collection size and
looking** — not by arithmetic. This is the third time in this feature a number chosen by
reasoning has lost to one chosen by looking (1:12 over 1:40 on the spines; 1:25 over 1:40 on
the box thickness), and the second time this specific number has been wrong.

What the rule protects, from §10b: a short collection must read as short, not as broken. The
failure runs both ways — too little space is a thumbnail, too much implies records that
should have been there. Adam's real collection is five records; judge against that, and
against a seeded larger set, because they are different questions.

**It is possible the answer is that no minimum is needed** once the wall owns the screen and
carries its own shelf structure. Do not assume that; measure it. But do not preserve a
minimum out of deference to the old rule either — A24c says to re-derive, and re-deriving
includes the possibility that the answer is different in kind.

---

## 3. Replace the vacuous geometry test

This is not cleanup. `[data-testid="shelf"]` is an invisible wrapper, so asserting it spans
the viewport was true before unit 20, true after, and true of any block element in that
position. **The test currently reports coverage it does not have**, and it did so while
being the check that was supposed to catch exactly this defect.

The assertion must measure **the thing the user sees** — the timber, the element with a
background — not the wrapper around it. Both halves need to hold: that the wall spans the
viewport, and that it does so because of the layout rather than because block elements do
that anyway.

**Prove it bites in the direction that failed.** Removing the breakout moved `x` from 16 to
80, which is why the offset half seemed to work; that is not evidence about width. Mutate the
width property specifically and confirm the test fails.

The general check, from this project's own rules: *would this assertion produce a different
result if the property it names were wrong?*

---

## 4. Filtering leaves gaps — measure before building

A24d: a filtered wall keeps its shape and shows holes where the non-matching records were,
rather than repacking the survivors into a tight row.

**Establish which one the code already does before writing anything.** The shelf query returns
filtered rows and the layout flows them, so repacking is the likely current behaviour — but
that is a hypothesis. Filter to something that returns two of five records and look.

If it already leaves gaps, say so and move on. If it repacks, that is real work and it may be
larger than it looks, since the wall's layout is a wrapping flex row and gaps mean holding
positions for records that are not rendered.

---

## Tests

- The overlay: the panel opens and closes, the controls inside it work, and the closed state
  indicates an active filter. Assert what a user can see and reach — `toBeVisible`, not
  `toHaveClass`. Unit 20's first attempt had every breakout class present and correct and
  cancelled by a fourth declaration.
- Table and grid still carry their controls on the page. This is the regression the unit is
  most likely to cause.
- Shared URL state across views.
- The geometry test above, mutation-verified on the width.

The full shelf spec suite and the eight specs across five files that find records by role and
name on `/` all apply. A scoped run proves nothing here.

---

## Screenshots

1. `/` shelf view at 1280, real five-record collection, panel closed.
2. The same with the panel open.
3. Panel closed with a filter applied — does the control say so?
4. A filtered wall showing gaps (or repacked, if that is what it does — report what is there).
5. Each minimum candidate at five records, so the choice is visible.
6. A seeded 120-record collection, panel closed.
7. 390px, panel closed and open.
8. `?view=table` and `?view=grid`, unchanged.

---

## Report

1. **Does it read as a wall now?** Frames 1 and 6, your own reading.
2. **What minimum did you choose, what did the candidates look like, and is a minimum needed
   at all?**
3. **Does the closed control communicate an active filter?**
4. **Gaps or repacked** — what does the code do today?
5. **What does the new geometry test measure, and what mutation did you use to prove it
   bites?**
6. Anything that changed in table or grid, which should be nothing.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. **This is a QA gate** — Adam judges the wall before the canvas goes over it.
