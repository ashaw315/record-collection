# The construction sheet — all seventeen, side by side

`sheet.png` — every real record id, one frame, forms moving inside it.
Regenerate with `CAPTURE=1 npx playwright test --project=capture`.

**A sheet is the only instrument that has caught anything in this generator.**
Both of the probe's faults — six slots ringing one origin giving a
centre-weighted cluster, and a size band too narrow against the reference's 6:1
— were invisible until tiles sat next to each other. It found four more on its
first run.

## What holds

- The frame is constant and the compositions genuinely differ (asserted: one
  `viewBox` across the collection, and the extents really do vary).
- One of each archetype per record — never a random bag, because density reads
  as meaning and nothing here encodes anything.
- **The five near-grey records read as quiet grey constructions, not broken
  ones.** The disc-never-takes-base rule is visibly doing its job: the failure
  retreats into the forms, where it is quiet.
- The no-cover record falls back to ink and reads as deliberate.
- Size band: min 4.44, max 7.92, **mean 6.04** across all seventeen.

## Fixed

**Forms escaped the frame** — worst case 17 points outside, x reaching 220
against a frame edge at 150, visible as clipped beams. Fixed in the slots and by
clamping each form's origin into the envelope before drawing, **never by fitting
the frame**. Now a property the generator cannot violate: every drawn point
inside the frame on all seventeen. Removing the clamp fails that test; fitting
the frame per record fails the constant-frame test.

## Held for Design — three parameter decisions

These were measured in the probe against **unrendered template placeholders**
(`{{ heroSvg }}`, `{{ gridA }}`, `{{ gridB }}` — the file contains zero `<svg>`
elements), so they need an eye on a real sheet rather than an adjustment from me.

**1. The disc dominates.** Radius 70–76 against a 300-wide frame is ~24%, inside
the probe's stated 0.22–0.28 — but it reads as the subject rather than as
ground, and the forms cluster on it. The probe says two forms should *break the
disc's edge*; here most forms sit inside it.

**2. The two coloured faces are hard to find.** They land on right-hand faces of
small forms, so several tiles read as the disc's tint plus grey boxes. The
re-judgement says the eye should *trace a path between two coloured forms* — it
does not yet.

**3. The silhouette repeats, and this is the finding.** Every tile is
disc-centre-left with a beam running right, because the slot POSITIONS are fixed
and only the archetype assignment shuffles. So the hash varies what sits where
and not where anything sits: measurable difference, identical composition.

Recorded in NOTES as the third instance of one shape — **variation applied to an
axis that does not carry the thing being preserved.** The mean averaged over a
whole cover when the signal was in hue; the fitted viewBox normalised over a
whole arrangement when the signal was in size; the shuffle varies assignment when
the silhouette is in position.
