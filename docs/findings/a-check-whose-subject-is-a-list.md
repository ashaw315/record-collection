# A check whose subject is a list

**The shape.** A check is written over the things its author expected to find, and the thing that breaks is outside that set. The check runs, comes back empty, and the empty result is read as "not there" when it means "not looked for".

**Three instances in one day, in three different layers, on one page:**

| the check | its subject was | what was outside it |
|---|---|---|
| Adam's QA at 1440 and 1439 | two named viewports | every width between 390 and 1438, where the fork collapse was broken |
| the width sweep, 390–1920 | width, at one height (900) | the height axis, which §30's band rule takes as an input above 1440 |
| the ornament hit test over 17 ids × 7 widths | `[data-ornament]` — the four marks the author knew about | `provenanceArc` and `aboutArc`, §5.1 marks with a fill and no such attribute, one of which was sitting in front of PROVENANCE at 1000 on every record |

The third is the clearest. The test asked "is any ornament in front of type?", enumerated ornaments by a selector, re-enabled pointer events on those so `elementFromPoint` could see them, and reported "text on top in every overlap" — a true statement about the set, and the set did not contain the element on top. Adam inspected the element in his browser; the probe could not have, because it never had it to find.

**The general form.** Enumerate by what a thing IS, never by a list of what you expect to find. A mark over type is *an element that paints a fill and carries no text*; that predicate finds the arcs, the section bars, the cover, the matrix solid and the sleeve marks as well as the four flats and figures — twelve kinds at 1440, where the list had four. A viewport is a width AND a height; a rule with two inputs is swept on both. "The page at the fork" is every width, not the two either side of it.

**How to tell you are inside it.** The subject of the check appears in the code as a literal: a selector, an array of names, two numbers. If the thing that broke could exist without changing that literal, the check was blind to it by construction. The fix is to replace the literal with the property — the CSS the browser actually paints, the axis the rule actually reads — and to print what the enumeration found, so a reader can see the set the claim was made on.

**Where it lives now.** `e2e/qa-real17.spec.ts` enumerates paint by fill-and-no-text and prints the kinds it found per width; the layout sweep gains the height axis. The earlier "text on top of every ornament" numbers stand only for the four `[data-ornament]` kinds.

Related: [a-reachable-signal-is-not-the-claim](a-reachable-signal-is-not-the-claim.md), [a-probe-that-is-not-the-element](a-probe-that-is-not-the-element.md).
