# The drawn shape and the visible shape are two quantities

**Instance.** §29 caps a flat's visible part: at most two-thirds of its host
cell's height and at most a quarter of the section's width, whichever is
smaller. The triangle's unit test asserted `max-width:25%` on the rendered
element. It passed for the whole life of the build.

It was asserting the wrong quantity the entire time. `max-width` is the
**drawn** box. §29 rules the **visible** part. The two were the same number
only because the triangle was built at `left: 0`, flush inside its host,
bleeding nowhere — so nothing was outside the page and drawn equalled
visible by coincidence of a defect.

Fixing the defect broke the test, which is the correct outcome and also the
only reason anyone looked. Had the triangle been built right the first time,
the assertion would have been wrong from birth and green forever: a
quarter-width claim checked against a box that is not the quarter.

## Why it is not the same as the earlier measurement finding

`check-the-measurements-are-of-the-same-thing.md` is about *fitting a
constant to measurements* taken of different things. This is narrower and
comes earlier: a single named quantity in a ruling — "a quarter of the
section's width" — has more than one candidate referent in the rendered
tree, and the test picked the one that was easy to read off the style
attribute.

The drawn box is always easy to assert, because it is literally a string in
the markup. The visible part usually has to be computed. **The easy one is
the wrong one whenever the shape crosses an edge**, and every §21 flat
crosses an edge by rule.

## The check

When a ruling caps the size of something that bleeds, clips, or is masked,
ask which of these the number governs:

| quantity | where it lives | when it equals the other |
|---|---|---|
| drawn | the element's own width/height | only when nothing is cut |
| visible | drawn minus what the edge or clip removes | the default assumption, usually wrong |

Then assert the one the ruling names, and assert the cut separately. The
triangle's test now does both: the drawn width, the offset that puts the
surplus outside the page, and the computed visible part against §29's
quarter. Checking size alone would pass on a triangle that bleeds nowhere,
which is the defect it replaced.

## The related trap in the same section

§26 states the triangle's placement twice — once in a value paragraph that
names its position without the bleed, once in a placement paragraph that
carries it. The build read the value paragraph. That is written up in
`a-rule-stated-twice-is-stated-once-incompletely.md`; the two findings
compound, because the incomplete statement produced the flush triangle and
the flush triangle made the wrong quantity look right.
