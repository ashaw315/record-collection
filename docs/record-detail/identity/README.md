# The identity cell at four real title lengths

`title-lengths-1440.png` — 8a's identity cell at its real dimensions: 480px
wide (4 of 12 at 1440), a 412px text measure, `font: 800 72px/0.94`, inside the
500px band. Four real titles from the collection.

## What it measured

| title | chars | lines | title block | + pressing | needed | vs 500 |
|---|---|---|---|---|---|---|
| On The Radio: Greatest Hits Vol. 1 & 2 | 38 | **5** | 378 | 84 | **498** | **−2** |
| The Best Of The Blues Project | 29 | 3 | 243 | 84 | 363 | −137 |
| The Hurdy Gurdy Man | 19 | 2 | 175 | 84 | 295 | −205 |
| Meddle | 6 | 1 | 108 | 84 | 227 | −273 |

**Two corrections to 8a §7, in opposite directions.** It says the 38-character
title "would take three" lines — it takes **five**. But its conclusion is wrong:
it does **not** overflow. 498 of 500.

Distribution across the collection: **8 titles at one line, 6 at two, 2 at
three, 1 at five.** The five-line case is one record, and it is the same record
that is worst on every other axis — no price history, six absent fields, the
most chromatic cover.

## What was decided

No clamp. Every clamp option paid real characters of a record's name for a
problem correctness does not have, and the fault was the **break** rather than
the length: an orphaned volume number reads as a rendering error, not as a long
title.

- `text-wrap: balance` and `hyphens: none`. Measured line widths:
  **[235, 206, 283, 270, 141]** with balance, **[235, 206, 283, 365, 43]**
  without — the 43px orphan. Same 338px height either way, so where the property
  is unsupported the title looks worse and nothing overflows.
- **The 2px is not treated as margin.** The pressing block anchors to the cell
  floor and the title flows from the top, so neither can push the other:
  overflow spends the gap between them. An overflow risk becomes an overlap that
  cannot happen.
- The wider cell was refused on the construction's behalf — spread and the 6:1
  size band are what give the construction something to read, so columns are the
  one thing whose value depends on room.

Asserted in `e2e/identity-cell.spec.ts`: the anchor at all four lengths (the
property), and the break (the decision). Not the 498, which would pass on a
coincidence.
