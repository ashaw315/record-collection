# A35 — §10b: the wall is as tall as its contents, and A24d is satisfied by the count

Amends the four-shelf-minimum rule and A24d in §10b (SPEC.md ~L980–988).

**Why this amendment exists.** The wall reserved a four-row minimum however few records
matched — "a room has a size" — so a filtered result sat above rows of empty shelf, meant
to say *these are the ones that matched*. Judged on both screens with the real collection it
did not earn its place:

- At 390px the empty rows stretched the canvas and pushed the pulled record to odd positions.
- At 1280 they were two empty shelves saying in furniture what a count says in words.

**What changed.**

1. The wall is now exactly the rows its records fill — `rowCount = row + 1`, no
   `Math.max(..., MIN_SHELF_ROWS)`. A small result is a short wall; a large one grows as
   before. `MIN_SHELF_ROWS` is deleted.

2. The "most of the collection is hidden" signal moves to the collection heading: it states
   **"N of M records"** whenever a filter is active (`collectionCountLabel`, fed by the
   filtered `listRecords` total and an unfiltered `countAllRecords`). Unfiltered it is the
   plain "M records" as before.

3. **A24d is re-satisfied by the count** rather than by the room's size. The gaps rule wanted
   a filtered wall to keep its shape rather than repack; the four-shelf room was the first
   simplification of the position-holding mechanism, and the count is the second and better
   one — the numeric answer stated plainly, in the one place that always knows both numbers,
   instead of implied in empty shelf.

**What did NOT change.** The last row is still usually partial and its shelf still runs edge
to edge (the surface ends where the wall ends, not where the records do). Spine height is
unchanged. The pulled record's placement is unaffected — it settles at the visible viewport
centre from any row (proven: top/mid/bottom/filtered at 390 and 1280 all land at delta 0px).

**Tests.** `collection-count.test.ts` (the label), `count-all-records.test.ts` (the
unfiltered total), `wall-layout.test.ts` (as-tall-as-contents, single-row-is-single-shelf,
grows, partial-last-row full-width), and the inverted E2E `wall-scene.spec.ts` "the wall is
as tall as its CONTENTS". Stale four-row comments across the E2E and unit tests were corrected
in the same unit rather than left asserting a removed mechanism.
