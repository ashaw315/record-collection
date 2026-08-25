# Step 13 unit 12 — the tilt, in CSS

`4ac9e71` is the baseline.

This is the second half of the renderer question. Unit 10 settled the rise: CSS won, and
§10b line 870's justification did not survive contact with it. The turn is the part that
justification was actually about, and it has never been attempted in the shape now agreed.

**Do not add `three`, `@react-three/fiber`, or any renderer in this unit.** If you conclude
partway through that the tilt cannot be done in CSS, stop and report that with what you
observed. That conclusion is this unit's most valuable possible output and it must not be
pre-empted by starting the alternative.

---

## What the design is now, and how it differs from what failed

The reference (thecriterioncloset.com) does **not** flip. Its case turns roughly 15–20° off
face-on — enough to show it has thickness, never enough to reveal a back. Its own copy says:
*"Move the mouse to turn it · click to put it back."* §10b's front-to-back rotation is this
project's own design, not something borrowed.

The agreed design splits the two apart:

- **The tilt is continuous, pointer-driven, and limited in range.** It never reveals the
  back.
- **The flip is a separate, deliberate click.** It stays exactly as it is today —
  `key={face}` plus a keyframe, which already works.

**Why this is not a third attempt at what failed twice.** Both prior failures were a
*discrete face swap* fighting an animation: a `flipping` boolean whose return snapped
because `shown` and the flag updated in the same commit; then two legs across two effects
cancelling their own pending work, with `FLIP_MS / 2` living in both a stylesheet and a
`setTimeout`.

A pointer-driven tilt has **no second state**. Pointer moves, a value updates, the
compositor renders. Nothing is ever halfway between two things, because there is only one
thing. That is a different shape, not a better-written version of the same one — and unit
11 has just demonstrated the same principle working, by removing the entry state rather
than managing it.

If this unit finds itself holding a flag that says which phase the tilt is in, that is the
signal the shape came back. Stop at one attempt.

---

## The perspective handoff — deal with this first

Unit 11 recorded it: the sleeve renders with a visible perspective skew in mid-flight,
clearest at 15%, where it reads as a slightly rotated panel. It comes from the pre-existing
`perspective: 1400px` wrapper the turn uses, not from anything unit 10 or 11 added.

**So the rest state is already distorted before any rotation is applied**, and whatever the
pointer drives has to compose with that. Resolve it before building the tilt, or you will be
tuning a rotation against a baseline that is itself wrong — and you will not be able to tell
which of the two you are looking at.

Establish by measurement, not by reading the CSS:

- With no rotation applied and the record settled, is the sleeve rendering as a true
  rectangle? Screenshot and check the edges, do not infer it from the transform string.
- If it is skewed at rest, why — is the perspective origin off-centre, is the wrapper
  sized differently from the sleeve, is a transform being inherited?
- Does the skew change during the rise, and if so is that correct? A record moving through
  a perspective space *should* foreshorten as it travels; a record sitting still at the
  centre should not.

Report what you find before building on it. If the rest state needs fixing, that fix is in
scope for this unit — it is a precondition, not scope creep.

---

## The tilt

**Range.** Limited. Enough to show the record is an object with thickness and to catch light
across its face; never enough to reveal the back. The reference sits around 15–20° and that
is the starting point, not a mandate — pick it by rendering it and looking, the way 1:12 and
the 40% shelf minimum were picked. Both failure directions are real: too little and it is a
dead panel, too much and the flip becomes redundant and the back edge appears.

**Input mapping.** The rotation tracks pointer *position* over the record, not accumulated
movement — an absolute mapping, so the same pointer position always gives the same angle.
Two axes: horizontal pointer position drives Y rotation, vertical drives X.

**On leaving or resting: it holds its last angle.** No spring back, no idle animation. This
follows the reference's copy and it is what makes it read as an object you have turned
rather than a control that resets itself. It also means a still record costs nothing, which
is the reasoning already recorded for the dirty-flag approach.

