# Step 15 — 13b, moving between records

Baseline: `d6da35b`. At `/`, verified on a real phone.

**First, record the swipe-to-flip decision**, since it governs this unit. No swipe-to-flip:
a flick and a drag differ only in speed and distance, which is a threshold nobody can derive
and which behaves differently for different hands — the `WIDE_RATIO` shape. "Turn over" is a
button, it works, and it is unambiguous. **The stronger reason is that horizontal swipe belongs
here**: it is the natural gesture for *next record* and the one every gallery has already
taught people. Spending it on flip would force this unit to invent a second gesture for the
more important feature. Note the reservation in §10b beside the tilt clause so the absence
reads as a decision rather than a gap.

---

## What this builds

§10b: **moving through the collection without putting the record back.** A record is out; you
go to the next one, and the one after that, without returning to the wall between.

Two inputs for one behaviour:

- **Arrows** on wide layouts. Criterion's are overlaid on the artwork rather than in a side
  panel — worth following, since a panel arrow competes with the panel's own content.
- **Horizontal swipe** on touch, reserved for this by the decision above.

Both drive one thing: **move to the adjacent record in the wall's order.** That ordering
already exists and is deterministic (§10b's genre ordering with the top-level-ancestor rule
and its tie-break). Reuse it; do not compute a second order.

---

## The questions this unit has to answer

**1. What happens to the wall.** The record that was out goes back and the next comes forward —
or the record changes without a return. Those look completely different. The rise and return
exist so a record leaves a slot and goes back into *that* slot, and moving between records
either honours that or bypasses it. Say which you built and why.

**2. What happens at the ends.** The first and last record in the order have no neighbour on
one side. Stopping, wrapping, and hiding the arrow are three different answers, and a wall of
125 records where the last one silently does nothing is the shape §10b's own rules keep
rejecting — an affordance that appears to work and doesn't.

**3. What happens to the wall's scroll.** The scroll lock freezes the page while a record is
out, and the rise scrolled to centre the record before locking. If the next record lives three
rows away, the wall behind is no longer where that record's slot is. Putting it back must still
land in the right place, which is the property unit 19 measured at 201px and the last unit
fixed for the simple case.

**4. Whether a filtered wall changes the order.** Filtering repacks the wall (`dc6e04c`), so
"next record" means next *in what is shown*. Assert it rather than assuming it.

---

## What must not break

- **The tilt drag**, built last unit. A horizontal swipe and a horizontal tilt drag both start
  as a finger moving sideways on the record — this is the gesture boundary problem again, one
  layer in. Design it rather than discovering it, and say what distinguishes them.
- **Tap to pull, the scroll lock, return-home, the expanded panel, the emptied slot.**
- **Zero idle draws** before and after. Navigation animates; it must settle.
- **Desktop is unchanged except for gaining arrows.**
- **`prefers-reduced-motion`** — no animated transition between records, the new one simply
  appears.

---

## Tests

**The discriminating case is a record with neighbours on both sides**, not the first one. A
test that navigates from index 0 cannot distinguish correct adjacency from an implementation
that always moves forward.

**Assert the order matches the wall's**, by comparing against the same producer the wall uses
rather than against a literal — the seam-test shape that pinned `shelfRecords` to the heading.

**The gesture boundary needs a test that starts a horizontal movement on the record and
produces a tilt, and another that produces a navigation.** One test cannot prove both.

The ends need their own assertions, whichever behaviour is chosen.

---

## Screenshots

1. Mid-navigation on the phone — whatever the transition is, caught in the middle.
2. Desktop with arrows, at rest and hovered.
3. The last record in the order, showing whatever the end behaviour is.

---

## Report

1. **Does the wall's record change without going back to the shelf?** Your read plus frames.
2. **What distinguishes a swipe from a tilt drag?** This is the part most likely to be wrong.
3. **What happens at the ends, and why that?**
4. **Does put-back still land in the right slot after navigating away from where you started?**
5. **Draws: idle before, during a navigation, after it settles.**
6. What rests on emulation and what was verified on the device.

Full E2E, no file argument, `--retries=0`. Commit hash, confirm `HEAD` moved.

Then stop — Adam judges on the phone.
