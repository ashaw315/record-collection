# Focusable elements per route, at 390 and 1280

The test database, desktop Chromium, each route as it opens with nothing pressed. Counted: links with an href, buttons, fields, selects, text areas and anything with a tabindex other than −1, not disabled, with a box on the page; the dev overlay left out. A count for costing the focus-ring check, not a measurement of the ring.

| route | 390 | 1280 |
|---|---|---|
| / | 29 | 33 |
| /lookup | 15 | 19 |
| /manage | 27 | 70 |
| /records/new | 34 | 38 |
| /stats | 9 | 13 |
| /suggestions | 4 | 8 |
| /want-list | 10 | 14 |
| /want-list/new | 14 | 18 |
| /records/[id] | 12 | 16 |
| /records/[id]/edit | 34 | 38 |
| /want-list/[id] | 4 | 8 |
| /want-list/[id]/edit | 14 | 18 |
| /login | 2 | 2 |
| **total, 13 routes** | **208** | **295** |
