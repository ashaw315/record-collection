# pick-reasons-3a · every answer's reason, the consolation labelled, in every host (§P.2; step 3, unit 3a), captured 2026-11-18

**Every record in these captures is seeded and every reply is stubbed; no figure here describes the collection or the model.** The test
environment has no provider key and the pick's latch is the whole collection's, so `/api/ask` is answered by the capture itself, and the
reasons are the capture's sentences, not the model's. From the production build locally (E2E_SERVER=build).

The five reasons are 108, 96, 99, 93, 91 characters (91 to 108); the consolation's is 101. The seeded
titles are 82 characters each and the artist 47, against the collection's longest title of 74 and longest artist of 31
(read from production, 17 Nov), so every caption here is longer than any real one.

| host | window | state | file |
|---|---|---|---|
| the shelf: the answer pulled, its reason in the pulled record's facts | 1440 × 900 | answer, consolation | seeded-shelf-1440x900-{answer,consolation}.png |
| the far view's column host: the first answer's cell in the count column (its five are unit 3b's) | 1440 × 900 and 1440 × 768 | answer, consolation | seeded-far-column-1440x{900,768}-{answer,consolation}.png |
| the table's sidebar: five cells, each with its reason | 1440 × 900 | answer, consolation | seeded-table-1440x900-{answer,consolation}.png |
| the grid's sidebar | 1440 × 900 | answer, consolation | seeded-grid-1440x900-{answer,consolation}.png |
| the table's band, a coarse pointer | 390 × 844 | answer, consolation | seeded-table-390x844-{answer,consolation}.png |
| the grid's band, a coarse pointer | 390 × 844 | answer, consolation | seeded-grid-390x844-{answer,consolation}.png |

The consolation state is a nothing-fits reply with one stand-in: the slot says "Nothing fits.", and the one record is labelled "Closest
available" (Proposed) above its cover in a cell and above its reason in the pulled record's facts.

## Five presses on the grid at 390, timed on the page's clock

From the press on ASK to the five reasons redrawn (a MutationObserver on the reasons' text), each reply rotating the order so every press
redraws five cells. The stub answers at once, so these are the page's own times, with no model and no network in them. Load is the
machine's one-minute average at each press.

| press | press → five reasons drawn (ms) | load |
|---|---|---|
| 1 | 13.2 | 4.19 |
| 2 | 12.6 | 4.19 |
| 3 | 11.3 | 4.19 |
| 4 | 11.8 | 4.19 |
| 5 | 11.6 | 4.19 |

The reason's place in each host, its length and how it reads are provisional (§P.2), for Adam to judge on these.

