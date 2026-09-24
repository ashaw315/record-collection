# A value that varies by width cannot be inline

**Finding for Design, from the §26–§30 build. Four instances in one session, one shape.**

## The shape

A value set as an inline `style` on an element beats every stylesheet rule that
does not carry `!important`. So the moment a ruling makes something depend on
the viewport, any inline copy of that value silently wins — and the breakpoints
that were supposed to change it do nothing at all.

**The failure is invisible in the way that matters.** Nothing errors, nothing
warns, and the page still renders: it renders the *narrow* composition at every
width. Each of these four was found by measuring the built page, and none of
them would have been found by reading the code, because the code that was
supposed to be in charge was correct.

## The four

| # | What was inline | What it defeated | How it showed |
|---|---|---|---|
| 1 | `gridColumn` / `gridRow` on every section and air cell | §28's four breakpoint blocks | At 1200 the region reported 8 columns of 150 — correct — while four air cells, hidden by `display: none` but still inline-placed at columns 8–12, opened four implicit 0px tracks beside them. **A hidden element's inline placement still creates grid tracks.** |
| 2 | `maxWidth: GRID_FORK` in three places (`RecordPage8a`, the page wrapper, `AppHeader`) | §30's lift of the cap to 1920 | At 1680 the page stayed 1440. Three separate copies, each individually reasonable. |
| 3 | `IDENTITY_SPANS` (§23's 4 / 4 / 4) on the upper cells | §30's 5 columns at 14, 6 at 16 | The still cell measured 480 where §30 rules 600. |
| 4 | A flat 1440 page width between 1440 and 1679 | §30's growth clause, which its own arithmetic assumes | §30 computes its 1679 × 1050 floor from "twelve columns, so the construction is four columns of 139.9" — that is 1679 ÷ 12, so columns grow from 1440. A four-column cell was 480 where the section measures 559.7. |

## Why it recurs

Every one of these values was *correct when written*. §23's 4 / 4 / 4 is the
band's ruling, not a width's; `GRID_FORK` was the cap before §30; the spans
were the only layout the region had. Each became wrong the moment a later
section made it a function of the viewport — and nothing connects the two
events, because the sections are written years apart in the file and the code
does not say which of its constants a future width might move.

## What we did, and what we would suggest

Where a value varies by width, it lives in the generated stylesheet and
nowhere else. `region-rows.ts` emits §28's and §30's placements from the same
table the unit tests assert, so the four widths cannot drift from one another
or from the ruling.

Where a value does **not** vary — §23's spans at 1440 — it stays inline and the
wide blocks override it with `!important`. That is deliberate: moving §23's
spans into CSS would make every width restate them, which is the same
duplication problem pointing the other way.

**The suggestion for the targets:** when a section makes an existing quantity
depend on the viewport, it is worth saying so explicitly — "this was fixed and
is now a function of width" — because the build's copy of that quantity is
usually somewhere the new section never mentions. §30 naming the 1440 cap as
"never ruled, and withdrawn here" is exactly the sentence that made instance 2
findable; §28 had no equivalent sentence about the region's placements, and
instance 1 cost a full measurement pass to find.

## Related, same class

§29's "the drawn instance read as a rule" is the same failure with a different
carrier: a figure that was only ever one drawing (`r 150`) read as a spec. §29
records it as its third occurrence and rules that "wherever a drawing shows a
figure, the section governing it must state whether the figure is ruled or
only drawn." **The inline-value pattern wants the equivalent sentence for
quantities that change from fixed to width-dependent.**
