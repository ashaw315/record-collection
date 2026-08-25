# Step 15 — touch

Baseline: `fd79a36`. At `/`, verified on a real phone.

§10b: *"Tilt it: on a pointer it follows the cursor; on touch it is dragged."* The first half
has been built since unit 18. The second half has never existed — `pointerdown`, `touchstart`,
`setPointerCapture` and `pointerType` have zero hits across `src/`, measured.

---

## What that absence costs, measured

- **The tilt never fires.** `canTilt` is true once settled and the effect binds `pointermove`
  on `window`, but on touch there is no move stream without a finger down, and a finger down
  that then moves is a scroll.
- **The proud-on-hover affordance never fires**, so a spine gives no feedback before the tap.
- **The hover card fires once and vanishes.** Touch emits a single `pointermove` before the
  tap, which sets the card; the tap then pulls a record and `onPointerMove`'s first branch
  clears it. A flash, not something readable.

The wall is usable by tap alone — pull, expand, put back all work. **What is missing is
every affordance that makes it feel like an object rather than a list.**

---

## What this unit builds

**Drag to tilt.** A finger down on the pulled record and moving turns it, and the record holds
its angle when the finger lifts — the same rule as the pointer version, which `tilt.ts` already
encodes and has been reused unchanged five times. **Reuse it a sixth time.** If it does not
fit, say why rather than forking it.

**The gesture boundary is the hard part and it should be designed rather than discovered.**
A finger on the record turns it; a finger on the wall scrolls. Those compete, and the browser
owns the gesture unless something claims it. `touch-action` and `setPointerCapture` are the
mechanisms; which element claims what is the decision.

Note that the scroll lock already freezes the page while a record is out, so the competition
is narrower than it looks — but that lock exists for a different reason and the touch design
must not silently depend on it. Say which parts hold if the lock is removed.

**Out of scope:** hover-proud on touch (there is no hover on a finger — if a touch equivalent
is wanted it is a separate decision, not an inheritance), 13b's arrow navigation, E2E #10.

---

## What must not break

- **Tap still pulls a record.** The wall's whole interaction rests on it, and a `pointerdown`
  handler that swallows the click is the obvious way to lose it.
- **Zero idle draws**, before and after. The tilt renders on movement and must settle when the
  finger stops — the same dirty-flag discipline hover proved, which currently holds at 0 draws
  across 60 fast moves.
- **The scroll lock, the return-home behaviour, the expanded panel, the emptied slot.**
- **Desktop pointer tilt unchanged.** It works; this adds a second input, not a replacement.
- **`prefers-reduced-motion`** — exported from `BoxCanvas` and honoured by every other
  animation. Honour it here.

---

## Tests

**Playwright's touch emulation and a real device have now agreed once**, when the
fixed-coordinate probe was corrected — so the emulator is usable. But the last unit was caught
eight times by arithmetic that looked right while the render disagreed, and touch is the case
where emulation is most likely to differ. **Verify on the phone as well, and say which claims
rest on which.**

The discriminating case is a drag that *starts* on the record versus one that starts on the
wall. A test that only drags the record cannot tell a correct gesture boundary from one that
claims every touch.

Assert the record holds its angle after the finger lifts — releasing to rest would pass a test
that only checks the angle changed during the drag.

---

## Screenshots

1. The record mid-drag, tilted, on the phone.
2. The same after the finger lifts — still tilted.
3. A drag started on the wall with a record out.

---

## Report

1. **Does the record turn under a finger?** Frames, and your own read.
2. **What claims the gesture, and what happens at the boundary?**
3. **Draws: idle before, during a drag, and after the finger lifts.**
4. **What rests on emulation and what was verified on the device?**
5. Anything that fought anything.

Full E2E, no file argument, `--retries=0`. Commit hash, confirm `HEAD` moved.

Then stop — Adam judges on the phone.
