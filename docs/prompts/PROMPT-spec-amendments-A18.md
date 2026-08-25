# SPEC.md amendment A18 — the pulled record stays in CSS

Follow-up to `057d80b`. Anchors extracted by execution from SPEC.md at that commit.

Same rules: **exact anchors, no fuzzy matching, nothing outside the blocks, `SPEC.md`
only.** If an anchor does not match, stop that amendment and quote it.

---

## Why

§10b line 870 commits the pulled record to `three.js`. That decision was made on the
evidence of two failed CSS flip attempts, and it has now been contradicted by three units
of measurement:

- **Unit 10 (`e49c81f`), the rise.** Built in CSS with the FLIP pattern. Two defects found,
  neither attributable to the medium — a `useLayoutEffect` double-run measuring an already
  transformed element, and `transitionend` failing to fire when dismissal beat the rise's
  first frame. CSS itself never strained: one class, one duration, one easing, the
  compositor animating `transform` only.
- **Unit 11 (`4ac9e71`), the chrome.** `@starting-style` removed the entry state a
  coordinator would have had to manage, so no coordinator was wanted. Two stages instead of
  three.
- **Unit 12 (`5763520`), the tilt.** Limited-range pointer-driven rotation, absolute
  position mapping, holding its angle at rest. No second state, no shared number, no
  duration at all. One genuine conflict — a running keyframe's `transform` beating an
  inline one — resolved structurally by nesting rather than by arbitration.

**The mechanism both units independently identified is the decisive part.** The record's
position is set by CSS layout: it rises from a spine that is a flex child in a wrapping row.
A WebGL version must therefore convert a DOM rect into world coordinates and keep that
mapping correct across scroll, resize and re-wrap — which is the two-systems-share-a-number
problem this project has recorded repeatedly, and which the CSS version does not have,
because the element *is* the coordinate system. A renderer adopted to escape a coordination
failure would have introduced one.

Unit 12 also overturned unit 11's report of a perspective defect at rest: the face measures
a true square, and the skew observed mid-rise was the flip's own entry keyframe playing
concurrently. Inferred from a still frame; corrected by sampling per frame.

**What is genuinely still missing is depth, and it is not a renderer problem.** At 16° the
sleeve shows no side face — a pale face abutting a dark background, no thickness anywhere on
the silhouette. The rotation is convincing and the object is not. A side face is a second
element rotated 90° at the shared edge under the `preserve-3d` already in place.

---

## A18a — §2: `three` is not in the stack

**REPLACE:**

> | 3D | `three` — **only** for the pulled record (§10b). The shelf itself is CSS, and that is a rule, not an accident: see §10b. |

**WITH:**

> | 3D | None. The pulled record is CSS transforms under `preserve-3d` (§10b). `three` was specified and then not adopted — the reasoning is in §10b and it was settled by building the flat version. |

---

## A18b — §10b's intro: the 3D engine is not borrowed at all

**REPLACE:**

> Inspired by thecriterioncloset.com, and worth being explicit about what is borrowed: a wall of spines in perspective, a crosshair that names what you are aimed at, and a case that comes off the shelf and can be turned over. The 3D engine is borrowed for one thing only — the pulled record — and deliberately not for the wall. Both halves of that split are reasoned below, and the reasoning is the point: the wall is flat, so CSS is right for it; the record is an object you turn, so it is not.

**WITH:**

> Inspired by thecriterioncloset.com, and worth being explicit about what is borrowed: a wall of spines in perspective, a crosshair that names what you are aimed at, and a case that comes off the shelf and can be turned. What is **not** borrowed is the 3D engine — not for the wall, and, after measurement, not for the record either.
>
> One thing the reference settles that this spec previously got wrong: **its case does not flip.** It turns perhaps 15–20° off face-on, enough to show the case has thickness, never enough to reveal a back. Its own copy reads *"Move the mouse to turn it · click to put it back."* Turning the record over to read its back is this app's own design, not something taken from the reference, and the two motions are separate here for that reason.

