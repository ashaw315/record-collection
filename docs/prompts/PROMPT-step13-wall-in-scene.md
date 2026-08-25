# Step 13 — the wall moves into the scene

Baseline `dd5a7a8`. **Built at `/plane`. `/` is not touched.** The CSS wall keeps working
throughout; the swap is one reviewable commit at the very end, and only if this is better.

---

## Why

QA found the thing no amount of easing fixes: **the spine never leaves the wall.** The wall is
CSS and the record is WebGL in a canvas over it, so clicking a spine leaves that spine drawn,
lit and in place while a separate object appears in front of it. No empty slot, no gap, no
occlusion. It reads as *a thing appeared near a shelf* rather than *this record came off the
shelf*.

The reference works because the case and the shelf are one scene: the slot empties, the case
occludes the shelves behind it, one light falls on both. Two layered systems cannot do that,
and the coordination alternative — collapsing the CSS spine as the WebGL record emerges — is
two systems agreeing about a midpoint, which has failed every time it has been tried here.

So the wall joins the record in the scene. This reverses A24e, which argued the wall should be
CSS because there is no perspective to render — true of a static wall, and wrong about the one
motion that matters.

**Three decisions already taken, so they are not re-litigated mid-unit:**

1. **Accessibility is a visually-hidden list beside the canvas**, not per-spine overlaid
   links. One link per record with its full title, no positional alignment to keep in sync.
   Cmd-click on a spine is lost; the contract that eight specs depend on is kept. The honest
   framing: the canvas is a picture, and the list is how the collection is read by anything
   that is not an eye.
2. **Layout is computed** — spines per row from viewport width, wrapping, scrolling. Flexbox
   is not doing it any more.
3. **The query, the ordering, the spine colours, the text budget and one-shelf-per-row all
   carry unchanged.** This is a rewrite of rendering, not of data or rules.

---

## What must survive

These are settled findings, each bought with a unit or a defect. They are requirements, not
suggestions.

- **Genre ordering with the top-level-ancestor rule and its tie-break** (§10b). Deterministic:
  the same collection always produces the same wall.
- **Spine proportion around 1:12** — narrow enough to read as a record, wide enough to name
  it. 1:40 was arithmetic and lost to legibility.
- **Spine text is artist, title and catalogue number**, truncated to fit, with the
  *untruncated* title in the accessible name. That distinction is a real accessibility rule,
  not a test accommodation.
- **The shelf is a plane, not a box.** One shelf line per row, running the full width,
  records standing on it. A shelf that stops where the records stop reads as a container.
- **A short collection reads as short, not broken.** Five records on a full wall.
- **Filtering reaches the wall** and the spine count agrees with the heading. The seam test
  from `dc6e04c` must keep passing.
- **Square on, vertical scroll only** (A24b). This is the one place the reference is
  deliberately not followed: Criterion's closet is a room with a camera, and spines at the
  edges are foreshortened and hard to read. This wall is scanned by eye, so every spine is at
  the same angle. **Being in a 3D scene does not mean adopting perspective on the wall** — the
  camera looks at it square on.

---

## What this unit builds

**One scene: the wall, the shelves, and the record.** Same camera, same lighting.

**The slot empties.** When a record is pulled, its spine leaves the wall — that is the whole
point, and it is the thing to get right before anything else. The gap is visible, the record
occludes the wall behind it, and the light falls on both.

**The rise is the motion already built** (`risePose`): edge-on in the slot at progress 0,
face-on and forward at 1, a quarter turn about Y plus a Z translation. That work carries.
What changes is that it now happens *in the same space as the wall*, so the record genuinely
leaves a gap it can return into.

**Scope stops there.** No panels, no tilt, no flip, no gatefold, no filtering UI in this unit
— those exist and can be reattached once the wall is proven. **The one question this unit
answers is whether a record coming off a WebGL wall reads as a record coming off a shelf.**

---

## What will be hard, named in advance

- **Scroll.** The page scrolls today; a canvas does not scroll with it natively. Decide
  deliberately — a tall canvas that scrolls with the page, or a fixed canvas with the camera
  panning — and say which and why. This determines what every later measurement means.
- **Text rendering.** Spine text in WebGL is not free. Canvas-textured labels are the usual
  answer; whatever you choose, the legibility bar is the one already set — readable at real
  size without hovering, at ~1:12.
- **Hit testing.** Clicking a spine is now a raycast, not a DOM event. There is currently a
  hover defect on `/` (*records pop up when hovering*) that may or may not survive this; report
  it if it recurs, and do not carry across a hover behaviour nobody asked for.
- **Performance at 125 records.** The last unit found three WebGL contexts per pull from an
  unmemoised prop. A wall of 125 spines has more surface for that class of mistake.

---

## Tests

Rendering is hard to assert and this project has been burned by tests that measure the wrong
thing. Be honest about the split.

**Genuinely testable, and where the value is:** the layout arithmetic. Spines per row from a
viewport width, wrapping, which row a given index lands in, where a spine sits in world
coordinates. Pure functions, tested directly.

**The slot emptying is the behavioural assertion that matters** — with a record pulled, the
wall has a gap where its spine was. Find a way to assert it that is not a screenshot: the
scene's spine count, or the pulled spine's absence from the drawn set.

**The accessible list is assertable and must be**: every record present, full untruncated
titles, links resolving. This is the contract the eight specs depend on, and it is now the
only channel carrying it.

**Do not assert on canvas pixels via `getBoundingClientRect`.** Unit 22's finding — *a
background has no box* — applies twice over to a canvas. If pixels must be checked, decode
the screenshot as `findShelfBands` does.

---

## Screenshots

1. The wall at 125 records, nothing pulled — against the CSS wall at the same data.
2. Five records.
3. A record mid-rise at ~15%, ~35%, ~50%, ~75% — **with the empty slot visible.**
4. Settled, showing occlusion of the wall behind it.
5. The return at ~20%.
6. Spine text at real size, cropped.
7. 390px.

---

## Report

1. **Does the record come off the shelf now?** Frame 3, and the empty slot is the evidence.
2. **How does the wall compare to the CSS one** at the same data — better, worse, different?
3. **Scroll: what did you choose and why?**
4. **Is the spine text as legible as the CSS version?** Frame 6 against the current wall.
5. **What does the accessible list contain, and what did you lose?**
6. **Performance at 125 records** — draws per frame, does it settle when idle.
7. Anything WebGL did silently.

`/` untouched — confirm the full E2E is green against the CSS wall, unchanged.

Commit hash, confirm `HEAD` moved.

Then stop. **QA gate.** If a record does not visibly come out of an emptied slot, this
approach has not earned the rewrite and we stop rather than continue.
