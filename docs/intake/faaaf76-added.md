## HANDOFF-wall-and-pull.md (0 added, 1 reworded, 0 removed)

- was: Apply §M.6's outside ring, 2px ink offset 2, to every focusable control on every route outside the wall's spines and run, which keep §W.33's and §W.30's marks, and its inside ring where a container clips the control's box; take the rail's hidden Apply out of the tab order, keeping Enter's submit; walk Tab through the wall in all three states and report the counts, expected 31, 15 and 33 once the Apply has left the order, failing if the Apply is still reached; replacing the shared components' grey ring and the browser's default on the raw controls.
- now: Apply §M.6's outside ring, 2px ink offset 2, to every focusable control on every route outside the wall's spines and run, which keep §W.33's and §W.30's marks, and its inside ring where a container clips the control's box; take the rail's hidden Apply out of the tab order, keeping Enter's submit; walk Tab through the wall in all three states and pin the counts as 31, 15, and 33 plus the arrows drawn, failing if the Apply is still reached; remove the spines' positive tab index so Tab runs header, rail, then content, and test that search is reached before any spine; replacing the shared components' grey ring and the browser's default on the raw controls.

## Table and Grid - build target.dc.html (15 added, 2 reworded, 4 removed)

- removed: It is stated as a rule because it is one, but only the cover has been counted.
- removed: Code counts the controls in clipping containers during the ring step, and if there are several, this becomes a second rule.
- removed: Today’s build has 32, 16 and 34.
- removed: The ring step’s Tab walk counts them for real and pins the measured figures here, and a walk that finds the Apply still in the order fails rather than leaving these figures quietly wrong.
- was: On the wall the outside ring reaches the header’s six links, the rail’s seven visible controls, the count’s zoom-out and, with a record pulled, the panel’s link, TURN OVER and PUT BACK; the spine’s mark reaches every focusable spine; the run’s edge reaches the run.
- now: On the wall the outside ring reaches the header’s six links, the rail’s seven visible controls, the count’s zoom-out and, with a record pulled, the panel’s link, TURN OVER, PUT BACK and §W.9’s arrows wherever they are drawn; the spine’s mark reaches every focusable spine; the run’s edge reaches the run.
- was: The hidden Apply is out of the tab order as ruled above, so once the ring step has built that, the counts are expected to be 31 as the shelf opens, 15 in the overview and 33 with a record pulled.
- now: The hidden Apply is out of the tab order as ruled above, so once the ring step has built that, the counts are 31 as the shelf opens and 15 in the overview, both measured by the ring step’s Tab walk.

### T.6 · Ornament and colour, for every screen › Focus, once for the app.

- Code’s count found 14 clipped stops in three places: the record page’s cover, the filter panel’s option rows, which step 113 already gave the inside ring, and stats’ genre names, clipped by an ellipsis wrapper.
- An earlier sentence here said only the cover had been counted, and it was already out of date.
- The stats names wait on Code’s costing of the wrapper.
- If removing the clip is cheap, they take the outside ring and no exception reaches them.
- The filter rows keep the inside ring, but whether two bands read right on text is reopened, ruled from the ring step’s capture.
- With a record pulled the count is 33 plus the arrows drawn, so it is 34 for a first or last record and 35 for one in the middle.
- A walk that finds the Apply still in the order fails.
- The 33 I confirmed came from a reading taken before the pull settled, before any arrow was drawn.
- It is stated as the formula, as the source rule is, because it differs by record.
- Tab follows the page’s order on every screen: header, then the rail or sidebar, then content.
- No control carries a positive tab index.
- The wall’s spines are content, so they follow the chrome.
- As built, a positive index on each spine put all seventeen ahead of the header, so reaching search took eighteen Tabs, one more for each record.
- Unless Code finds a ruling that requires the spine sequence, that is a defect against the page’s order and not a choice.
- Arrow keys still move between spines within the run, as §W rules the keyboard.
