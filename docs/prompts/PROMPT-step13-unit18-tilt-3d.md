# Step 13 unit 18 — the tilt, in three.js

Baseline `41ae0e3`. Still `/plane`. Units 10–13 stay untouched.

Three QA decisions land here, and the tilt is what makes the first two judgeable.

---

## 1. Thickness goes to 1:25

Unit 16 chose 1:40 and reported it as chosen by looking — but it rejected 1:25 *on principle*,
as "DVD-case proportion, the reference's own and the wrong thing to borrow." Adam looked at
the three candidates and picked 1:25: at 1:40 and 1:70 the edge reads as a dark line on a
sheet, and only 1:25 reads as a surface of its own.

**The principle overrode the eye, and the eye is the instrument for this.** Same shape as the
spines, where 1:40 was arithmetic and 1:12 was what could actually be read. Record the
correction in NOTES — a candidate rejected by reasoning rather than by looking, inside a
comparison that existed to be looked at.

No spec amendment needed; §10b states no thickness number.

## 2. The rest state is face-on

**At rest the record faces you square on, at zero rotation.** Moving the pointer turns it;
leaving it alone leaves it turned, as before.

This matters more than it sounds. `/plane` has shown every record at a fixed three-quarter
angle, which flatters the geometry — a box at an angle is obviously a box, and face-on it is
indistinguishable from a plane. **So every "does it read as an object" judgement so far was
made under conditions that will not be the rest state.** The object-ness now has to arrive
from the motion rather than from the pose, which is the actual claim being tested.

## 3. The panels come in

Currently the facts panel, the record and the actions read as three separate columns with a
wide gap. Pull the panels in so they frame the object, and constrain the overall width so the
composition reads as one thing. Criterion's sit close enough to the case to belong to it.

---

## The tilt

**Reuse `tilt.ts` from unit 12.** It is a pure function — pointer position and rect in, two
angles out — with absolute mapping, clamping, and a round-trip test proving position-mapping
rather than delta-accumulation. None of that is renderer-specific. Writing a second one is
the shape NOTES records under `genreSubtree` and `hasGatefold`; this is the fourth chance
this session to reuse rather than reimplement, and the previous three all paid.

If it does not fit, say why rather than quietly forking it.

**Rotate the object, not the camera.** Simpler, and it matches what `tilt.ts` already
produces. If you find a reason to orbit the camera instead, that is a finding worth reporting
rather than a detail.

**Render on a dirty flag.** This is the instruction recorded in NOTES before any three.js work
began, and this is the unit it was written for:

```
onPointerMove  ->  dirty = true          (cheap, no render)
rAF loop       ->  if (dirty) { render(); dirty = false }
```

The reason it matters: **a still record costs nothing.** A throttled handler still fires and
still renders while the pointer rests, and resting is the common case on a screen where
someone is looking rather than moving. It also decouples input rate from frame rate — a
1000Hz mouse against a 60Hz display — which is the two-systems-sharing-a-number smell in a
new place.

**Range:** the same limited tilt, around 16°, never revealing the back. Verify it still reads
correctly under lighting; a rotation that looked right flat-lit may want a different range
now that the edge catches light.

**`prefers-reduced-motion`:** no tilt, record stays face-on, pointer does nothing. Prove the
assertion bites by removing the rule, as units 11, 12 and 13 all did.

---

## Tests

`tilt.ts`'s existing tests still cover the mapping. What is new and testable is the dirty-flag
loop: assert that a render happens after a pointer move and **does not** happen on an idle
frame. That second half is the whole point of the instruction and it is the half a naive test
omits.

Measuring "did not render" needs a settle window, or it cannot distinguish *did not happen*
from *has not happened yet* — NOTES records that trap from step 10 unit 4, where a zero
immediately after render passed against a mutation that moved the fetch into a mount effect.

---

## Screenshots

1. At rest, face-on. **This is the frame that re-answers the object question** — does a
   square-on record still read as an object, or as a plane?
2. Pointer left, pointer right, at maximum.
3. A corner, both axes.
4. The full composition with the tightened panels.
5. The fallback record (no cover, no back) at rest and tilted — the common case.

---

## Report

1. **Face-on, does it still read as an object?** Frame 1. Every previous answer was given at
   a three-quarter angle.
2. **Does the tilt make it an object even though the rest state is flat?** This is the claim
   the renderer was adopted for.
3. **1:25 under lighting** — does it hold at the new thickness, or does it now read heavy?
4. **Did `tilt.ts` fit?** If a second implementation appeared, say so plainly.
5. Anything WebGL did silently.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. The rise, the flip, the hinge and replacing the CSS implementation are separate.
