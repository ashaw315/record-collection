# Step 13 — hover: the record comes proud

Baseline `cd0dc08`. At `/`.

---

## What it is

Hovering a spine does two things, closest to the reference:

**The spine eases proud of the wall.** A few units forward — enough to read as the object
responding, not enough to look pulled. This is what a real shelf does: you push a record
proud with a finger to see it before deciding. It is better than a label alone because the
thing that pops is the thing that will come out, so the click is legible in advance.

**A card names the record.** Artist, title, year, label (§10b). Criterion's sits near the
pointer, over the wall, and reads as chrome rather than as part of the scene. DOM is right
for it — it is text, and the same reasoning as A19e applies: the canvas is a picture, text
belongs where something other than an eye can read it.

**No crosshair.** The reference needs a reticle because its camera moves and aiming is
genuinely hard; this wall is square on and the pointer is already the aim. The proud spine
*is* the aimed-at marker.

§10b currently specifies a floating label only. I will write the amendment once this is built
and looked at — the design is agreed, but what the card looks like beside a proud spine is a
looking question.

---

## The three things that will bite

**1. It must not resurrect the draw cost.** The current state is **zero draws across 60 fast
hover moves**, because there is no hover handler at all. A naive implementation raycasts and
renders on every `pointermove` across 125 spines.

The discipline: raycast on move, but **mark dirty only when the hovered spine changes**. The
eased motion then runs on its own until it settles, and settles to zero. A still wall with a
still pointer must cost nothing, which is the same reasoning recorded before any three.js work
began.

**2. Fast movement must not queue competing animations.** Crossing the wall quickly touches
forty spines. Each must return as the pointer leaves, and a spine still returning while
another starts must not fight it. **One owner** — a single hovered-index value, with every
spine's offset derived from it — rather than per-spine state that can disagree. This is the
shape that has failed in this project every time it has been built any other way.

**3. It composes with a pulled record.** When a record is out: its own slot is empty, so
nothing hovers there; the pulled record itself must not respond to hover; and the wall behind
the scrim should probably not either. Decide deliberately and say what you chose.

---

## What must not change

- Zero idle draws. **Measure it after, not just before** — this is the unit most likely to
  break it.
- The rise, the return, the emptied slot, centred-in-viewport-after-scrolling.
- The four-shelf minimum, both edges clear of the frame.
- The accessible list — hover is a pointer affordance and adds nothing for a keyboard user,
  who already gets the full title in the list. Do not build a focus equivalent that fights it.
- Filtering, the seam test, table and grid.

---

## Tests

**The pure part is the decision, not the animation**: given a hovered index, what offset does
each spine have. Test directly.

**The dirty-flag behaviour is the one that matters and it needs a settle window.** Asserting
zero draws immediately after a pointer move cannot distinguish *did not render* from *has not
rendered yet* — NOTES records that trap from step 10 unit 4, where a zero taken too early
passed against a mutation that moved the fetch into a mount effect. Move the pointer, let it
settle, then assert the loop is quiet.

**The discriminating case for "one owner" is fast movement across many spines**, not a single
hover. A test that hovers one spine and checks it moved cannot tell a single-owner design from
per-spine state that happens to work when only one is involved.

`prefers-reduced-motion`: no proud motion. The card may still appear — it is information, not
decoration. Prove the assertion bites.

---

## Screenshots

1. A spine hovered mid-wall — proud, with the card.
2. The same near the left edge and near the right, where the card has less room.
3. Hovered with a record already pulled.
4. A crop showing how proud the spine sits — is it a shelf responding or a record half-out?

---

## Report

1. **Does it read as the record coming proud, or as a hover effect?**
2. **Draws: idle before, idle after, and across 60 fast moves.** Numbers.
3. **What owns the hovered state, and what derives from it?**
4. **What happens on hover while a record is pulled**, and why did you choose that?
5. Anything WebGL did silently.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. The panels, tilt, flip, scrim and Escape are the next unit.
