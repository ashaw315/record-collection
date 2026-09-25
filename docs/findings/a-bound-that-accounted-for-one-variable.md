# A bound that accounted for one of two variables

**The claim.** Four real Abouts could not be rendered, so length-matched
stand-ins were rendered instead, and the counts were reported as a floor:
"the real counts can only be equal or higher", because the stand-ins had no
paragraph breaks and every break costs a line.

**The measurement.** Adam rendered the real texts.

| title | real chars | real lines | stand-in chars | stand-in lines |
|---|---|---|---|---|
| Gaucho | 555 | **10** | 552 | **11** |

More characters, fewer lines. The floor did not hold on the first text that
could test it.

**Why.** Rendered line count has two inputs: how much text there is, and
where its words break against the measure. The floor argument controlled the
first and forgot the second. A text of shorter words, or words that happen to
fill lines nearly to the margin, sets tighter than a text of the same length
whose breaks fall awkwardly. Paragraph breaks can only add lines; word breaks
can go either way. So "only breaks could raise the count" was true and
incomplete: the count could also *fall*, and the stand-in was above the real
text, not below it.

**The rule.** A bound is a claim about every input, and stating one means
listing the inputs first. If a quantity depends on something the stand-in
does not reproduce, the stand-in gives an *example*, not a bound, and it
should be reported as one. Here the honest line was: "a stand-in of this
length renders to 11; the real text will differ by its word breaks in either
direction."

The measurement supersedes the estimate, which is the right outcome. What
this records is that the estimate was labelled with more authority than it
had, in the direction of certainty, and that labelling is the part to stop.

Related: [a right number about the wrong record](./a-right-number-about-the-wrong-record.md)
— that one was the right statistic over the wrong rows; this one was a
correct example presented as a limit.
