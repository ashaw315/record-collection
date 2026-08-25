# Step 13 — the room has a size

Baseline `4118d6d`. This touches `/`, which is now the WebGL wall. `Shelf.tsx` stays in the
tree so the swap remains one revert.

Three things, from QA.

---

## 1. The wall is always at least four shelves deep

**The finding.** Filtering to 26 records collapsed the wall to a single row — the room
shrinking to its contents. That is the same failure as every rejected minimum-width candidate
in units 20–22, arriving vertically instead of horizontally, and Adam's answer settles both:

> **The wall is at least four shelves deep, and grows beyond that with the collection.**

A shelf is furniture and a room has a size. Four rows of empty shelf below a filtered result
says *these are the ones that matched*; one row that shrink-wraps the result says *this is
the whole collection*, which is false.

**Four shelves' worth of room, scrolling if the viewport is shorter.** Spine height stays at
the value already chosen by looking — the room does not shrink to fit the window, any more
than a bookcase does. At 240px spines four rows is roughly 1000px, which will exceed a laptop
viewport once nav and controls are accounted for, and that is correct: you scroll.

**This also answers A24d.** The gaps rule wanted a filtered wall to keep its shape rather
than repack, and holding positions for unrendered records is a hard mechanism. Empty shelf
below the results achieves the same honesty far more simply: the room stays the size of the
room. Record in NOTES that A24d is satisfied by this rather than by position-holding, and
say so in §10b — I will write the amendment once it is built and looked at.

**The empty shelves are shelves, not void.** Unit 22 settled what an empty stretch reads as
horizontally — plane, lip, wall behind — and the same treatment applies to a row with nothing
on it. A row of nothing should read as shelf with nothing on it.

---

## 2. Spines are clipped at the left edge

Seen in two screenshots, filtered and unfiltered: the leftmost spines are cut mid-word —
"rannigan", "old Harbour", "orvid Murder", "he Blackwater Band". The wall extends past the
left of the frame.

**Diagnose before fixing.** Candidates worth measuring rather than guessing: the camera
framing the wall's centre while the wall is wider than the frustum at that viewport; a layout
that starts spines at x=0 with no margin; or the canvas being wider than its container. The
right edge should be checked at the same time — earlier screenshots showed spines running off
there too, and if only one side clips that is a different cause from both sides clipping.

A real shelf has ends. Whatever the cause, the wall should have a margin at both sides rather
than bleeding off the frame.

---

## 3. The return's timing

QA reports the return looks fast and possibly drops frames. **Measure before tuning** — those
are different problems and fixing the wrong one would look like it worked.

The rise had a 45ms first-draw stall that put its first visible frame at 51% progress, fixed
with a warm-up frame. The return may have its own version: the mesh has been drawn, but the
return begins after `returningId` is set and React has committed, which is its own gap.

Report frame count, per-frame progress, and the gap between the first and second frames — the
instrument that answered this for the rise is the in-page frame log, not screenshots, which
cost ~100ms per sample and never saw the first half.

**Then decide duration separately**, by looking, once the frames are honest.

---

## What must not change

- The record comes out of an emptied slot, occluding the wall, and returns to it. Scrolling
  first still lands it centred in the viewport — verified by QA and easy to break.
- Square on at the wall, ~16° FOV, edge spines within 1% of centre.
- Filtering reaches the wall; the seam test pins the record count to the heading.
- The accessible list: every record, full untruncated titles, reachable by keyboard, Enter
  opens the record's detail page. **That destination is deliberate** — the detail page is a
  better keyboard experience than a canvas, and it is the same destination the spine's `href`
  always had. Do not "fix" it to pull the record into the scene.
- Draws settle when idle; nothing rebuilt per pull.

---

## Tests

**The four-shelf minimum needs a fixture that can distinguish it.** A collection that already
fills four rows cannot tell a minimum from its absence — the discriminating case is a
collection of one or two rows, and the assertion is on the wall's height or row count, not on
the record count. This is the same shape as unit 22's plane, which had to be asserted at one
record and at many, and unit A's centring, which needed three rows rather than one.

For the clipping: assert the leftmost spine is fully within the frame. Whatever measurement
you use must be able to fail — unit 22's finding was that a background has no box, and a
canvas has the same property, so if pixels must be checked, decode the screenshot.

---

## Screenshots

1. Five records — four shelves of room, records on the first.
2. 26 records filtered — same room, one row occupied.
3. 125 records — three rows plus the room's minimum, or more.
4. Both edges of the wall, cropped, showing no clipping.
5. The return at ~20% and ~50%.

---

## Report

1. **Does a filtered wall now read as "these matched" rather than "this is all there is"?**
2. **What caused the clipping**, and was it the same on both edges?
3. **Return: frames, first-frame gap, and what you changed** — timing, duration, or both.
4. Anything that changed for a full collection, which should be nothing.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. Hover is the next unit; the panels, tilt, flip, scrim and Escape are the one after.
