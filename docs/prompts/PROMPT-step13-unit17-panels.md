# Step 13 unit 17 — the panels, and the fallback edge

Baseline `8cf23c4`. Still `/plane`, still no motion.

This is the unit that makes the composition judgeable. The record has artwork and geometry;
it does not yet have the thing that justified moving it to a renderer at all — the facts
living beside it rather than on it (A19c, A19e). Until they exist, the object is being looked
at in isolation, and the CSS version already showed how misleading that is.

**No motion.** No rise, no tilt, no flip, no hinge. The box stays at its fixed angle. The
next unit adds motion, and it will be judged against the composition this one settles.

Units 10–13 stay untouched.

---

## Part 1 — the panels

**Two panels flanking the record, fixed**, as the reference does (images 3 and 4 of
thecriterioncloset.com). They are DOM, not canvas, per A19e — which is not a stylistic
choice: a canvas has no text, so the panel is the only channel a screen reader or a test can
read.

**Left: the facts.** Artist, title, year, label, catalogue number, pressing details,
condition, purchase information. `back-face.ts` already produces exactly this set as a pure
function — it should be reused rather than reimplemented, and if its shape does not fit a
panel, reshape it rather than writing a second producer. Two producers of the same facts is
the shape NOTES records under `genreSubtree` and again under `hasGatefold`.

**Right: the actions.** "Turn over", "Full details", "Put back". These currently float at the
bottom-left of the CSS version, detached from the object, which was one of the specific
complaints when it was looked at. A panel gives them somewhere to belong.

**They are static.** They do not track the record's geometry, do not move when it does, and
never need to agree with the camera about anything. That is the property that makes them
cheap and it is why the reference does it this way.

**Absence is ordinary.** Most records have no purchase price, no store, no condition, no
pressing. A panel of mostly-empty labelled rows is the "form" failure that made the old back
face read badly — omit what is absent rather than rendering a label with nothing beside it.
The one exception worth stating: absence that means something (§10a's distinction between
"none recorded" and "we do not know") is already handled elsewhere and is not this unit's
problem.

---

## Part 2 — the fallback edge

Unit 16 found it and it is a real defect, not a nuance:

> At the fixed angle the fallback back's edge is markedly less visible than on a photographed
> record, because there's no artwork to contrast against. It reads less as a box than the
> textured ones.

**This is the face every record you own shows today** — production has three covers and zero
backs — so the object reads least like an object in the common case. It is the same shape as
the original QA complaint one layer down: an untextured surface gives light nothing to
reveal.

The fix is contrast between the edge and the face when both are the same flat colour. A
darker or lighter edge derived from `spine_colour` rather than being it, so the two separate
tonally even with no artwork. `spine.ts` already has `textColourOn` for a related problem —
check whether it or its reasoning applies before writing something new.

**Judge it against a photographed record side by side.** The question is not "is the edge
visible" but "does the plain sleeve read as much like an object as the textured one does".

---

## Tests

Panel content is a pure function and should be tested as one: a record with everything, a
record with only the required fields, and a record with no pressing at all. Name the line
each test would fail against.

**The discriminating fixture is the record with nothing optional set** — that is the common
case in production, and a fixture where every field is populated cannot tell "omits absent
fields" from "renders every field it is given".

The edge colour is arithmetic: assert it differs from the face colour by a measurable amount
across the range of possible spine colours, including the extremes (near-black Grave New
World at 18% lightness, near-white Dire Straits at 78%). A rule that separates them at
mid-lightness and collapses at the ends is the defect this is fixing, in a new place.

---

## Screenshots

1. The full composition — panels and record — with a photographed cover.
2. The same with a record that has no cover and no back, so both faces are fallbacks.
3. 1 and 2 side by side, cropped to the edge, answering whether the plain sleeve now reads as
   an object.
4. A record with almost nothing set, showing the panel is not a field of empty labels.

---

## Report

1. **Does the composition work?** Object plus panels, as a whole. This is the first time it
   can be judged the way it will actually be seen.
2. **Does the fallback edge now read as an object?** Frame 3, against the photographed one.
3. **Did `back-face.ts` fit, or did it need reshaping?** If a second producer appeared, say
   so plainly — that is a finding, not a detail.
4. Anything WebGL or the DOM/canvas boundary did silently.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. **This is a QA gate**: Adam looks at the composition before any motion is built on
top of it, because judging motion against an unfinished composition is what made the CSS
version hard to read.
