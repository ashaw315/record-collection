# Step 13 — the composition returns

Baseline `2d018fd`. At `/`.

This restores what the CSS path had and the scene wall does not: the facts panel, the actions
panel, the tilt, the flip, the scrim, and Escape to dismiss. All of it existed and worked; the
swap left it behind. **This is mostly reattachment, not new design.**

---

## What comes back, and where it came from

**The panels** (unit 17, A19e). Facts left — artist, title, year, label, catalogue number,
pressing details, condition, purchase information — from `backFaceGroups`, which already
produces exactly this and already drops absent rows. Actions right: "Turn over", "Full
details", "Put back". Fixed, static, DOM. They do not track the record's geometry and never
need to agree with the camera about anything.

`panel-palette.ts` exists and is swept for contrast against the dark ground — the values were
once painted near-black on near-black at 1.02:1, so reuse the palette rather than restating
colours.

**The scrim.** The wall dims behind the pulled record. Unit 11 found the ordering that
matters: the chrome must arrive *as* the record travels, not before it. At 15% the backdrop
was partway and the controls were still at opacity 0, and that is what makes the record read
as arriving rather than a modal opening.

**Escape to dismiss.** Currently only clicking empty wall works, which is discoverable by
accident. Escape is what anyone tries first.

**The tilt** (unit 18, `tilt.ts`). Limited range, absolute pointer mapping, holds its angle
when the pointer leaves. The module is pure — pointer position and rect in, two angles out —
and has been reused unchanged four times. Reuse it a fifth; if it does not fit, say why rather
than forking it.

**The flip.** Inert since the CSS retirement. The box has both faces, so this is a rotation
of an object with no state saying which side shows — that was the whole argument for the box
in unit 13, and it retired the half-turn cost NOTES had recorded honestly.

---

## The things to get right

**One owner for "what is the record doing".** Pulled, rising, settled, tilting, flipping,
returning. Every one of those has been built separately and they now coexist. This is the
shape that has failed here every time it has been built as separate flags — the tilt must not
fight the flip, the flip must not fight the return, and a record dismissed mid-flip must go
home rather than stick.

**The tilt and the flip compose.** Unit 12 found that a running keyframe's transform beats an
inline one and resolved it structurally, by nesting, rather than by arbitration. The
equivalent question here is which rotation owns which axis — say what you chose.

**Reduced motion.** `prefersReducedMotion` is exported now, so honour it in all of it: no
rise, no return, no proud, no tilt, no flip animation. The record still turns, instantly. The
panels are information and stay.

**The panels must not fight the canvas for pointer events**, and the tilt needs the pointer
over the record. Whatever owns that, one thing owns it.

---

## What must not change

- Zero idle draws, before and after. The tilt renders on pointer movement over the record and
  must settle when it stops — same dirty-flag discipline hover just proved.
- The rise, the return, the emptied slot, centred after scrolling, hover.
- The four-shelf minimum, both edges clear.
- The accessible list, and filtering, and the seam test.
- Table and grid.

---

## Tests

Most of this has tests already — reuse them rather than writing new ones where the module is
unchanged.

**What is genuinely new is the composition**, and the discriminating cases are the
interactions rather than the parts: dismiss mid-flip, tilt then flip then tilt, Escape while
returning. A test of each feature alone cannot see those, and they are where a
separate-flags design fails.

**The panel contrast assertion is not optional** — it caught 1.02:1 once and the ground here
is the scrim rather than `/plane`'s page.

Prove reduced motion bites for each animation separately. A single assertion that "nothing
moves" can pass while one of five is unguarded.

---

## Screenshots

1. The full composition — record, panels, scrim — at 125 records.
2. Mid-rise at ~15%, showing the scrim partway and the actions not yet arrived.
3. Tilted left and right.
4. Flipped, showing the back.
5. Tilted while showing the back.
6. A record with no cover and no back — both faces are fallbacks.
7. 390px, where two panels and a record have to share the width.

---

## Report

1. **Does the composition hold on the real wall** as it did at `/plane`?
2. **What owns the record's state, and what derives from it?**
3. **What happens on dismiss mid-flip, and Escape mid-return?**
4. **Draws: idle before, idle after, during a tilt, and after the pointer stops.**
5. **390px** — does it work, or does it need its own answer? Record it; step 15 owns mobile.
6. Anything that fought anything.

Full E2E, no file argument. Commit hash, confirm `HEAD` moved.

Then stop. **QA gate** — this is the first time the whole feature exists in one place.
