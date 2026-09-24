# Before fitting a constant to measurements, check they are of the same thing

**Finding for Design. A step before the set-derived rule defect: that one is
about deriving a rule from the set it is measured against. This is about
deriving one rule from two different things.**

## What happened

§26's drawing places two figures. I measured both, wrote both figures into a
comment, and then stated a single constant:

```ts
/**
 * Where a figure stands in its cell: its box's right edge two columns in from
 * the cell's right edge. Not ruled in text — read off §26's drawing, where the
 * pair's box ends 203px and the solo's 243px short of their cells' right
 * edges. …
 */
export const FIGURE_RIGHT_INSET = 240;
```

**The evidence that the two disagreed was sitting in the comment beside the
constant that ignored it.** 203 and 243 are 40px apart; I averaged toward one
of them and called it the rule.

## What the measurements actually say

| | host cell | figure span | left inset | right inset | midpoints |
|---|---|---|---|---|---|
| **pair** | 840..1440 | 1043.4..1237.2 | 203.4 | 202.8 | host **1140.0**, figure **1140.3** |
| **solo** | 0..1440 | 1102.1..1197.1 | 1102.1 | 242.9 | host 720.0, figure 1149.6 |

**The pair is not inset. It is centred in its air column** — left and right
insets agree to 0.6px, and its midpoint sits 0.3px off its host's. The 203 was
centring seen from one side.

**The solo is genuinely inset**, at 242.9px = 2.02 columns of the 120px module.

So the drawing has **two placement rules**: centre a figure in an air column,
inset a figure in a full-width strip by two columns. The build has one
constant, which is right for the solo and wrong for the pair.

## The observable consequence

Both figures land on **x = 1200** at 1440, forming a vertical that looks
deliberate. In the drawing they are at 1237.2 and 1197.1 — **40px apart, and
deliberately not aligned**. A constant produced an alignment the design does
not have, and the alignment reads as intentional, which is why it survived a
screenshot review.

## Why the check is cheap and was skipped

Two numbers that differ by 17% invite averaging. The question that separates
them costs one subtraction each: **is this distance measured from the same
reference?** The pair's 203 is a distance from a centre; the solo's 243 is a
distance from an edge. They are different quantities that happen to share a
unit.

The test, before fitting anything:

- **Same reference?** An inset from an edge and a half-gap from a centre both
  read as "px from the right", and only one of them stays put when the host
  resizes.
- **Do the residuals have structure?** 203 and 243 are not noise around 240.
  One is 33.8% of its host, the other 16.9% — an exact factor of two, which is
  what centring versus edge-insetting produces.
- **Does the constant reproduce every measurement it was fitted to?** 240
  reproduces neither: it is 2.9px off the solo and 37.2px off the pair.

## Relation to the set-derived rule defect

§22 records that one: "a floor re-measured so that the small form stops
failing it is a floor tuned to the thing it measures." That is about the
*relationship* between a rule and its evidence.

**This is one step earlier.** Before asking whether a rule is tuned to its
evidence, ask whether the evidence is one population. A constant fitted across
two rules is not a compromise between them — it is wrong for both, and it
hides the fact that there were two.

## Status

**Not built.** §26's placement is Design's to confirm. Recorded so the
constant is not read as ruled.
