# A measurement that responds to the answer

**The quantity you measure against must not be one your choice can move.**

## The instance

§33's title ladder takes "the largest step at which it sets in at most two
lines on the measure and the cell's demand, with 24px of gap, is within its
supply." Supply was read from the identity cell:

```ts
const cell = el.closest('[data-cell="identity"]');
const supply = cell.getBoundingClientRect().height;
```

The cell has no fixed height. It grows with its content, and its content is
the title whose size is being chosen. So:

1. the title renders at some step;
2. the cell grows to hold it;
3. the ladder measures the grown cell and finds room for that step;
4. the step is confirmed by the space it created.

It chose 144 — the step §33 says fails — and reported a supply of 662px for a
band ruled at 547. **The answer manufactured its own justification.**

## Why it is a class apart from the wrong-quantity findings

The three measurement findings before this one are all *inert* quantities:
`scrollHeight` on a stretched track, `style.height` against the used height, a
rect against its own content. Each reads something incapable of moving when
the thing under test breaks. You find them by asking what would have to change
for this line to go red, and getting no answer.

A feedback loop is the opposite. The quantity moves constantly, tracks the
thing under test closely, and is *extremely* responsive — to the wrong thing.
It returns a plausible number every time, in range and in units, and it
confirms whatever it is given. There is no wrong-looking value to notice.

| shape | what the quantity does | how it is found |
|---|---|---|
| inert | cannot move when the subject breaks | ask what would turn it red |
| reachable proxy | moves, but tracks a neighbour of the claim | ask what decouples it |
| **feedback loop** | moves *because of the answer* | ask what the answer can change |

And unlike the first two, **no inspection of the assertion reveals it.** The
code reads correctly: it measures the cell the title is in, which is exactly
what the ruling names. The defect is in the direction of causation, which is
not visible in the expression.

## The tell

The chosen value sat outside the ruled set of outcomes while every input
looked sane. The band is 547 by §23 and the supply came back 662 — a number
that cannot exist for a constant-height band, and the only clue that anything
was wrong. **A measured value exceeding a ruled constant is a loop until
proven otherwise**, because the only thing that can inflate a fixed quantity
is something downstream of it feeding back.

## The fix, in general form

**Measure against something the choice cannot move.**

Supply is now `BANDS.identity` — §23's constant, 547, fixed for every record.
It is the same number the ruling means by "its supply", it cannot be inflated
by what is measured against it, and the loop is structurally impossible rather
than merely absent today.

The test when writing any fit, clamp or ladder:

> If the answer I am about to return were different, would this input be
> different too?

If yes, the input is downstream of the output and cannot constrain it. Reach
for the declared constant, the parent that is sized independently, or a
measurement taken before the subject renders — never the box the subject is
currently inflating.

## The adjacent trap in the same fix

Two other wrong boxes preceded this one, and both are ordinary wrong-quantity
errors rather than loops: `parentElement` was a 412px text-measure wrapper
whose height is the type's, not the band's; and the line-count probe defaulted
to the holder's 479px instead of the title's 412px measure, so a title setting
to three lines was counted as two. Worth separating, because the loop is the
only one of the three that would have survived a careful reading.

Related: [a test whose passing depended on the defect](./a-test-whose-passing-depended-on-the-defect.md)
— there the defect makes the assertion pass; here the answer makes its own
input agree.
