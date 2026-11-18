# pick-reasons-300 · the layout's tolerance of a reason of 305 characters against the approved 108, one capture per host (the coordinator, 18 Nov), captured 2026-11-18

**Every record is seeded and every reply is stubbed; the reasons are this capture's sentences, not the model's.** The pick's schema puts no
bound on a reason, and Adam approved 3a against reasons of 91 to 108 characters. Each host is captured twice: at 108 characters, the longest
reason he approved, and at 305, about three times that, given to every answer so the five-cell hosts show five stacked. Measured on the
page, not read off the picture: the reason's lines are its height over its line height; the host is the cell (`[data-pick-answer]`) or the
pulled record's panel; "runs wider" is the text's scroll width past its box; "clipped by" names the nearest ancestor with a hiding overflow
whose box does not contain the reason; "in view" is the reason's bottom inside the window with no scrolling, which the sidebars' stacks
of five fail at either length, so the comparison between the two states is the finding there. From the production build locally (E2E_SERVER=build).

| host | window | state | reason chars | lines | reason height | host height | runs wider | clipped by | in view | file |
|---|---|---|---|---|---|---|---|---|---|---|
| the shelf: the pulled record’s facts | 1440 × 900 | approved | 108 | 2 | 40.3 | 257.3 | no | no | yes: bottom 407 in a window 900 tall | approved-shelf-1440x900.png |
| the far view’s column host: the count column’s cell | 1440 × 900 | approved | 108 | 5 | 97.5 | 399 | no | no | yes: bottom 619 in a window 900 tall | approved-far-column-1440x900.png |
| the far view’s column host: the count column’s cell | 1440 × 768 | approved | 108 | 5 | 97.5 | 399 | no | no | yes: bottom 619 in a window 768 tall | approved-far-column-1440x768.png |
| the far view’s band host: the cells beneath the control | 1044 × 900 | approved | 108 | 5 | 97.5 | 399 to 399 (5 cells) | no | no | yes: bottom 745, 745, 745, 745, 745 in a window 900 tall | approved-far-band-1044x900.png |
| the far view’s band host: the cells beneath the control | 1044 × 768 | approved | 108 | 5 | 97.5 | 399 to 399 (5 cells) | no | no | yes: bottom 745, 745, 745, 745, 745 in a window 768 tall | approved-far-band-1044x768.png |
| the table’s sidebar: five cells | 1440 × 900 | approved | 108 | 5 | 97.5 | 399 to 399 (5 cells) | no | no | no, reached by scrolling: bottom 1150, 1567, 1984, 2401, 2818 in a window 900 tall | approved-table-1440x900.png |
| the grid’s sidebar: five cells | 1440 × 900 | approved | 108 | 5 | 97.5 | 399 to 399 (5 cells) | no | no | no, reached by scrolling: bottom 1150, 1567, 1984, 2401, 2818 in a window 900 tall | approved-grid-1440x900.png |
| the shelf: the pulled record’s facts | 1440 × 900 | long | 305 | 5 | 100.7 | 317.7 | no | no | yes: bottom 468 in a window 900 tall | long-shelf-1440x900.png |
| the far view’s column host: the count column’s cell | 1440 × 900 | long | 305 | 12 | 234 | 535.5 | no | no | yes: bottom 756 in a window 900 tall | long-far-column-1440x900.png |
| the far view’s column host: the count column’s cell | 1440 × 768 | long | 305 | 12 | 234 | 535.5 | no | no | yes: bottom 756 in a window 768 tall | long-far-column-1440x768.png |
| the far view’s band host: the cells beneath the control | 1044 × 900 | long | 305 | 12 | 234 | 535.5 to 535.5 (5 cells) | no | no | yes: bottom 881, 881, 881, 881, 881 in a window 900 tall | long-far-band-1044x900.png |
| the far view’s band host: the cells beneath the control | 1044 × 768 | long | 305 | 12 | 234 | 535.5 to 535.5 (5 cells) | no | no | no, reached by scrolling: bottom 881, 881, 881, 881, 881 in a window 768 tall | long-far-band-1044x768.png |
| the table’s sidebar: five cells | 1440 × 900 | long | 305 | 12 | 234 | 535.5 to 535.5 (5 cells) | no | no | no, reached by scrolling: bottom 1287, 1840, 2394, 2947, 3501 in a window 900 tall | long-table-1440x900.png |
| the grid’s sidebar: five cells | 1440 × 900 | long | 305 | 12 | 234 | 535.5 to 535.5 (5 cells) | no | no | no, reached by scrolling: bottom 1287, 1840, 2394, 2947, 3501 in a window 900 tall | long-grid-1440x900.png |
| the table’s band, a coarse pointer: five cells | 390 × 844 | approved | 108 | 5 | 97.5 | 399 to 399 (5 cells) | no | no | no, reached by scrolling: bottom 1071, 1071, 1488, 1488, 1905 in a window 844 tall | approved-table-390x844.png |
| the grid’s band, a coarse pointer: five cells | 390 × 844 | approved | 108 | 5 | 97.5 | 399 to 399 (5 cells) | no | no | no, reached by scrolling: bottom 1071, 1071, 1488, 1488, 1905 in a window 844 tall | approved-grid-390x844.png |
| the table’s band, a coarse pointer: five cells | 390 × 844 | long | 305 | 12 | 234 | 535.5 to 535.5 (5 cells) | no | no | no, reached by scrolling: bottom 1208, 1208, 1761, 1761, 2315 in a window 844 tall | long-table-390x844.png |
| the grid’s band, a coarse pointer: five cells | 390 × 844 | long | 305 | 12 | 234 | 535.5 to 535.5 (5 cells) | no | no | no, reached by scrolling: bottom 1208, 1208, 1761, 1761, 2315 in a window 844 tall | long-grid-390x844.png |

## The growth, approved → long

| host | window | lines | host height | grows by |
|---|---|---|---|---|
| the shelf: the pulled record’s facts | 1440 × 900 | 2 → 5 | 257.3 → 317.7 | 60.4 |
| the far view’s column host: the count column’s cell | 1440 × 900 | 5 → 12 | 399 → 535.5 | 136.5 |
| the far view’s column host: the count column’s cell | 1440 × 768 | 5 → 12 | 399 → 535.5 | 136.5 |
| the far view’s band host: the cells beneath the control | 1044 × 900 | 5 → 12 | 399 → 535.5 | 136.5 |
| the far view’s band host: the cells beneath the control | 1044 × 768 | 5 → 12 | 399 → 535.5 | 136.5 |
| the table’s sidebar: five cells | 1440 × 900 | 5 → 12 | 399 → 535.5 | 136.5 |
| the grid’s sidebar: five cells | 1440 × 900 | 5 → 12 | 399 → 535.5 | 136.5 |
| the table’s band, a coarse pointer: five cells | 390 × 844 | 5 → 12 | 399 → 535.5 | 136.5 |
| the grid’s band, a coarse pointer: five cells | 390 × 844 | 5 → 12 | 399 → 535.5 | 136.5 |

A long row that reads no, no and the same in-view answer as its approved row is the layout growing and wrapping whole; anything else is the
number the coordinator asked for.

