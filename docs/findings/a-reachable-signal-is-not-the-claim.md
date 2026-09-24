# A reachable signal is not the claim

Three instances in one session, in three different layers. The shape is
identical each time: **a signal that is easy to read stands in for the one
that carries the claim**, and it agrees with it right up until it doesn't.

| the claim | the reachable signal | what it actually reported |
|---|---|---|
| this flat is a quarter of the section wide (§29) | `max-width:25%` in the style attribute | the DRAWN box, equal to the visible part only while the triangle bled nowhere |
| the test run passed | the shell's exit status, 0 | the status of a trailing `echo`; the summary line said `2 failed` |
| the wsproxy image is unavailable | my own `timeout 25` firing | that 25 seconds elapsed; given 90 the image resolved with four architectures |

None of these is a careless reading. Each signal is the one that is *there*
— printed in the markup, returned by the shell, produced by the command —
while the signal that carries the claim has to be sought, computed, or waited
for.

## Why the substitution is invisible

In every case the two agreed at the moment of writing.

`max-width:25%` genuinely was the visible width, because a second defect held
the drawn and visible boxes equal. Exit 0 genuinely does mean success, for a
command that is actually the one you care about. A timeout genuinely is
evidence, when the thing timing out is the remote service rather than your
own patience.

So inspection does not reveal the problem. The assertion reads correctly
against the world as it currently is. **What is wrong is the coupling**, and
the coupling only shows when the two quantities are forced apart — by fixing
the defect, by reading the summary line, by waiting longer.

## The check

Ask what would have to change for this signal to stop tracking the claim. If
the answer is "another defect gets fixed", "a different command runs last",
or "the network is slower than my patience", the signal is a proxy and the
proxy has a condition attached that nothing is enforcing.

Then reach for the harder signal:

- the computed visible geometry, not the declared box
- the summary line, not the status — and no summary line at all is a
  FAILURE, not a pass
- a real answer from the registry, not the expiry of a timer I set

## The worst variant

Of the three, the flat's `max-width:25%` is the sharpest, because its passing
*depended on* the defect: a correct build would have left it wrong from birth
and green forever. That case is written up separately in
[a-test-whose-passing-depended-on-the-defect](./a-test-whose-passing-depended-on-the-defect.md),
because it is a class of its own — the other two are wrong the moment you
look at them properly, while that one is only wrong once the page is right.

A fourth instance lives in
[verify-the-mutation-landed](./verify-the-mutation-landed.md): a mutation
test's exit status stands in for a claim that silently requires the mutation
to have happened at all.
