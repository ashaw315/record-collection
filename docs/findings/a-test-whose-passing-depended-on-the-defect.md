# A test whose passing depended on the defect

**The instance.** §29 caps a flat's *visible* part: at most two-thirds of its
host cell's height and at most a quarter of the section's width, whichever is
smaller. The triangle's unit test asserted `max-width:25%` on the rendered
element and was green for the whole life of the build.

`max-width` is the **drawn** box. §29 rules the **visible** part. Those were
the same number only because the triangle was built at `left: 0`, flush
inside its host, bleeding nowhere — so nothing was outside the page and drawn
equalled visible by coincidence.

**The defect is what made the assertion pass.** §26 and §21 require the
triangle to bleed off the left page edge with at least a third outside. Had
the build been correct from the start, drawn and visible would never have
been equal, the assertion would have been wrong from birth, and it would have
stayed green forever — because `max-width` would have read the larger drawn
box while the name promised the quarter. The test did not merely fail to
catch the defect. It depended on the defect for its own result.

Fixing the triangle broke the test, which is the correct outcome and also the
only reason anyone looked at it.

## Why this is a class of its own

Three measurement failures here came before it, and all three share a shape
this one does not:

| instance | why it was wrong |
|---|---|
| `scrollHeight` on a `space-between` track | measures content, not the stretched track |
| `style.height` against the used height | reads the declared value, not the computed one |
| a rect against its own content | compares a box with itself |

Each of those is a test that **could not express the failure**: the quantity
it read was incapable of moving when the thing under test broke. They are
inert. You find them by asking what would have to change for this line to go
red, and getting no answer.

This one is different and worse. `max-width:25%` **could** express a failure
— it goes red the moment the drawn width changes — and it did, as soon as the
build was corrected. It was a live assertion pointed at the wrong quantity,
and the wrongness was invisible precisely because a second defect held the
two quantities equal. Two errors cancelled, and the cancellation registered
as a pass.

**An inert test is discoverable by inspection. This one was not.** No reading
of the assertion reveals the problem, because the assertion is correct about
the shipped page. Only correcting the page separates the quantities.

## The check

Assert the quantity the ruling names, not the quantity that is reachable.

The drawn box is always easy: it is literally a string in the style
attribute. The visible part usually has to be computed. **The easy one is the
wrong one whenever the shape crosses an edge** — and every §21 flat crosses
an edge by rule, since a flat that bleeds nowhere is already a defect.

| quantity | where it lives | equals the other when |
|---|---|---|
| drawn | the element's own width or height | nothing is cut — which for a flat means it is broken |
| visible | drawn minus what the edge or clip removes | never, in a correct build |

When two quantities in a ruling coincide in the current build, ask **why**
they coincide. If the answer is a property of the ruling, either will do. If
the answer is a property of this build's state, the coincidence is load
bearing and the assertion is resting on it.

The triangle's test now asserts the drawn width, the offset putting the
surplus outside the page, and the computed visible part against §29's
quarter — three values that cannot all stay right if any one of the three
moves. Checking size alone would pass on a triangle that bleeds nowhere,
which is the defect it replaced.

## The same shape in the run's own reporting

It appeared again the same afternoon, one layer out. The full E2E run was
launched as `npx playwright test > log; echo "run finished"`, and the shell
reported **exit code 0 while two tests failed** — the status belonged to the
trailing `echo`, not to Playwright. The summary line said `2 failed, 4 flaky,
23 skipped, 548 passed`.

That is the same error in a different currency: **a signal that is easy to
read standing in for the one that carries the claim.** An exit status is
reachable from anywhere and means whatever the last command decided; the
summary line is the thing that actually knows what happened. The project rule
already says to report the summary and never the status, and the reason is
this — the status can be made to say 0 by something that never ran a test.

The related trap: the project rule "no summary line at all is a FAILURE, not
a pass" closes the other side of it, where a crashed run produces neither.

## The compounding cause

§26 states the triangle's placement twice — once in a value paragraph naming
its position without the bleed, once in a placement paragraph carrying it.
The build read the value paragraph, which is written up in
`a-rule-stated-twice-is-stated-once-incompletely.md`. The two findings
compound: the incomplete statement produced the flush triangle, and the flush
triangle is what made the wrong quantity look right.
