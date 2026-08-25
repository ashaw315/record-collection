# Step 13 unit 19 — the rise, in three.js

Baseline `510c127`. Still `/plane`. Units 10–13 stay untouched.

This is the unit A18 named as the renderer's real cost, and A19c recorded as the hardest part
of the work:

> The record rises out of a spine that is a flex child in a wrapping CSS row, so the renderer
> must map a DOM rect into world coordinates and keep that mapping correct across scroll,
> resize and re-wrap. That is a number two systems share.

Unit 18 just demonstrated the same class in miniature — a document-relative `offsetTop` paired
with a viewport-relative `clientY`, drifting by exactly `scrollY`, wrong on one axis only.
**That was the easy version of this problem.** Take the tell with you: one axis wrong and the
other right is a coordinate-system mismatch, not a sign error.

---

## Two small things first

**The facts panel is too wide.** The composition is unbalanced — a large gap between the facts
and the canvas, a smaller one on the right, so the record sits right of centre rather than
between its panels. Narrow the facts column and centre the canvas between the two.

**Known, not a defect to fix here:** the canvas renders on hard black against a cream page, so
the record reads as a viewport onto something else. On `/` the backdrop will be the dimmed
shelf and this resolves itself. Do not paper over it on `/plane` — it would hide what the real
composition does.

---

## The rise

**The record rises out of its slot** (§10b). It was on the shelf a moment ago and now it is in
your hands; that continuity is the feature, and a record that appears centred is a modal
wearing a sleeve.

`/plane` has no shelf, so this unit needs one to rise from. **Do not build a second shelf.**
Either render the existing `Shelf` component on `/plane` and rise from a real spine, or — if
that drags in more than it is worth — use a small number of placeholder spines and say
plainly in the report that the source is not the real shelf, so nobody reads a passing result
as more than it is.

### The mapping is the whole unit

A spine is a CSS flex child in a wrapping row on a page that scrolls. The renderer needs its
position in world coordinates. Between those two facts sit every trap this project has met:

- **Which rect.** `getBoundingClientRect` is viewport-relative and reflects transforms;
  an offset walk is document-relative and does not. Unit 13 needed the walk because the
  measured element carried its own tilt; unit 18 needed the rect because the mesh rotates
  inside a canvas that never moves. **Neither is correct in general** — state which question
  you are asking before choosing, and say so in the source.
- **Scroll.** The page scrolls; the canvas may or may not. Establish by measurement which
  coordinate space each value is in, not by reasoning about it.
- **Resize and re-wrap.** A spine's position changes when the window resizes, because the row
  re-wraps. A mapping computed once at click time is correct until something moves.
- **Measure before paint, not after.** Unit 10's first defect was `useLayoutEffect` running
  twice in dev, so the second run measured an element already carrying the first transform —
  producing an identity, a record that rose from exactly where it landed, and a settled frame
  indistinguishable from a working one.

**Verify the mapping numerically before judging it visually.** The record should begin exactly
where the spine is: same screen position, same size. Log both and compare. A rise that starts
30px off looks fine in motion and is wrong.

### Timing

The CSS version put the duration in a stylesheet and had React hold nothing. In WebGL there is
no stylesheet to own it, so **something in your code will hold a duration** — that is
unavoidable here and is not the two-systems smell, provided exactly one thing holds it. If a
number has to agree between two places, that is the smell.

Drive it from the rAF loop already running for the dirty flag rather than adding a second
mechanism, and keep the dirty-flag property: **a settled record renders nothing.** A rise that
leaves the loop running forever is the cost the flag was written to avoid.

### Reduced motion

No rise. The record appears in place. Prove the assertion bites by removing the rule.

---

## Tests

The mapping is pure and is the part that matters: spine rect plus canvas rect in, world
position and scale out. Extract it and test it directly, naming the line each test would fail
against.

**The discriminating fixtures are the ones unit 18 just proved matter:**

- a scrolled page — the same spine at `scrollY = 0` and `scrollY = 400` must map to different
  world positions, and a test where both are zero cannot tell a correct mapping from one that
  ignores scroll;
- spines at the left and right of a row, and on a second row after wrapping;
- a resize between the measurement and the render.

The round-trip is the strongest single assertion: **the world position, projected back to
screen coordinates, lands on the spine's rect.** If it does not, the mapping is wrong
regardless of what the animation looks like.

---

## Screenshots

1. Before — the wall, the spine about to be clicked.
2. ~15% in — the record just leaving the slot. Pick the time from the duration, not by feel.
   If this frame looks like the settled state, there is no motion, only a delay.
3. ~50%.
4. Settled.
5. ~20% into the return.
6. **The same rise with the page scrolled** — the frame that would have caught unit 18's bug.

---

## Report

1. **Does it read as coming off the shelf?** Frames 2, 3 and 5.
2. **Does it start exactly on the spine?** Numerically, not by eye.
3. **Which rect did you use and why?** Name the question you were asking.
4. **Does it hold up scrolled and resized?** Frame 6, and what you measured.
5. **Does the loop stop when the record settles?**
6. Anything WebGL or the DOM/canvas boundary did silently.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. The flip, the hinge, touch and replacing the CSS implementation are separate.
