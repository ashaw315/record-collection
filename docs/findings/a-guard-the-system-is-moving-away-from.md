# A guard whose condition the system is moving away from

**§22 is the stated safety mechanism for §5.5's colour floor. Measured over
5,000 ids, it never fires — and §33 makes it fire less often still.**

## What was argued, and what is true

§33 withdraws §31's frame constant, its fit check, and its own 1.5× cap. The
argument each time rests on §22 holding the line: "A new record's colour lands
on a form that clears the floor at that scale, by §22's guard. So the floor
holds for every future record by construction, not by a margin."

Measured:

| over 5,000 ids | |
|---|---|
| records with two eligible colour carriers | 5000 |
| records rendering quiet (fewer than two) | 0 |
| times the filter changed the outcome | 0 |

§22 filters the hash's order to the forms large enough to carry colour and
takes the first two. Every id already has two. **The filter has never removed
anything.**

## Why it is moving further away

§22's eligibility test is a floor on face area at the drawn scale. §33 raises
every record's drawn scale — measured 1.125× to 1.396× across the seventeen —
so every face grows and every form clears the bar more comfortably than
before. The guard's binding condition is receding as the system changes.

That direction is the point. A guard that binds less often over time is either
becoming unnecessary or becoming untested, and from the inside those look
identical: both report zero.

## What actually holds the floor

Not §22. The worst record sits at **0.821%** against a 0.5% floor, and it gets
there by *geometry* — the shared frame bounded the union of all arrangements,
and each record's own bounds are a subset of it, so every scale rose. The
margin is 64% above the floor and it comes from the fit, not from the filter.

**The floor holds for a different reason than the one written down.** That is
the finding. Both facts are comfortable — the floor holds, the guard is quiet
— and their combination is not, because the written reason is doing none of
the work and would not be noticed if it broke.

## The general shape

A guard reporting zero admits two readings:

1. the condition it watches for does not arise — it is protecting against
   something the system has grown out of;
2. it is broken, and the condition arises constantly without being caught.

**Zero is the same output for both.** Distinguishing them needs a measurement
of the *population*, not of the guard: here, counting eligible carriers per
record rather than counting quiet records. The first number says why the
second is zero.

So when a design argument names a mechanism as load-bearing, measure whether
it bears load. The answer is not in the guard's own output, and a green run is
not evidence either way.

## How it was found

By measuring a thing everyone assumed. §22's rate was requested as an
incidental figure alongside two stale ones; the number that came back was
0 of 5,000, and the investigation that followed found the guard had never
been measured at all — 14.1% and deepest-of-5, long attributed to §22, are
§31's fit check, a different gate that retires with the frame.

Related: [a reachable signal is not the claim](./a-reachable-signal-is-not-the-claim.md)
— there a proxy stands in for the quantity; here a mechanism stands in for a
cause.
