# A rule stated twice is stated once incompletely

**Finding for Design. The handoff already names this hazard between a row and
its section; this is the same hazard occurring INSIDE a section, where no
preamble warns anyone.**

## The instance

§26 states where the tint triangle goes, twice.

**As placement, with the bleed:**

> "The left page edge is made, not found: the last row is ordered air first...
> **The tint triangle bleeds off the left edge in that column**; the base
> quarter-disc bleeds off the right edge beside About this record."

**As value assignment, without it:**

> "Weight lightens down the page... Base goes to the quarter-disc on the right
> beside About this record, and **tint to the triangle on the left edge in the
> last row**."

The second is not wrong. It is about which ladder step each flat takes, and it
names the position in passing. But it omits the clause that makes the
placement a *bleed* rather than an inset — and read alone, it describes a
triangle sitting at the left edge of its column, which is exactly what the
build did.

**I built from the second and reported the first as an open question.** The
rule was settled; I had read the incomplete statement of it.

## Why this is worse than an outright contradiction

A contradiction is loud. Two sentences that disagree get noticed, argued
about, and resolved.

**A partial restatement is silent.** Both sentences are true. Neither
contradicts the other. A reader who finds either one has no signal that a
fuller version exists elsewhere in the same section — and the more natural
place to look for "where does the triangle go" is the *value* paragraph,
because it names both flats side by side and reads like a summary.

The failure mode is specific: **the incomplete statement reads as complete**,
because nothing in it is missing on its face. Only comparison reveals the gap.

## The handoff already names this hazard one level up

> "A row can omit a clause without contradicting its section, so a claim that
> a section does NOT say something must be checked against the section
> itself."

That preamble exists because the index's rows summarise sections and can drop
clauses. **Inside a section there is no such preamble**, and no equivalent
instruction to check whether a second statement of the same rule is fuller.

## What would remove it

Three options, in rough order of cost:

1. **State each rule once, and cross-reference rather than restate.** The
   value paragraph could say "tint to the triangle (placed above)" instead of
   re-describing its position.
2. **Where a restatement is wanted for readability, make it complete** — "tint
   to the triangle bleeding off the left edge in the last row" costs four
   words and closes the gap.
3. **Mark the authoritative statement**, the way withdrawals are now marked,
   so a build can tell which of two statements governs. This is the most work
   and the most general.

The first two are editorial. The third is the same move as
`data-withdrawn-by`: making a distinction machine-visible rather than relying
on every reader noticing it.

## Related

- `two-writers-one-file.md` — a reversion invisible to review because the
  prose comes back byte-identical.
- `choose-the-quantity-that-can-be-wrong.md` — an assertion that cannot fail
  because the quantity it reads cannot move.

All three share a shape: **the defect is invisible from the position of the
person who would catch it.** Here, a reader of either sentence sees a complete
rule.
