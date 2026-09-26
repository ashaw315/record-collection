# A fixture that fills every field cannot test an empty one

**The shape.** The fixture the layout tests render is "rich": every field populated, so every cell has content and every mark has something to sit beside. It exercises the layout of a full record. The collection is not full records. Of Adam's seventeen, four have an About, two have a journal entry, and **twelve have neither** — their last cell is empty, and the empty state is the one the rich fixture cannot reach.

**What it hid.** §6 rules the empty cell: "Label persists, one diagonal fills the body box." The diagonal was drawn `absolute inset-0` of the *cell*, so its line crossed the label. Every sweep — 1531 widths, six heights, 119 record-width pairs — passed "no paint in front of type" at 0, because the record under test had an About, and the diagonal never rendered. The seventeen "real ids" did not help either: they were seeded with a journal entry on every row, which is the second way to fill the cell. The first render of the real rows, with their real About and entry fields, found it on twelve of seventeen.

**The same fixture had already misled once this round.** §34's survivor count — "aboutArc is drawn on the thirteen that do not have an About" — was true of the stand-ins, whose thirteen carried an entry each, and false of the collection, where one of the thirteen does. A count taken on a fixture is a count of the fixture.

**The general form.** A layout assertion is only as wide as the states its fixture reaches. Fields have at least three states — populated, empty, absent — and a fixture that fills them all tests one. The fix is not a second rich fixture; it is rendering the collection's own rows (`docs/captures/real-records.json`, a read-only query's output: id, title, About, entries) so the distribution of states is the real one, and saying which fields are real and which are stand-ins on every line that prints a count. Where a state exists in the collection and no fixture reaches it, the assertion has not run on it, whatever its colour.

**Where it lives now.** `e2e/real-records-paint.spec.ts` seeds the real rows and prints `STEP 32 UNEXECUTABLE` rather than measuring stand-ins when the file is absent; `EmptyMark` is in flow after the label and fills the body box; the 17-id test asserts no diagonal over type.

Related: [a-check-whose-subject-is-a-list](a-check-whose-subject-is-a-list.md), [a-right-number-about-the-wrong-record](a-right-number-about-the-wrong-record.md).
