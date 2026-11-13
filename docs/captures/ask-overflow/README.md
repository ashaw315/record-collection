# ask-overflow · the ask field with a phrase longer than it, in every host (13 Nov)

For Design's ruling on §P.5's "its width is the host's", after Adam typed a phrase into the shelf's rail and it scrolled
out of sight. Nothing is built for it; this is the specimen. From a build (E2E_SERVER=build), the tool
`e2e/capture/ask-overflow.capture.ts`.

**The phrase** is "something slow and warm for a rainy sunday morning" (50 characters), typed and not asked. Code was
not shown Adam's phrase; this one is of the same kind. **The records are seeded** (the test environment's seventeen and
this tool's three), so "18 have no About." is the seed's count, not the collection's 2.

Each host twice: `-typing` (focused, the caret at the end, so the field shows the phrase's tail) and `-left` (after
leaving the field, which shows its head). Each has a crop of the control with 24 round it and a `-window` picture of
the whole window.

| host | window | field's content box | the phrase | in view |
|---|---|---|---|---|
| the shelf's rail, a column | 1440 × 900 | 112 | 365.3 | 31% |
| the far view's rail, a column | 1440 × 900 | 112 | 365.3 | 31% |
| the far view's rail, a band | 1273 × 900 | 1237 | 365.3 | all |
| the table's sidebar | 1440 × 900 | 300 | 365.3 | 82% |
| the grid's sidebar | 1440 × 900 | 300 | 365.3 | 82% |
| the table's band | 390 × 844, coarse pointer | 354 | 365.3 | 97% |
| the grid's band | 390 × 844, coarse pointer | 354 | 365.3 | 97% |

The phrase's width is measured in the field's own font. `figures-1440.json` and `figures-390.json` hold the same figures.

**Three hosts overflow with this phrase, not one.** The rail as a column shows under a third of it. The sidebar loses
the last fifth. At 390 the band loses 11px, about the first letter. Only the far view's band holds it all.
