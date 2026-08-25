# Step 13 unit 13 — the box, and the flip that falls out of it

Baseline `5763520`, after A18 has landed.

Unit 12's frame 6 was unambiguous: at 16° the sleeve's silhouette is a pale face abutting a
dark background, with no side face and no thickness anywhere. The rotation is convincing and
the object is not.

This unit gives the record real geometry — and the flip comes with it, for a reason worth
stating before the work starts.

---

## The flip is part of this unit, not a later one

§10b currently ships a **half turn**, and NOTES records the cost honestly: *"the new face
swings in rather than the old one turning away first. A true two-sided flip needs the
outgoing face alive to 90°, which is exactly the coordination that could not be made to
work."*

That was true of the structure it had. One face, whose contents were swapped, needing a flag
to say which contents were showing and a decision about when to change them. That flag is
what failed twice.

**A box has no such flag.** Front, back and edges all exist at once, in one element under
`preserve-3d`. Turning it 180° reveals the back because the back is already there and always
was — there is no swap, no midpoint, no state. The half-turn's cost and the box are the same
problem, and building the box while keeping `key={face}` would mean constructing the
structure that makes a true flip trivial and then not using it.

So: build the box, then let the flip be a rotation of it.

**If that turns out to be wrong** — if a genuine two-sided flip still fights something —
stop after one attempt and report. Do not reach for a flag, do not restore `key={face}`
alongside a box, and do not try a second shape. We know what that road looks like.

---

## Scope

**In scope:** the record as a box with front, back and visible edges; the flip as a rotation
of that box; whatever the tilt needs in order to compose with it.

**Out of scope:** the back face's *content* (it keeps rendering exactly what `back-face.ts`
produces today), the gatefold, touch, arrow navigation, the snippet. Do not add a renderer —
A18 settled that, and this unit is the evidence it named as capable of reopening the
question. If the box genuinely cannot be built in CSS, that is a finding worth more than a
working box, and it must be reported rather than routed around.

Units 10, 11 and 12 are all correct and are not touched. If the box forces a change to the
rise, the chrome or the tilt, stop and report rather than widening.

---

## Geometry

A 12″ sleeve is 314mm square and about 3–5mm thick, so the side is roughly 1:70 against the
face. The shelf resolved the analogous question by measurement and landed at 1:12, because
the arithmetic ratio was unreadable at a workable size — §10b now states the rule rather than
the number, in both directions.

**Expect the same tension here and resolve it the same way: by rendering it and looking.**
Too thin and the box is invisible at 16°, which is where this unit started. Too thick and it
is a DVD case rather than a record sleeve — which is exactly the failure QA already caught
once on the spines, and it would be worse here, since the reference *is* a DVD case and
mimicking it would be borrowing the wrong thing.

Render candidates at real size, crop to the edge, and pick by looking. State the ratio you
chose and what the rejected ones looked like.

The edges also need to be *lit* differently from the faces, or thickness will not read even
when it is geometrically present. A side face the same colour as the front is a silhouette
change and little else. What the shelf already knows applies: the spines are legible because
of lightness variation, not hue.

---

## The flip

Rotate the box 180° about its vertical axis. Both faces are present throughout, so:

- Nothing swaps, and no state records which face is showing. If a value is needed to say
  *which way the record is currently facing*, that is one boolean describing a fact, not a
  flag mediating an animation — and it must not have a duration attached to it, must not be
  read during the motion, and must not gate anything.
- **The back face must be mirrored**, or its content renders reversed. This is the standard
  trap for this technique.
- The tilt and the flip compose. Unit 12 already found that a running keyframe's `transform`
  beats an inline one and resolved it by nesting rather than arbitration — the same
  discipline applies: each rotation owns its own element.
- `prefers-reduced-motion` disables the flip's animation. The record still turns, instantly.

**What to check that a still frame cannot tell you:** capture the flip at roughly 25%, 50%
and 75%. At 50% the record should be edge-on — and if the box is real, you will see its
*edge*, which is the frame that proves the geometry rather than asserting it. A half turn
shows a face swinging in; a true turn shows the outgoing face receding to 90° and the
incoming one continuing past it.

---

## Tests

The geometry is the testable part: the box's face count, their transforms, and that the back
is mirrored. Name the source line each test would fail against.

The trap to construct deliberately, per this project's fixture rule: **a test that only ever
observes the record face-on cannot distinguish a box from a plane.** Both render identically
at 0°. Any assertion about geometry has to observe it at an angle, or it constrains nothing.

`e2e/shelf.spec.ts`'s flow 7 asserts that turning shows the other side. It should still pass
— the contract has not changed, only the mechanism. **If it fails, that is information about
the change, not a test to update.** Report it before touching it.

Prove the reduced-motion assertion bites by removing the rule, as units 11 and 12 both did.

---

## Screenshots

1. **Face-on, settled** — the baseline. Should be indistinguishable from today.
2. **Maximum tilt, crop to the receding edge** — the frame that motivated this unit. Compare
   directly against unit 12's frame 6 and say what changed.
3. **Flip at ~25%, ~50%, ~75%** — three frames. The 50% one is the proof.
4. **Flip settled, showing the back** — confirming the mirroring is right and the content
   reads correctly.
5. **Tilted while showing the back** — the two motions composed, which is where a
   transform-ordering mistake will show up.

State angles and ratios as numbers.

---

## Report

Beyond CLAUDE.md §10's checklist:

1. **Does it read as an object now?** Frame 2 against unit 12's frame 6, in your own words.
2. **What thickness ratio did you choose, and what did the rejected candidates look like?**
3. **Did the flip work as a rotation of the box, or did it fight something?** If it fought,
   what — and stop at one attempt.
4. **Is the half-turn cost gone?** NOTES records it as an honest limitation of the previous
   structure. Frame 3 answers this: is the outgoing face alive to 90°?
5. **Did anything want a flag, a coordinator, or a shared number?**

If 3 and 4 both come back clean, say so plainly — it means the one CSS deficiency this
feature had on record is closed, and NOTES' half-turn entry needs a correction rather than
standing as a live limitation.

Full E2E run, no file argument. Commit hash, and confirm `HEAD` moved.

Then stop. Touch, the gatefold, and the back face's content are separate units.
