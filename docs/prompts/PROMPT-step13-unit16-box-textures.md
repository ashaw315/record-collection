# Step 13 unit 16 — the box, and all four texture slots

Runs after A22. Baseline is unit 15's commit.

Unit 15 put one textured plane on `/plane`. This unit makes it an object: a box with the
four slots mapped onto it, the fallbacks that apply when a slot is empty, and the both-leaves
rule for the gatefold.

**Still no motion.** No rise, no tilt, no flip, no hinge animation. The box sits at a fixed
angle that shows a face and an edge at once, because a box viewed face-on is indistinguishable
from a plane and this unit's whole claim is that it is not one.

The CSS implementation from units 10–13 stays untouched and keeps working. `/plane` remains
the only way to reach any of this.

---

## What it renders

**The box.** Front, back, four edges. The thickness question was settled in CSS at 1:40 —
but that was derived from arithmetic rather than chosen by looking, and it is the one number
in this feature never validated by eye. Under real lighting it may read differently. Render
it at 1:40 and at least one candidate either side, crop the edge, and pick by looking. Say
what you chose and what the rejected ones looked like.

**The four slots** (§4.2, §10b as amended): `cover` front, `back` back, `gatefold_left` and
`gatefold_right` across the two leaves. Nothing else is mapped — `label`, `matrix` and `other`
are gallery images and never skins.

**The fallbacks, which are the common case rather than the edge case.** Production has three
`cover` rows, zero `back`, zero inners. So:

- No `cover` → plain sleeve in `records.spine_colour`.
- No `back` → plain sleeve in `records.spine_colour`, with label and catalogue number as a
  small imprint and nothing else.
- Not both leaves → no gatefold at all (A21c). One leaf is stored, appears in the gallery,
  and does not open the sleeve.

**Every record you can currently test will hit the back fallback.** Treat it as the primary
path, not as a degraded one — it is what the object looks like today and for a long time.

**Non-square images are cropped centrally at mapping time** (A22), via UV adjustment rather
than by touching stored bytes.

---

## What unit 15 learned, which this unit inherits

**In-page pixel measurement is impossible.** A blob-hosted texture taints the canvas, so
`getImageData` throws `SecurityError`, and `drawImage` from a WebGL canvas without
`preserveDrawingBuffer` returns an empty buffer that produced a *plausible* ratio of 1.0000
from `-1e9 / -1e9`. A believable number from a failed measurement is the worst shape this
project keeps meeting. **Measure from screenshots**, which sit outside the security model and
after compositing.

**r185 is far past the note's boundary.** `sRGBEncoding` is gone rather than deprecated, so
there is no wrong-but-working path. Check any API you reach for against the installed build.

**Lighting is why this renderer was adopted.** A19c's argument was a face that shades as it
turns and an edge that catches. A box lit flatly is a box-shaped plane, so some light is in
scope here — enough that the edge reads as a different surface from the face. Do not build a
lighting rig; one light and whatever ambient is needed to keep the artwork legible.

---

## Tests

Pure and testable: which slot maps to which face, and what the fallback resolves to for a
given record. Extract and test directly, naming the line each would fail against.

**The discriminating fixture is the half-photographed gatefold** — one leaf present, one
absent. Unit 14 noted the old single-value enum could not even express that case. It can
now, and it is exactly what A21c exists to prevent, so it must be in the fixtures. A test
whose records all have both leaves or neither cannot tell the both-leaves rule from a
one-leaf rule.

Also test: no cover, no back, non-square input, and a record with everything.

---

## Screenshots

1. The box at the fixed angle, front visible with an edge.
2. Crop of the edge at each thickness candidate.
3. A record with a cover and no back, turned to show the fallback back — the common case.
4. A record with both leaves, gatefold open, showing the seam between the two photographs.
5. A record with one leaf, confirming no gatefold appears.
6. A non-square cover, showing the crop rather than a stretch.

For 4 and 5 you will need to seed the images; production has none.

---

## Report

1. **Does it read as an object now?** Frame 1 against unit 12's flat-lit CSS version.
2. **What thickness did you choose, and what did the rejected candidates look like?**
3. **How bad is the gatefold seam** (frame 4)? A21b accepted it as a known cost — is it
   worse than expected?
4. **Does the fallback back read as a plain sleeve or as a missing texture?** This is the
   face every record will show, so it matters more than the photographed case.
5. Anything WebGL did silently.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. The panels, the motion, and replacing the CSS implementation are separate units.
