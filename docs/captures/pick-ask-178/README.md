# pick-ask-178 · the ask field in every host (§P.2, §P.4, §P.5, §P.6; step 178), captured 2026-11-12

**Every record in these captures is seeded, and no figure here describes the collection.** The test environment has no
provider key, so the vectors are the test environment's stub model (a bag of words, `src/lib/openai/stub-embedding.ts`),
and the records are this capture's ten (five about late-night jazz, five about punk) under an artist filter, not Adam's
55. The file names say `seeded-` first for that reason (the coordinator, 12 Nov, on §55's lesson: a capture is a figure
with a picture attached).

From the build (E2E_SERVER=build). Three states per host: the field empty; the phrase "late night jazz" asked; a record's
own title asked, which asks from that record and leaves it out. Where the answer is covers, the page is captured in full.

| host | window | files |
|---|---|---|
| the shelf's rail (the first answer pulled) | 1440 × 900, a fine pointer | seeded-shelf-1440-{empty,phrase,title}.png |
| the far view's rail as a column (the first answer's cell in the count column) | 1440 × 900 | seeded-far-view-1440-{empty,phrase,title}.png |
| the far view's rail as a band (the covers in a row beneath the control) | 1273 × 900 | seeded-far-band-1273-{empty,phrase,title}.png |
| the table's sidebar (a column of five) | 1440 × 900 | seeded-table-1440-{empty,phrase,title}.png |
| the grid's sidebar (a column of five) | 1440 × 900 | seeded-grid-1440-{empty,phrase,title}.png |
| the table's band (a wrapped row) | 390 × 844, a coarse pointer | seeded-table-390-{empty,phrase,title}.png |
| the grid's band (a wrapped row) | 390 × 844, a coarse pointer | seeded-grid-390-{empty,phrase,title}.png |

Three answers on the shelf and five elsewhere; a wrapped row where the control draws as a band and a column where it
draws as a column (the two proposals, accepted by the coordinator, 12 Nov). §P.4's "provisional until built and captured
in every host" returns on these.