---

## A18c — §10b: the renderer paragraph

**REPLACE:**

> **Rendered in 3D (`three.js`), unlike the shelf.** The wall is flat and CSS is right for it. The pulled record is not: it is an object you turn, and turning it is continuous rather than a fixed animation. This was first built as a CSS keyframe and the result was a panel swapping with a wobble — the end states correct, the motion wrong. Two failed attempts at coordinating React state with a CSS transition were the signal that the medium was wrong, not the implementation.

**WITH:**

> **Rendered in CSS, like the shelf — decided by building it.** An earlier version of this section committed the pulled record to `three.js`, on the evidence of two failed attempts at a CSS flip. That inference was wrong, and the correction is worth recording because it is the same shape as several other findings here: the failures were about a *discrete face swap* fighting an animation — a flag saying which face was showing, and a midpoint React and the compositor disagreed about — and they were read as evidence about the medium.
>
> Splitting the motion apart removed the state that failed. A pointer-driven tilt has no second state at all: the pointer moves, a custom property updates, the compositor renders, and nothing is ever halfway between two things because there is only one thing. Built that way it wanted no coordinator, no flag, no shared duration, and no easing.
>
> **The mechanism that decides it.** The record's position comes from CSS layout — it rises out of a spine that is a flex child in a wrapping row. A WebGL version must convert that DOM rect into world coordinates and keep the mapping correct across scroll, resize and re-wrap: a number two systems must agree on, adopted in order to escape a coordination failure. The CSS version has no such number, because the element is the coordinate system.
>
> **This reverts if the box does not work.** The one thing still missing is depth — at 16° the sleeve shows no side face, so the rotation is convincing and the object is not. That is a second element rotated 90° about the shared edge under the `preserve-3d` already in place. If real geometry turns out to need a renderer after all, the decision is reopened with that evidence, the same way it was closed with this.

---

## A18d — §10b: turning, now that tilt and flip are separate

**REPLACE:**

> **Turning is continuous and pointer-driven.** On desktop the record follows the pointer, as the reference does — move to turn it, click to put it back. On touch it is dragged. Either way the rotation tracks the input rather than playing a canned animation, because that is what makes it feel like an object rather than a transition.

**WITH:**

> **Two motions, deliberately separate: a tilt you drive, and a turn you ask for.**
>
> **The tilt is continuous, pointer-driven and limited.** On desktop the record follows the pointer as the reference does — around 15–20°, enough to show it is an object with thickness and to catch the light across its face, never enough to reveal the back. The mapping is absolute: the same pointer position always gives the same angle, so moving away and back returns the record to where it was. On touch it is dragged. It **holds its last angle** when the pointer leaves rather than springing back, because a record you have turned stays turned — and because a still record then costs nothing at all.
>
> **The turn to the back face is a deliberate click**, not something the pointer can reach. Rotation of a two-sided object rather than a swap of one face's contents, so no state says which side is showing. Both faces exist throughout.
>
> The reason for the split is that they answer different questions. The tilt says *this is an object*; the turn says *show me the other side*. Collapsing them means the back arrives by accident while someone is looking at the front.

---

## Verify

```
grep -n "three\.js\|`three`\|three-js" SPEC.md
grep -n "Rendered in 3D\|Rendered in CSS" SPEC.md
```

Every surviving mention of `three` must be retrospective — saying it was specified and not
adopted — rather than mandating it. Report the count and the classification; do not report
"clean". The last three passes over this document each asserted coverage they did not have.

Then read §10b's "Pulling a record" subsection end to end and answer: **does it now describe
one coherent set of motions, or does some sentence still assume the record flips as it
turns?**

## Commit

```
git add SPEC.md
git commit -m "SPEC: A18, the pulled record stays in CSS - decided by building it"
```

Then stop. The box is the next unit and is separate.
