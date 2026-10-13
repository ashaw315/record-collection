## HANDOFF-wall-and-pull.md (1 added, 2 reworded, 1 removed)

- removed: Assertion 8 has two parts, so a run reports eleven ids: 0 through 7, 8a, 8b and 9.
- was: Apply §M.6's outside ring, 2px ink offset 2, to every focusable control on every route, and its inside ring where a container clips the control's box, replacing the shared components' grey ring and the browser's default on the raw controls.
- now: Apply §M.6's outside ring, 2px ink offset 2, to every focusable control on every route outside the wall's spines and run, which keep §W.33's and §W.30's marks, and its inside ring where a container clips the control's box; take the rail's hidden Apply out of the tab order, keeping Enter's submit; read the pulled state's focusable controls and report the set per state before building the wall's part; replacing the shared components' grey ring and the browser's default on the raw controls.
- was: So the check is mechanical: ten assertions, numbered 0 to 9, run against all three targets, by the script specified in `scripts/ASSERTIONS-spec.md`, which is Code’s and lives only in the repo.
- now: So the check is mechanical: assertions numbered from 0, run against every target input, by the script specified in `scripts/ASSERTIONS-spec.md`, which is Code’s and lives only in the repo.

### Maintaining this file › Every numbered section in either target must have a row above.

- The script reports its own ids and count in its RESULT line, and that line, not this sentence, is the count; a number here would go stale as the script grows.

## Wall and Pull - build target.dc.html (4 added, 0 reworded, 0 removed)


### W.31 · Which lines the page carries › Two weights, and the drawings have been corrected to it rather than the rule bent to them: 1px for every rule on this page, 2px reserved for §3’s non-type marks — §W.30’s focus edge, the journal edge, and the rail’s set bar.

- Withdrawn within §W.31: 2px reserved for §W.30’s focus edge, the journal edge and the rail’s set bar, which leaves out the focus ring.
- §T.6 puts §M.6’s 2px ring on every focusable control, the rail’s included, so 2px now marks focus wherever it lands, and the list names one focus mark of two.
- The two weights stand: 1px for rules, 2px for non-type marks, focus among them.
- It was built against, so the entry is owed.

## Table and Grid - build target.dc.html (13 added, 1 reworded, 0 removed)

- was: Every focusable control in the app shows §M.6’s outside ring when it has keyboard focus, a 2px ink outline offset 2 outside its box, and nothing else: the shared components’ grey ring and the browser’s default outline are defects wherever they appear.
- now: Every focusable control in the app outside the wall’s drawn composition shows §M.6’s outside ring when it has keyboard focus, a 2px ink outline offset 2 outside its box, and nothing else: the shared components’ grey ring and the browser’s default outline are defects wherever they appear.

### T.4 · The table › The header row stays at the top of the viewport while the table scrolls.

- Withdrawn within §T.4: the table’s focus ring drawn inside the row.
- The table clips nothing, so by §T.6 its controls take the outside ring.
- The sentence was carried from 5d123ee, so the entry is owed.

### T.6 · Ornament and colour, for every screen › Focus, once for the app.

- It is stated as a rule because it is one, but only the cover has been counted.
- Code counts the controls in clipping containers during the ring step, and if there are several, this becomes a second rule.
- Withdrawn within §T.6: §M.6’s ring on every focusable control in the app, the wall’s drawn composition included.
- The 13:52 and 15:01 drops carried it unscoped, and Code took both, so the entry is owed.
- The app has four focus treatments: §M.6’s outside ring on every focusable control outside the wall’s drawn composition; §M.6’s inside ring where a container clips the control’s box; on the wall, as the shelf opens, each spine’s §W.33 mark, the sink and an ink mark on its top face; and in the overview, the run’s §W.30 edge, the sink and a 2px rule along its front edge.
- Spines and run are drawing, not boxed controls, and a ring around them would cut across their neighbours, the class §T.1 already exempts.
- Which controls each reaches is a set per state, as the shelf opens, in the overview, and with a record pulled.
- It is written here once Code has read the pulled state, and not before.
- The rail’s hidden one-pixel Apply is not a stop for Tab: it leaves the tab order, and Enter in the search field still submits.
- A keyboard reader must never land on a control that shows nothing, so the ring has nothing to draw there.

## WITHDRAWALS.md (8 added, 0 reworded, 0 removed)


### The wall › `W.13/search-34`

- `W.31/two-px-list`: §W.31, withdrawn by §T.6. 2px reserved for three named marks, which leaves out the app-wide focus ring.
- Withdrawn within §W.31: 2px reserved for §W.30’s focus edge, the journal edge and the rail’s set bar, which leaves out the focus ring.

### The table and grid

- `T.4/focus-inside-row`: §T.4, withdrawn by §T.6.
- The table's ring drawn inside the row; it takes the outside ring.
- Withdrawn within §T.4: the table’s focus ring drawn inside the row.
- `T.6/ring-every-control`: §T.6, withdrawn by §T.6.
- §M.6's ring on every focusable control, carried at 13:52 and 15:01; the wall's spines and run keep their own marks.
- Withdrawn within §T.6: §M.6’s ring on every focusable control in the app, the wall’s drawn composition included.
