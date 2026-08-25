# Step 13 unit 11 — the chrome participates, and a spec that fails after 8pm

Two things. The first is the unit; the second is two lines, folded in deliberately rather
than given its own commit, for a reason stated below.

`e49c81f` is the baseline.

---

## Part 1 — the chrome participates in the rise

### What unit 10 found

Frame 2, at 15% through the rise: the backdrop is already at full dark and the control row
("Full details / Put back") is already at final size and opacity, while the sleeve is
`scale(0.51, 0.65)` and 190px away from where it will land.

So the record rises out of the shelf **into a modal that had already announced itself.**
The motion is right and the frame around it arrives first.

### Why this is a defect and not polish

§10b's claim for the rise is continuity:

> It was on the shelf a moment ago and now it is in your hands — that continuity is the
> feature. A record that fades in centred is a modal wearing a sleeve, and the difference is
> felt immediately.

A backdrop at full strength before the record has left its slot is the modal asserting
itself ahead of the object, which is the specific thing that sentence rejects. The record's
own motion cannot carry the continuity alone if everything around it has already resolved.

It is also blocking the next unit. The pointer-driven tilt will be judged entirely on
mid-transition frames, and those frames currently contain chrome that resolves early. A
tilt that reads wrong would be indistinguishable from chrome still stepping on it — two
causes, one observation, which is the "same family is a hypothesis" trap NOTES records.

### The shape, and the one hazard

**The backdrop and the control row animate on their own CSS transitions, driven by the same
class toggle that drives the record.** One class goes on; everything responds to it
independently. No JavaScript coordinator, no shared timing value in a `.ts` file, no
sequencing logic.

They may have different durations and different easings from the record and from each
other — that is a stylesheet decision and it belongs in the stylesheet. What they must not
have is a duration that JavaScript knows about.

**The hazard, stated plainly because it is the shape that has already failed twice here.**
Several things animating in concert is closer to that shape than the rise was. If this
starts wanting a coordinator — a flag, a timer, a "wait for the record before starting the
backdrop", a number appearing in both a stylesheet and a module — **stop at one attempt, not
two.** We already know what that road looks like; there is nothing to learn by walking it
again. Report what it wanted and why, and the design gets rethought rather than retried.

The tell, from NOTES: *if a number has to be the same in two places for the feature to work,
one system should own it.*

### Scope

**In scope:** the backdrop's dim and the control row's arrival, on the rise and on the
return.

**Out of scope:** the tilt, the turn, the flip, the gatefold, the back face's content, the
snippet, arrow navigation. The record's own FLIP animation from unit 10 is correct and is
not touched — if this unit forces a change to it, stop and report rather than widening.

Do not add a renderer. `three` stays out of `package.json`.

### Tests

Little here is unit-testable, and inventing tests for prose is what CLAUDE.md §2's carve-out
forbids. Be honest about which half is which.

What is testable: the class toggle is a single source — assert that the backdrop, the
controls and the record all derive their state from one value rather than three, so they
cannot desynchronise. Name the source line it fails against.

`prefers-reduced-motion` disables the chrome's motion as it disables the record's. Assert
it. It is §10b's rule and it is the branch no screenshot will show you.

Do **not** write an E2E test that waits on a duration. The whole design keeps durations in
CSS, and a test asserting one puts the number back in JavaScript.

### Screenshots — the verification

Same three-capture discipline, and the midpoint is the whole point. Capture at 1280 on the
real shelf:

1. **~15% in** — the frame that exposed the defect. The backdrop should be partway, not
   full. The controls should not yet be at final size.
2. **~50% in** — record mid-flight, chrome mid-arrival.
3. **Settled.**
4. **~20% into the return** — the return is the half that snaps, twice now in this project's
   history.

For each, state the backdrop's opacity and the controls' scale and opacity as numbers, not
as impressions. Unit 10's numbers are what made the defect legible; adjectives would not
have.

Then answer one question: **at 15%, does the frame read as a record leaving a shelf, or as a
modal opening?** Your honest reading.

---

## Part 2 — `record-detail.spec.ts:367`

Unit 10 recorded this in NOTES as an unrelated pre-existing failure. That was correct
procedure and it undersells what it is.

The spec computes an expected date with `toISOString()` — which converts to UTC — and
compares it against a locally-rendered input. West of Greenwich, every evening after 20:00
EDT, UTC is already tomorrow and the assertion fails. It passes every morning.

**This is a known class in this repository, not a discovery.** NOTES records exactly this
bug being found and fixed in `RecordJournal.todayIso()` — *"20:30 Friday the 15th in New
York is 00:30 Saturday the 16th in UTC"* — and the fix there was to use the local calendar
date, because a journal date is a human fact about the user's day. The same reasoning
applies to a test asserting what a user sees in a date input.

Fix it to derive the expected value from the local calendar date, the same way the component
does.

**Why it is folded into this unit rather than given its own commit.** It is two lines and a
known class, so a separate unit is ceremony. Leaving it is worse than the ceremony saves: a
deterministic evening failure means every subsequent unit's full-suite run reports a red
that has to be mentally discounted, and a red you have learned to discount is how a real
regression gets waved through. That is the same masking `retries: 1` was found to be doing.

Keep it as its own commit within the unit, so the diff stays legible:

```
git add e2e/record-detail.spec.ts
git commit -m "e2e: derive the expected date locally, not via toISOString"
```

Then verify it by the only means available: **run that spec now, in the evening, and again
after changing your system clock or by reasoning about the value it computes.** A test that
passes at 9am proves nothing about this bug. If you cannot verify it fails before the fix,
say so rather than claiming it.

---

## Report

Beyond CLAUDE.md §10's checklist:

- The four frames with their numbers, and your answer to the 15% question.
- **Did anything want a coordinator?** If yes, what and why — that answer decides whether
  this design survives.
- Whether you were able to observe `record-detail.spec.ts:367` failing before the fix, or
  whether you are reasoning about it rather than reporting it.
- The commit hash, and confirmation `HEAD` moved.

Full E2E run with no file argument. Unit 10's own regression was caught that way, in a test
it had not touched, while the spec-scoped run was green.

Then stop. The tilt is the next unit and is a separate decision.
