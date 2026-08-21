# A32 — §10b: the record's presentation is width-dependent, and the threshold is a measurement

Written before step 15 unit 5 (the desktop fork), and deliberately before any code — the
spec should describe the two shapes before the app implements them, which is the rule this
project has held to for thirty-one amendments.

**Why this amendment exists.** §10b describes the flanking panel as *the* layout for the
pulled record's facts. Step 15 unit 4 shipped the phone shape — a full-bleed record with a
summary card stacked beneath — because a square record between two panels at 390px crushes
the record to a stamp. So the app now has two presentations and the spec describes one. R7's
job includes "the spec against the app — which sections describe something that no longer
exists, or that exists differently"; without this, R7 finds exactly that mismatch and cannot
tell a drift from a decision.

**The measurement, not asserted.** Rendered at 1280px, a full-bleed square record clamps to
the frame's *height* (a landscape frame is wider than tall) and sits at 51% of the width in a
dark field with empty margins either side — a small square marooned. The flanking panel is
what has room there. Below the threshold the opposite holds. Two amounts of room want two
shapes; it is not a summary being worse than a panel.

**The threshold is derived, not inherited from Tailwind.** §10b flanks with two panels
(facts ≈210px, controls ≈180px) and a record reads as an object down to ≈320px (its phone
size, already judged acceptable). With two gaps and page margins:

    210 + 24 + 320 + 24 + 180 + 48 ≈ 806px

Rounded up to **820px** for breathing room. That is between `md` (768) and `lg` (1024) and
coincides with neither — at 768 the flanked record would be ≈282px, below the readable floor;
at 1024 there is comfortable room. So it is used as the measured value it is. The question was
never "phone or desktop" but "is there room for a panel beside a record that still reads as an
object", and that is arithmetic this unit could do.

---

## A32 — §10b: two presentations, one threshold, one destination

**§10b currently says** (the paragraph beginning "The facts live in fixed panels beside the
record") that the facts sit in panels beside the record, full stop — one layout.

**REPLACE that paragraph's opening** so the section states, before it describes the flanking
layout in detail, that:

1. **The presentation depends on available width.** Above the A32 threshold, the facts sit in
   fixed panels *beside* the record — the layout the rest of §10b describes. Below it, the
   record fills the frame and the facts move to a **summary card stacked beneath**: artist,
   title, release year, and a tap to `/records/:id` for the rest.

2. **The threshold is a measurement (≈820px), not a screen-size label.** Stated as the derived
   value with its derivation, noting it coincides with no Tailwind breakpoint and is used as
   the measured figure rather than rounded to one that means something else.

3. **The stacked summary is a different shape, not a smaller panel.** The flanking panel
   carries every fact; the summary carries three and delegates the rest, because a full fact
   list stacked under a full-bleed record is the "form" failure §10b already rejected for the
   back face, on a new surface. The summary's constant height is what lets the record's size
   above it be chosen rather than guessed.

4. **Both shapes reach the same place for the rest.** The stacked summary's tap and the
   flanking panel both go to `/records/:id`, which is also where §10b's keyboard list links
   every record — one destination, three routes, so they cannot drift into describing
   different facts.

**What does NOT change.** Everything else in §10b is width-independent: the faces, the turn,
the tilt, the hinge, the plain-sleeve back, reduced motion, and the accessible list. Only
*where the facts sit* forks, and only the flanking panel's "this is the layout" framing is
amended — the flanking layout's own description (DOM not canvas, static while it turns, the
full field list) stands as the wide-screen shape.

**The edit is in place, not a new subsection**, because the flanking layout's detailed
description below the amended paragraph remains correct for the width where it applies. A
separate "desktop layout" subsection would duplicate it and invite the two to drift — the
same reason A6/A7/A9 moved rules into the sections that use them rather than leaving parallel
copies.
