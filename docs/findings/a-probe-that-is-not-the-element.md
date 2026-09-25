# A probe that is not the element measures something else

**Three instances in one round, each plausible on its own.**

| probe | what it measured | what the page drew |
|---|---|---|
| the title ladder's line count | the holder's width, 479px | the title's 412px measure: two lines where the page set three |
| the give order's demand | the holder plus `nextElementSibling`, which was not the pressing block | 470 in a 547 cell where the cell rendered at 593 |
| the About's line count | `left: 0; right: 0` across the cell's padding, 358px | the paragraph's 322px: ten lines where the page drew eleven |

None produced a nonsense number. Each produced a line count or a height that
was true of the box it measured and false of the box the reader sees, and
the decision built on it — the step, the clamp — was wrong by exactly the
difference between the two boxes.

**Why it is always plausible.** A hidden copy is written to look like the
element: same text, same font, same leading. What it inherits by accident is
the part nobody writes down — its containing block, its width, what its
percentage resolves against, which sibling is next to it. Those come from
where the copy sits in the tree, and the copy never sits where the element
sits, because it is a copy. So it measures a neighbour of the element, and a
neighbour agrees with the element until the day it does not.

**The rule.** A measuring copy takes every dimension it can from the rendered
element itself — read the element's box and set the copy to it — and the
test asserts the copy's box equals the element's before it trusts any number
read off the copy. Where the copy cannot be made the element's width, measure
the element instead and accept the cost of measuring it in place.

The two boxes agreeing is a precondition of the measurement, not a property
of the page, and a precondition that tooling can quietly break is asserted
explicitly.

Related: [a measurement that responds to the answer](./a-measurement-that-responds-to-the-answer.md)
— that probe measured the right box after the answer had changed it; these
measured the wrong box from the start.
