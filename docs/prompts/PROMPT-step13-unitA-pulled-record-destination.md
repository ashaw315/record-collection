# Step 13 — the pulled record's destination

Baseline `308d787`. At `/plane`. `/` untouched.

---

## The symptoms

QA at 125 records shows three things wrong with a record that has been pulled:

1. **It is not centred.** The empty slot is roughly two-thirds across the wall; the record
   sits well left of centre, over the middle of the second row. It is neither at its slot nor
   anywhere anyone chose.
2. **It renders as a flat dark green rectangle** — no cover, no edges, no lighting. The wall
   around it is lit correctly.
3. **The spines around the empty slot splay outward**, leaning away from the gap rather than
   standing straight.

**My hypothesis is that these share one cause, and it must be checked rather than assumed.**
The rise translates the record forward along Z by a proportion of the camera distance. The
camera frames the whole wall, so at 125 records it stands thousands of units back; the record
comes forward a fraction of that and lands wherever perspective puts it. Very near the lens
it would fill the frame flat, and convergence near the centre of view would exaggerate the
lean of nearby spines.

**Measure before fixing.** Report the record's final world position, its screen position and
size, its distance from the camera, and what the green surface actually is — front face, back
face, or an edge. If the three symptoms turn out to have different causes, say so; a shared
explanation that fits is a hypothesis, not a diagnosis, and this project has adopted a fix for
the wrong reason before.

---

## The fix, if the hypothesis holds

**The rise has no destination, and it needs one.** §10b: *it was on the shelf a moment ago and
now it is in your hands.* Unit 19's CSS version interpolated from the spine's rect to an
explicit settled rect. The scene version only knows "forward by a proportion," so the endpoint
is an accident of the camera rather than a pose.

Interpolate from the slot to **an explicit target pose in front of the camera**: centred in
view, at a size where the cover is readable, face-on, lit by the scene's light. The record
should arrive at the same apparent size whether the collection is five records or five
hundred — the camera distance changes with the wall, and the destination must not.

`risePose` already owns the physical description of the motion. This is a change to where it
ends, not to what it does on the way — the quarter turn from edge-on to face-on and the
forward travel both stay.

**What the record shows when it arrives** is the box built in units 16–18: cover on the front,
the plain-sleeve fallback in `spine_colour` where there is no cover, the visible edge at 1:25.
If that box is not what is being drawn, find out why before adjusting materials.

---

## What must not change

- The slot empties, the record occludes the wall behind it, one light falls on both. That is
  the finding this whole rewrite was for.
- Square on at the wall, ~16° FOV, edge spines within 1% of centre (A24b, the long-lens
  measurement).
- The wall itself — colour, shelves, layout, legibility. If the fix changes how the wall
  looks, that is a regression.
- Draws settle when idle; nothing rebuilt per pull.

---

## Out of scope

The return, hover, the panels, the tilt, the flip, the gatefold. All are queued as their own
units. **The record vanishing on dismiss is known and is the next unit** — do not build the
return here.

---

## Tests

The destination is arithmetic and belongs in a pure function: camera, viewport and slot in,
target pose out. Test directly.

**The discriminating fixture is collection size.** A record's settled screen size must be the
same at 5 records and at 125 — those are the two cases where a camera-relative destination and
an absolute one diverge, and a test at one collection size cannot tell them apart. This is the
same shape as unit 22's plane, which had to be asserted at one record and at many.

Assert the settled pose is centred in view, not merely "somewhere forward".

Whatever the green surface turns out to be, add the assertion that would have caught it.

---

## Screenshots

1. Settled, at 125 records — centred, cover visible, lit.
2. Settled, at 5 records — same apparent size.
3. Mid-rise at ~15%, ~35%, ~50%, ~75%, with the empty slot visible.
4. A crop of the spines adjacent to the gap, showing whether the splay is resolved.
5. A record with no cover, settled — the plain-sleeve fallback.

---

## Report

1. **Did the three symptoms share one cause?** Answer from measurement.
2. **Where does the record land now**, and is it the same apparent size at 5 and 125 records?
3. **What was the green surface?**
4. **Did the splay resolve, or is it separate?**
5. Anything WebGL did silently.

Full E2E, no file argument — `/` is untouched, so it must stay green.

Commit hash, confirm `HEAD` moved.
