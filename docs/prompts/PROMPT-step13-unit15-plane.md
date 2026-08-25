# Step 13 unit 15 — one static textured plane

Runs after unit 14. This is the first `three.js` unit, and it ships **one static textured
plane with a real cover on it, and nothing else.**

That instruction was recorded in NOTES before any of this work started, and it has survived
the renderer decision being reversed twice. The reasoning is unchanged and is worth restating
because everything in this unit follows from it:

> Every failure on this feature so far has been about two things agreeing rather than either
> thing working — React state with a CSS transition (twice), the spine's role with the
> accessibility contract, the section grouping with the data's actual shape. A canvas adds a
> third party, WebGL, **whose failures are silent** — a black square, a washed-out texture,
> nothing at all — and whose error messages point at the draw call rather than the cause.

A named hazard, so it costs minutes rather than being one candidate among five: **if the
texture is washed out, that is the colour-space difference between r128's `texture.encoding`
and r152+'s `texture.colorSpace`.** Check the installed version against the API you are
using before debugging anything else.

---

## Scope

**In scope:** adding `three`, a canvas mounted where the pulled record appears, one plane,
one cover texture, correct aspect and colour.

**Out of scope, and this is the whole discipline of the unit:** motion of any kind. No rise,
no tilt, no flip, no hinge. No box, no second face, no edges. No panels. No pointer handling.
No lighting beyond whatever is needed to see the texture at all.

**The existing CSS implementation is not touched and not deleted.** Units 10–13 stay exactly
as they are and keep working. This unit puts a plane on screen alongside or behind them —
however is least invasive — so that the suite stays green and the CSS version remains the
thing that works while the renderer is proven. Deleting it comes much later, in one
reviewable diff, once the WebGL version does everything it does.

If that means the plane is temporarily reachable only by a query param, a dev-only route, or
a flag, that is fine and preferable. Say which you chose.

---

## The dependency

`three` is now in §2's stack table (A19a), so this is approved rather than a request. State
the version you install and confirm it against the API you use — the colour-space rename
above is a version boundary, and this repository has been caught before by reasoning from a
remembered API rather than the installed one.

**Do not add `@react-three/fiber` or any wrapper.** One plane needs a renderer, a scene, a
camera, a geometry, a material and a texture. A wrapper adds a React reconciler between you
and the thing whose failures are silent, which is the opposite of what this unit is for.
If a wrapper turns out to be wanted later, that is a separate decision with its own argument.

---

## What "correct" means here

Three properties, each of which can fail silently and each of which must be checked
deliberately:

1. **The texture appears at all.** Not a black square, not a white square, not nothing.
2. **The colours match the source image.** Load the same cover in an `<img>` beside the
   canvas and compare. A washed-out or over-saturated texture is the colour-space issue, not
   a lighting problem — do not "fix" it by adjusting a light.
3. **The aspect is square and undistorted.** A 12″ sleeve is square (§10b) and the texture
   slots are square. A plane whose geometry and whose camera disagree produces a subtly
   stretched cover, which is exactly the kind of wrong that looks fine until you compare.

Use a **real cover from the database**, not a checkerboard and not a placeholder. Production
has two `cover` images and no backs; either will do. A synthetic texture cannot show you a
colour-space problem, because you have nothing to compare it against — this is the same
reason the spine-colour work measured against real sleeves rather than swatches.

---

## Tests

Be honest about what is testable here rather than inventing coverage. Most of this unit is a
command that must succeed and a screenshot, which CLAUDE.md §2's carve-out permits.

What *is* testable, and should be extracted as pure functions rather than buried in setup:

- the geometry/camera arithmetic that makes a square texture render square at a given canvas
  size;
- whatever maps a record to its texture URL, including the case where no `cover` exists.

Name the line of source each test would fail against.

An E2E assertion that a canvas element exists is close to decorative — it would pass against
a canvas that renders nothing, which is the exact failure mode this unit is designed to
surface. If you write one, say plainly what it does and does not constrain.

---

## Screenshots

1. The plane with a real cover, at rest.
2. The same cover in an `<img>` beside it, same size, for colour comparison.
3. A crop of both at 1:1, adjacent, so a colour or aspect difference is visible rather than
   inferred.

State the version of `three` installed and which colour-space API you used.

---

## Report

- Does the texture render, and does it match the source? Answer from frame 3, not from
  frame 1.
- What version of `three`, and which API — `encoding` or `colorSpace`?
- How is the plane reached (query param, flag, route)? 
- Anything WebGL did silently that you had to discover rather than being told.
- Commit hash, and confirm `HEAD` moved.

Full E2E run with no file argument — the suite must still be green, because nothing that
existed before this unit has changed.

Then stop. The box, the textures for the other three slots, the panels, and the motion are
all separate units, and the order they come in is a decision to make with this plane on
screen.
