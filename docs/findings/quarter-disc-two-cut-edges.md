# The quarter-disc cannot satisfy §26 and §29 at once

**Conflict for Design. Reported, not resolved.** Found in a §26 audit of every
figure and flat in the lower region.

## What was measured

On a rich record, every ornament's box against its host cell's box:

| ornament | host | cut by |
|---|---|---|
| figure:solo | price-history | FOOT |
| figure:pair | air0 | FOOT |
| flat:triangle | air4 | *(nothing)* |
| **flat:quarterDisc** | **snippet** | **RIGHT + FOOT** |

At 1440 the disc spans x **1279..1601** in a host ending at **1440**. At 1200,
x **1050..1350** in a host ending at **1200**. It is cut by two edges at both
widths, one of them a side.

## The two passages

**§26 forbids a second cut edge, by name:**

> "Clipping is a boundary, not a treatment: each figure's clip is its own
> cell, so it can never enter another. A figure may be cut by **at most one**
> of its cell's edges — its foot, per §9.2's bleed. **Two cut edges read as a
> figure too big for its box rather than as masking**, which §17 records as
> reading like a mistake."

**§29 forbids the flat crossing a cell edge at all, and permits only a page
edge:**

> "Why flats still never bleed at a cell edge: §21's reasoning holds. A cell
> edge has the next section behind it, so a flat crossing it lies over that
> section or over one of §W.31's structural rules, which is ornament
> overriding structure. **A page edge has nothing behind it.**"

## Why the construction cannot satisfy both

§25's specimen sheet names the shape and how it is masked:

> "EDGE BLEED · PAGE EDGE ONLY — r 150 · more than a third outside, masked by
> the page edge"

**A quarter-disc is a full circle whose centre sits on its host's bottom-right
corner.** That is what makes "more than a third outside" structural rather
than drawn: half the circle lies beyond the right edge and half beyond the
bottom, so exactly one quadrant shows, and the proportion holds at any size
§29 gives it.

The geometry is therefore inseparable from two cut edges. A circle centred on
a corner **must** cross both edges that meet at that corner. To cut it on one
edge only, it would have to stop being a corner-centred circle — at which
point "more than a third outside" becomes a number someone maintains rather
than a consequence of the construction.

## Why it may have been accepted

**On this record the cell edge and the page edge are the same line.** The disc's
host is `snippet`, the right-hand section of §26's row 4, whose right edge is
the page's right edge at every width. So §29's distinction — "a cell edge has
the next section behind it, a page edge has nothing" — does not bite here:
there is nothing behind this cell edge either.

That reading makes the build correct under §29's *reason* while violating
§26's *rule*, which counts edges rather than asking what is behind them.

## What is not in question

- The disc's **size** is settled by §29 and measured correct: visible extent
  is the smaller of ⅔ the host's height and ¼ the section's width.
- The disc's **placement** is settled by §26: base step, right page edge,
  beside About this record.
- The **triangle** has no such problem — it is cut by nothing, because a
  right triangle on the left page edge meets only one cell edge.

Only the edge count is in conflict.

## The question that may dissolve this entirely

**§26's clause says "figure". The quarter-disc is a flat.** If that clause
governs solids only, there is no conflict at all.

§21 gives the two kinds *different* edge rules, in one sentence:

> "**An isometric figure never crosses a page edge. A flat field always may.**
> That is not a new rule — it is the Edge Marks ruling... a cropped object
> reads as a mistake and a cropped field reads as a plane extending past the
> edge."

So the vocabulary is already split at the point §26's clause uses it:

| | figure (isometric solid) | flat field |
|---|---|---|
| §21 on the page edge | never crosses | always may |
| §26 "at most one edge may cut it" | clearly applies | **unstated** |
| §29 on cell edges | — | never bleeds at one |

§26's own sentence reads: "each **figure's** clip is its own cell... A
**figure** may be cut by at most one of its cell's edges — its foot, per
§9.2's bleed." §9.2 is about in-cell solids, and "its foot" is the solid's
bottom bleed. Every term in the clause points at solids.

**If "figure" there means what §21 means by it, the disc is out of scope and
the build is already correct.** The audit's other three ornaments — solo,
pair, triangle — are cut by a foot or by nothing, so §26's clause is satisfied
by everything it plainly governs.

**Design is ruling the subject of that clause.** That is a smaller question
than the three below, and it may remove the need for them.

## What a ruling would need to say, if the clause does govern flats

One of:

1. **§26's "at most one edge" counts only edges with something behind them** —
   making the page edge exempt, which is §29's reasoning applied to §26's rule.
2. **The quarter-disc is exempt as a flat** — §26's clause is written about
   *figures*, and the disc is a flat; whether "figure" there means all
   ornament or only §25's solids is not stated.
3. **The shape changes** — a corner-centred circle is replaced by something
   that can be cut on one edge, which costs the structural "more than a third
   outside".

The first two cost nothing in the build. The third changes what the mark is.
