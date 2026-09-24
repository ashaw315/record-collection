# Choose the quantity that can be wrong

**Finding for Design, from the §26–§28 work. The general form of
`inline-values-and-width.md` and `declared-values-are-not-measurements.md`,
written after a third instance in two days.**

## The shape

A test asserts a claim by reading a quantity. If that quantity is
**structurally incapable of expressing the failure the claim is about**, the
test passes forever and tells you nothing — not because the assertion is
wrong, but because the number it reads cannot move when the thing breaks.

The failure is silent in the worst way: the test is green, specific,
well-named, and pointed at the right element. Only the quantity is wrong.

## Three instances, two days, three layers

**1. `scrollHeight` on a stretched track** (the genres collapse trigger).
The identity cell's content track is a flex column with
`justify-content: space-between`, so it always fills its row and turns any
remainder into a gap. Its `scrollHeight` therefore reports the *budget*, never
the demand:

| record | children's sum | `scrollHeight` |
|---|---|---|
| worst title | 510.9 | **512** |
| ordinary record | 236.3 | **511** |

One pixel apart, for records 274px apart in content. No threshold could ever
separate them. Worse, the derived figure was a margin of **exactly zero** —
which is what a `space-between` track reports by construction, and would have
read zero whatever the content did.

**2. `style.height` against the used height** (the give-order guard).
`RecordPage8a` declares `height: 547` inline; §18's fork overrides it with
`height: auto !important`. At 1280 the declared value still reads `547px`
while the box renders at `387.5px`. A guard reading the declaration is wrong
by 160px. `getComputedStyle` is no better — it returns the *used* value
(`387.516px`), never `auto`, so comparing against `'auto'` fails in the
opposite direction. Only declared-versus-rendered can be wrong in the right
way.

**3. A rect against its own content** (the title overflow).
`identity-measure` asserts "nothing of the title is cut" by measuring the
h1's `getBoundingClientRect()`. The rect is the h1's *box* — 412, correct and
unchanging. The h1's content ran to 569. A rect cannot see content its own
box clips, so that assertion has never been able to fail on the thing it is
named for. What found it was `scrollWidth` on the element itself.

## The rule

**Before asserting, ask: if this broke, would this number move?**

If the answer is no, the quantity is wrong however correct the assertion
looks. Three tests for it:

- **Can it vary at all?** A margin of exactly 0 from a `space-between` track,
  a rect width equal to its declared width — these are constants wearing a
  measurement's clothes.
- **Is it the demand or the budget?** `scrollHeight` on a stretched box, a
  cell's `clientHeight`, a track's width: all report what the layout *gave*,
  not what the content *needed*.
- **Is it declared or realised?** Anything readable from `style` is an input.
  The rendered box is the output. A test that reads the input asserts its own
  setup.

## Why it recurs here specifically

This page is full of boxes whose size is *given* rather than taken:
fixed bands, a fitted construction frame, a 412 measure, `space-between`
tracks, `h-full` cells. In that setting the natural quantity to reach for is
almost always the budget, and the budget is almost always the wrong one. The
demand has to be assembled — a sum of children, a `scrollWidth`, a
declared-versus-rendered comparison — and that extra step is exactly where
the reach for the obvious number wins.

## Related

CLAUDE.md §2 records the same class under a different name — "the assertion
tests a proxy one layer below the claim" — with three instances of its own: a
variable standing in for a connection, a token for a rendering, a source
string for a behaviour. **Those were proxies for a *channel*; these are
proxies for a *quantity*.** Same failure, one level down, and worth stating
separately because the fix differs: there you assert the channel that carries
the claim, here you assert the number that can move when it breaks.
