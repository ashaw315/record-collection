# Step 13 unit 10 — the rise, in CSS

This unit exists to answer a question, not only to ship a feature. §10b line 870 commits
the pulled record to `three.js`, and that commitment was made on the evidence of two failed
flip attempts. The rise has never been attempted in either medium. It is the part most
likely to be hard, and it is the part where the two media differ most — so building it flat
first is what makes the renderer decision an observation rather than an inheritance.

§10b line 864 already sanctions this: *"If it turns out to be worth more, that is a later
decision made with the flat version in front of us."* This unit produces the flat version.

**Do not add `three`, `@react-three/fiber`, or any renderer in this unit.** If you conclude
partway through that the rise cannot be done in CSS, stop and report that with what you
observed — that conclusion is the unit's most valuable possible output and it must not be
pre-empted by starting the alternative.

## Scope

**In scope:** the record rising out of its slot when a spine is clicked, and returning to it
when dismissed.

**Out of scope, explicitly:** the turn, the flip, the gatefold, pointer-driven tilt, the
back face's content, arrow navigation, the snippet. `PulledRecord.tsx`'s existing
`key={face}` turn keeps working exactly as it does today and is not touched. If the rise
forces a change to it, stop and report rather than widening.

## What §10b asks for

> **The record rises out of its slot.** It was on the shelf a moment ago and now it is in
> your hands — that continuity is the feature. A record that fades in centred is a modal
> wearing a sleeve, and the difference is felt immediately.

The record currently appears as a centred overlay. That is the modal §10b names.

## The approach, and why it is not a third attempt at the thing that failed twice

CLAUDE.md §9 says stop after two failed attempts. Two attempts failed at the flip, and both
were the same shape: React and the compositor disagreeing about when a thing is halfway. A
`flipping` boolean; then two legs across two effects; `FLIP_MS / 2` appearing in both a CSS
duration and a `setTimeout`.

**The rise does not have that shape, and the difference is checkable rather than asserted.**
It is a one-way animation with no state swap in the middle — nothing is exchanged at 50%,
so there is no midpoint for two systems to disagree about. The same move that fixed the
flip applies: the browser owns the timing, React owns only "which record, and is it out".

Use the FLIP pattern (First, Last, Invert, Play):

1. On click, measure the spine's `getBoundingClientRect()` — this is First.
2. Render the record at its final centred position — this is Last.
3. Set a transform that maps Last back onto First, applied before paint, so the record
   *starts* looking exactly like the spine — this is Invert.
4. Remove the transform in the next frame and let a CSS transition carry it — this is Play.

**The one number that must not be shared.** The transition duration lives in CSS. React must
not hold it, must not `setTimeout` on it, and must not need to know when the motion ends —
if a cleanup is needed, use `transitionend`, which is the browser telling you rather than
you guessing. If you find yourself writing a duration in a `.ts` file that also appears in a
stylesheet, stop: that is the exact smell recorded in NOTES, and the design is wrong rather
than the value.

The return is the same in reverse, and the spine's rect must be re-measured at dismiss time
rather than cached from the rise — the shelf may have scrolled, resized or re-wrapped in
between. A cached rect is a stale-baseline bug waiting for its first resize.

## Tests

CLAUDE.md §2 applies: tests before implementation, observed failing, then passing.

What is genuinely unit-testable here is the geometry, not the animation. Extract the
Invert step as a pure function — spine rect in, target rect in, transform out — and test it
directly:

- a spine at the left of the wall and one at the right produce different translations;
- the scale factor is the ratio the two rects actually imply, not a constant;
- a spine scrolled out of view still produces a defined transform rather than `NaN`;
- the identity case (rects equal) produces no visible transform.

**Name the line of source each test would fail against.** A test asserting that a transform
string is non-empty constrains nothing.

`e2e/shelf.spec.ts` gets one addition: clicking a spine makes the record appear and the
record is the one whose spine was clicked. Do **not** assert on the animation itself — a
test that waits for a duration is asserting a number this design deliberately keeps in CSS.

`prefers-reduced-motion` disables the rise: the record appears in place, no transition.
Assert this — it is §10b's rule and it is the branch a screenshot will never show you.

## Screenshots — this unit's real verification

The rise is motion, and NOTES is explicit that motion needs the mid-transition frame:
wide answers *is the layout right*, crop answers *is the content right*, and the midpoint
answers *is the motion right*. A rise that has already finished by the time you capture it
is indistinguishable from a fade.

Capture at 1280, on the real shelf with real records:

1. **Before** — the wall, spine about to be clicked.
2. **~15% in** — the record just leaving the slot. Pick the time from the duration, not by
   feel. If this frame looks like the settled state, there is no motion, only a delay.
3. **~50% in** — mid-flight, mid-scale.
4. **Settled** — the record at its final position.
5. **Mid-return** — the same again on dismiss, which is the half most likely to snap. The
   flip's first attempt animated out correctly and snapped on the way back.

Paste all five. **Do not describe them as good.** Describe what is in them.

## Report

Beyond the standard §10 checklist, answer these three plainly. They are the reason the unit
exists:

1. **Does it read as the record coming off the shelf, or as a modal with a transition?**
   Your honest reading of frames 2, 3 and 5.
2. **Where, specifically, did CSS strain?** Name the mechanism, not the feeling — a
   coordinate system that had to be converted, a value that wanted to live in two places, a
   frame where the browser and React disagreed. If it did not strain, say that.
3. **What would `three.js` have made easier here, concretely?** Not in general — for this
   rise, with the spine's position living in the DOM and the wall being CSS. Note that a
   WebGL rise has to convert a DOM rect into world coordinates and keep that mapping correct
   across scroll, resize and re-wrap, which is itself a two-systems-share-a-number problem.

Then stop. The renderer decision is the developer's and it will be made from those three
answers plus the frames.

## Standing rules that bite here

- Full E2E run, no file argument (CLAUDE.md §10). Changing what `/` does at click time is a
  contract change, and the last one broke 33 tests across nine files.
- If a mutation or patch script is used, assert its anchor. A script that reports success
  unconditionally has already cost this project a test that did not exist.
- State the commit hash at the end and confirm `HEAD` moved. Six consecutive reports once
  described three.js work that was never written, and this is the unit standing where those
  reports stood.
