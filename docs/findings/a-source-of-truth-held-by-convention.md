# A source of truth held together by convention

**The instance.** `WITHDRAWALS.md`'s bullets became the withdrawal list's
source of truth, with the machine-readable comment derived from them. The
first parser was written from the bullet format as remembered from an earlier
drop. Design had since changed the format. The parser matched **0 of 33**
bullets, returned an empty list, and the derivation wrote an empty comment
into the file — `rewrote: 0 entries` — without an error. Every assertion
then failed, which is the only reason it was noticed.

Three more things about the same file, found by reading every bullet raw:
`what` is capitalised in 32 of 33 and ends with a period in all 33, where the
retired comment had neither; one entry uses a straight apostrophe where four
use a curly one; three entries carry a colon or a second period inside
`what`, which a "first period ends the field" grammar truncates.

**The shape.** A source of truth that has never been specified is held
together by whatever its current author happens to do. It parses today. The
next author, or the same author next week, does something equally reasonable
and different, and the parser either drops entries silently or truncates
fields silently — the two failures that look most like success.

**The rule.** When something becomes the source of truth, write its grammar
down at that moment, in the spec, with the awkward instances as test cases —
the colon inside a field, the inner period, the two apostrophes. Then make
the parser refuse what it cannot read, loudly, with the line number: an entry
that cannot be parsed is a defect to name, never a row to skip. And make the
derived artefact compare against its source on every run, so a stale or
hand-edited copy is named rather than trusted.

The parser that drops silently and the assertion that passes on an empty set
are the same defect: both turn "I could not read this" into "there was
nothing here".

Related: [a check that reports nothing has not run](../design/ASSERTIONS-spec.md)
— the spec's own rule, which this is the parser-side twin of.