**Render on change, not on every event.** The recorded instruction was written for a
renderer, and its reasoning transfers exactly: a throttled handler still fires and still
does work while the pointer rests. In CSS the equivalent is to write the angle to a custom
property and let the compositor own it — no React state per pointer move, no re-render per
event. If a `useState` is updating on `pointermove`, that is the wrong shape: 1000Hz input
against a 60Hz display is the two-systems-share-a-number smell in a new place.

**No transition on the tilt itself.** It tracks input; a transition would make it lag the
pointer, which is the difference between an object and a control. The flip keeps its
keyframe. If you find yourself wanting an easing on the tilt to smooth jitter, report that
rather than adding it — it means the input mapping is wrong.

**`prefers-reduced-motion` disables it.** The record sits face-on and does not respond to
the pointer. §10b's rule, and the branch no screenshot will show you.

---

## Scope

**In scope:** the tilt, and the perspective rest state it composes with.

**Out of scope:** the flip's behaviour, the gatefold, the back face's content, the snippet,
arrow navigation, touch. Touch is its own unit — a drag is a different input model and
mixing it in doubles what a failure could mean.

Unit 10's FLIP and unit 11's chrome are both correct and are not touched. If the tilt forces
a change to either, stop and report rather than widening.

---

## Tests

The pure part is the input mapping: pointer position and element rect in, angles out.
Extract it and test it directly, naming the source line each test would fail against.

- Centre of the record produces zero rotation on both axes.
- Left and right edges produce opposite-signed Y rotation of equal magnitude; same for
  top/bottom on X.
- The maximum is actually clamped — a pointer well outside the rect does not produce an
  angle beyond the limit.
- The mapping is absolute: the same position produces the same angle regardless of what
  came before. **This is the one that matters** — it is what distinguishes position-mapping
  from delta-accumulation, and a fixture where they agree cannot tell them apart. Construct
  a case where they diverge.

That last point is this project's fixture rule, and it will bite here: a test that moves the
pointer once cannot distinguish the two mappings. Move it, move it back, and assert the
angle returned to its original value.

Assert reduced motion, and prove the assertion bites by temporarily removing the rule — the
same check unit 11 ran, which is the reason its reduced-motion test is trustworthy.

---

## Screenshots

Wide, crop, and mid-motion all apply, but the mid-motion one is different here: the tilt has
no midpoint because it has no end state. Capture it at several pointer positions instead.

At 1280, on the real shelf, with a record pulled:

1. **Pointer at rest state / centre** — the record face-on. This is the frame that answers
   the perspective question.
2. **Pointer near the left edge** — maximum Y rotation one way.
3. **Pointer near the right edge** — the other way. State the angle for both.
4. **Pointer at a corner** — both axes at once, which is where a naive mapping looks wrong.
5. **Pointer moved away, then the record left alone** — confirming it holds rather than
   springing back.
6. **A crop of the record's edge at maximum tilt** — does it read as an object with
   thickness, or as a rotated rectangle with no depth? This is the frame that decides
   whether the box geometry is needed.

State angles as numbers. Unit 10 and 11's numbers are what made their defects legible.

---

## Report

Beyond CLAUDE.md §10's checklist, answer these. They decide the renderer:

1. **Does it read as an object being turned, or as an image being skewed?** Your honest
   reading of frames 2, 3, 4 and 6.
2. **Did anything want a coordinator, a flag, or a shared number?** If yes, what and why.
3. **Where did CSS strain?** Name the mechanism, not the feeling. If it did not strain, say
   that plainly.
4. **What would `three.js` concretely make better here** — not in general, for this tilt,
   on a record whose position is set by CSS layout? Note what unit 10 found: the DOM rect
   to world coordinate mapping is itself a two-systems-share-a-number problem, and it does
   not go away for the tilt.
5. **Does the record need real box geometry** — a visible spine edge and side face, as the
   reference has — or does the flat sleeve read as an object at this range? Answer from
   frame 6.

Full E2E run, no file argument. Both previous units caught something that way that a scoped
run did not.

Commit hash, and confirm `HEAD` moved.

Then stop. Touch, the box, and the renderer decision are all separate.
