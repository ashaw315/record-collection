# A33 — §10b: the panel expands in place over the record; it does not navigate

Written before step 15 unit 5's expand-in-place build, and before any code — the spec should
describe the behaviour before the app implements it, per the rule this project has held to for
thirty-two amendments.

**This is a REVISION, and it is only hours old.** A32, in this same unit, decided the pulled
record's facts move to a summary card stacked beneath it whose TAP navigates to `/records/:id`.
Looking at the Criterion reference against a real cover on a real phone showed two things wrong
with that:

1. **The stacked card is not the reference.** The card floated as an opaque block over the
   record's lower-left, the sleeve poking out around it — not a column, not a clean overlay.
   The reference OVERLAYS the case: title and metadata over the artwork, a synopsis scrolling
   inside the panel, the case reading through behind. You stay in the room.
2. **The tap should not leave the room.** A32 sent it to the detail page. The reference expands
   the panel in place; the detail page belongs to a link INSIDE the expanded panel, for what
   the panel does not hold.

So A33 supersedes A32 on those two points. **Said plainly as a revision, not a contradiction**,
so the next reader sees a decision that changed and why rather than two clauses that disagree.

**What A33 does NOT retract from A32:** the width fork itself (flanked ≥ 820px, overlay below),
the measured threshold, and the single `/records/:id` destination. Only the *shape* of the
narrow layout (overlay, not stacked block) and *what the control does* (expand, not navigate)
change.

---

## A33a — §10b: the summary is an overlay on the record, not a block beneath it

**§10b (as amended by A32) said** the narrow layout is a "summary card stacked beneath" the
record.

**REPLACE** with: the summary is **overlaid on the record's lower portion** — a scrim from
transparent at the record's top to the panel ground at the bottom, the facts over it, the
artwork reading through, as the reference does. The record stays camera-centred and full-bleed;
there is no lift.

**Consequence for the code:** the record LIFT introduced for the stacked column
(`pulledDestination`'s `layout` / `stackedCardHeight` / the frame-fraction lift arithmetic)
is REMOVED. The record goes back to camera-centred. This deletes the two lift bugs the stacked
approach fought (the fixed-fraction clip, then the viewport-vs-canvas-height error) — the
overlay needs none of it.

## A33b — §10b: the control expands the panel in place; the detail page is a link inside it

**§10b (A32) said** the tap navigates to `/records/:id`.

**REPLACE** with: the control **expands the panel over the record** — the synopsis unfolds and
scrolls inside it, the record staying behind. `/records/:id` is reached by a link INSIDE the
expanded panel, for the journal, prices, images and editing the panel does not carry. One
destination, still shared with §10b's keyboard list; a link within the panel rather than the
panel's whole behaviour.

## A33c — §10b: generated and entered facts stay distinguishable in the expanded panel

The expanded synopsis is the record's `snippet` (§10b) — generated — followed by the entered
and imported facts. **These must not merge into one undifferentiated block.**

The reason is §10b's own snippet rule and the shape 13c built to enforce it: the snippet is
"the app asserting things about music", labelled generated "in the same register as Discogs
estimates", and 13c made the label part of the type — `{ text, generated }`, never a bare
string — precisely so a snippet could not be rendered as fact. Stacking snippet and entered
facts in one scrolling panel without a boundary would defeat that at the last step: the panel
would assert things about music without saying which part it made up.

So the snippet keeps its generated label inside the expanded panel, and a boundary separates
it from the entered facts below.

## A33d — §10b: expanding is one behaviour across widths

Both the overlay (narrow) and the flanking panel (wide) expand. The flanking panel already
shows the full fact list statically, so expanding adds the synopsis and the in-panel link
rather than a new information architecture — it is the expanded shape at rest.

**A behavioural fork on top of A32's layout fork is rejected.** A32 forked on ROOM: a panel
fits beside a wide record and not a narrow one. There is no room argument for making the wide
panel static while the narrow one expands — that would be a second fork with no justification,
and two behaviours to keep in agreement. One behaviour, two layouts.

---

## Cost, recorded so the build does not rediscover it

- **Deletes:** the record lift and its arithmetic and tests (A33a) — simplifies the scene.
- **Adds:** the scrim overlay, a collapsed/expanded state, the scrolling synopsis
  (snippet-then-facts with a boundary, A33c), the in-panel `/records/:id` link, and E2E for
  the expand/collapse and the link. Applied to both layouts (A33d).
- **No schema change, no endpoint.** The snippet column and its `generated` flag already exist
  (13c); the fact list is `backFaceGroups`, already computed.
