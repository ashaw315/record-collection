# Withdrawals

The withdrawal list for all three targets: the two record-detail targets and the wall. **Nothing is written into a target to mark a withdrawal:** each entry quotes its withdrawal sentence verbatim from the section it withdraws in, and the index script checks the quote is there.

**One edit, one author.** Claude writes a withdrawal sentence and its entry here in the same edit. If a withdrawal sentence is later rewritten, its entry fails and names itself; re-quote it in the same edit.

`id` · `s` (the section withdrawn in) · `by` (the replacing section) · `what` · `quote`

**One source: the entries listed above are authored, and the machine-readable comment is derived from them by Code's script.** Nobody edits the comment. This file ships with no comment at all; the script inserts it in the repo and fails if it disagrees with the list, so no stale copy can arrive in an export.

- **`2.1/corner-reserve`**: §2.1, withdrawn by §28. Corner reserve.
  > Superseded by §28 on the reserve: the identity cell has no corner field, so the arithmetic below that spends one no longer describes the cell.
- **`4.1/inventory-counts`**: §4.1, withdrawn by §33. Inventory as per-record counts at 72.
  > Superseded by §33 on the counts: the title and artist sizes now vary by record over §33’s step set (72, 96, 120, 144, with the artist at 40, 54, 66, 80), so this inventory is the scale as a set of sizes, not a count of settings.
- **`4.2/ornament-step`**: §4.2, withdrawn by §28. Ornament step.
  > Superseded by §28 for the ornament step: the identity cell carries no ornament, so its corner field no longer yields in this give order.
- **`4.2/track-minimum`**: §4.2, withdrawn by §28. The ornament track’s min-content minimum.
  > Superseded by §28 in this paragraph: there is no ornament track, so its minimum no longer applies.
- **`4.2/trigger`**: §4.2, withdrawn by §28. Collapse trigger against the ornament track.
  > Superseded by §28 for the trigger: the genres run collapses when the content’s intrinsic height exceeds the track’s inner height, since there is no ornament track to resolve.
- **`4.2/two-track`**: §4.2, withdrawn by §28. The two-track grid.
  > Superseded by §28 in this paragraph: the identity cell is one content track with no ornament track, and the give order’s demand and supply are ruled in §28.
- **`5.4/corner-triangle-size`**: §5.4, withdrawn by §5.1. The corner triangle’s size.
  > Superseded in part by §5.1, which gives the corner triangle 268 × 140 on the rule that an edge field’s extent follows its height — the build had picked 180 and the file needed the number.
- **`8.1/corner-reserve`**: §8.1, withdrawn by §28. Corner reserve.
  > Superseded by §28: there is no corner reserve or triangle; after the gap, the next term is the genres run.
- **`8.1/frame-cell-note`**: §8.1, withdrawn by §33. The frame’s last cell as NOTE.
  > Superseded by §33 on the frame’s cell: it now shows the About, labelled ABOUT, and the note moves to §9’s Journal section.
- **`13/placement-of-edit-and`**: §13, withdrawn by §24. Edit and Delete placement.
  > Superseded by §24: both verbs sit together at AppHeader’s far right, in a slot empty on every other screen.
- **`13/the-eyebrow-row`**: §13, withdrawn by §27. The eyebrow row.
  > Withdrawn by §27: the eyebrow row below is undone.
- **`17/cell-aspect-ruling`**: §17, withdrawn by §20. The cell-aspect ruling.
  > Withdrawn by §20 — the drawing is width-bound, so matching the cell’s aspect lowers the scale and takes the floor from six failures to nine.
- **`17/offset-in-size`**: §17, withdrawn by §33. Offset shown through size.
  > Withdrawn in part by §33: the offset is no longer shown through size; each record fits its own box and the offset survives as position in its slack.
- **`18/corner-reserve`**: §18, withdrawn by §28. Corner reserve.
  > Superseded by §28 on the reserve: there is no two-track grid or corner field at any width now, so this distinction no longer applies.
- **`19/rotation-term-and-curve`**: §19, withdrawn by §20. Rotation term and curve.
  > Superseded by §20 on the first term and on the curve’s shape, which are separate withdrawals.
- **`20/the-squeeze`**: §20, withdrawn by §22. The squeeze.
  > Withdrawn by §22: k returns to 1, because at the factor that clears the floor the squeeze leaves two forms 3.9px apart — the colour assignment clears it instead.
- **`23/cover-inset`**: §23, withdrawn by §33. Cover inset in its cell.
  > Withdrawn in part by §33: the cover is no longer inset; it is the largest square its cell holds, flush to the top and sides.
- **`23/per-record-height-fill`**: §23, withdrawn by §32. Per-record height fill.
  > Superseded by §32 as a per-record claim: under §31’s fixed frame the frame fills the cell, and each record fills its own share of the frame.
- **`25/tint-top-face`**: §25, withdrawn by §26. Tint top face.
  > Superseded by §26 for a solid’s top face: it is 0.745, not tint, because tint is the ground a construction’s disc paints and a tint top vanishes on it.
- **`26/0-78-scale`**: §26, withdrawn by §26. 0.78 scale.
  > Withdrawn within §26: the 0.78 scale, which an earlier draft of this drawing used because the drawing spilled past the cell’s left edge.
- **`26/first-wording-of-placement`**: §26, withdrawn by §26. First wording of placement named solo and pair.
  > The first wording of this ruling named a solo in a strip and a pair in air, because this drawing has exactly one of each and the two variables move together.
- **`26/frame-sized-as-the`**: §26, withdrawn by §31. Frame sized as the union over the list.
  > Superseded by §31 on how the frame is sized: it is now a stated constant that arrangements must fit, not a union that tracks the collection.
- **`28/returned-space-as-gap`**: §28, withdrawn by §33. Returned space becomes gap.
  > Withdrawn in part by §33: the returned space no longer becomes gap; it becomes type, through the title’s display steps.
- **`30/floor-figures-above-1440`**: §30, withdrawn by §32. Floor figures above 1440.
  > Superseded by §32 on the floor figures that follow: every number below from 581, 629, 0.683%, 0.643%, 0.644% and 0.587% on comes from that assumption and is wrong.
- **`31/fit-check`**: §31, withdrawn by §33. Fit check rejects arrangements exceeding the frame.
  > Withdrawn by §33: with each record fitted to its own forms, an arrangement larger than the frame draws at a smaller scale, so the fit check rejects records for exceeding a bound that constrains nothing.
- **`31/whole`**: §31, withdrawn by §33. The section: the frame constant, and with it the fit check and scale-to-fit.
  > Withdrawn in whole by §33, which retires this section’s subject, the frame constant: each record fits its own forms, and the fit check and scale-to-fit go with the frame.
- **`32/shared-frame-fill`**: §32, withdrawn by §33. Shared frame fills the cell.
  > Withdrawn in part by §33: the shared frame no longer fills the cell on every record’s behalf; each record fills its own.
- **`33/about-clamped`**: §33, withdrawn by §33. The About clamped in the frame and kept whole in the lower row.
  > Withdrawn within §33: the frame shows the About clamped, and the lower About row keeps it whole.
- **`33/journal-first`**: §33, withdrawn by §33. The last cell’s order: journal, then note, then diagonal.
  > Withdrawn within §33: the lower frame’s last cell carries the journal, then the note, then the diagonal.
- **`33/two-line-ladder`**: §33, withdrawn by §33. The two-line cap on the title ladder.
  > Withdrawn within §33: the title takes the largest step at which it sets in at most two lines.
- **`33/unmeasured-fallback-rate`**: §33, withdrawn by §33. The claim that the journal entry and the diagonal are rare.
  > Withdrawn within §33: the journal entry and the diagonal are rare, because Claude’s About covers most records.
- **`33/three-line-cap`**: §33, withdrawn by §33. The title's three-line ceiling.
  > Withdrawn within §33: the title sets in at most three lines.
- **`33/loss-of-life-144`**: §33, withdrawn by §33. Loss Of Life expected at 144.
  > Withdrawn within §33: Loss Of Life is expected at 144 in three lines.

- **`34/acceptance-against-143`**: §34, withdrawn by §34. The acceptance that the rule costs the About row’s solo on every record, made against the pre-fix count.
  > This section’s earlier acceptance that it costs the About row’s solo on every record was made against 143 and is withdrawn: it was made against a count and a cause that were both wrong.

- **`34/never-shrunk`**: §34, withdrawn by §34. The ruling that a plane in a cell shorter than itself is never shrunk; §29 sizes it.
  > Withdrawn within §34: the ruling that a plane in a cell shorter than itself “is never shrunk, because a mark sized to its cell is a size that depends on the record”, which contradicted §29.

- **`33/about-budget-555`**: §33, withdrawn by §34. The ten-line About budget of about 555, which was Gaucho’s own length.
  > Superseded by §34’s measured budget of 535: 555 is Gaucho’s own length, one record of four.

- **`5.1/about-arc`**: §5.1, withdrawn by §35. The quarter-circle in About, drawn on one record of seventeen.
  > Withdrawn by §35: the quarter-circle in About, which the real collection draws on one record of seventeen.

## The wall

**Brought into this list when the four entries below were found with none:** the scope was set when the wall was §11 of the record-detail target, and the split left its withdrawals unlisted, so nothing checked them. **Assertions 6 and 7 read only the two record-detail targets until the proposal in the handoff lands, so these four entries fail 6 until then.** That failure is the gap, reported where it is; it is intended.

- **`W.15/sign-inverted`**: §W.15, withdrawn by §W.20. This section’s sign, which put the camera on the wrong side of the wall.
  > Withdrawn by §W.20: this section’s sign is inverted, and the paragraph is kept because its reasoning about the test is what survives.

- **`W.15/tiling`**: §W.15, withdrawn by §W.23. Units tiling along the wall; the wall is one fixture whose row grows.
  > Withdrawn by §W.23: the wall is one fixture and the row length grows — units do not tile at all.

- **`W.16/sequential-phases`**: §W.16, withdrawn by §W.19. The pull’s phases run in sequence; they overlap.
  > Withdrawn by §W.19: the phases overlap, and the paragraph below argued against that from a scalar clearance.

- **`W.20/growth-on-travel`**: §W.20, withdrawn by §W.25. Growth riding the travel; it rides the rotation’s window.
  > Withdrawn by §W.25: growth rides the rotation’s window, because an orthographic projection has no size change on approach — the paragraph below reasons from a perspective intuition this drawing does not have.

<!-- machine-readable: [{"id":"2.1/corner-reserve","s":"2.1","by":"28","what":"Corner reserve.","quote":"Superseded by §28 on the reserve: the identity cell has no corner field, so the arithmetic below that spends one no longer describes the cell."},{"id":"4.1/inventory-counts","s":"4.1","by":"33","what":"Inventory as per-record counts at 72.","quote":"Superseded by §33 on the counts: the title and artist sizes now vary by record over §33’s step set (72, 96, 120, 144, with the artist at 40, 54, 66, 80), so this inventory is the scale as a set of sizes, not a count of settings."},{"id":"4.2/ornament-step","s":"4.2","by":"28","what":"Ornament step.","quote":"Superseded by §28 for the ornament step: the identity cell carries no ornament, so its corner field no longer yields in this give order."},{"id":"4.2/track-minimum","s":"4.2","by":"28","what":"The ornament track’s min-content minimum.","quote":"Superseded by §28 in this paragraph: there is no ornament track, so its minimum no longer applies."},{"id":"4.2/trigger","s":"4.2","by":"28","what":"Collapse trigger against the ornament track.","quote":"Superseded by §28 for the trigger: the genres run collapses when the content’s intrinsic height exceeds the track’s inner height, since there is no ornament track to resolve."},{"id":"4.2/two-track","s":"4.2","by":"28","what":"The two-track grid.","quote":"Superseded by §28 in this paragraph: the identity cell is one content track with no ornament track, and the give order’s demand and supply are ruled in §28."},{"id":"5.4/corner-triangle-size","s":"5.4","by":"5.1","what":"The corner triangle’s size.","quote":"Superseded in part by §5.1, which gives the corner triangle 268 × 140 on the rule that an edge field’s extent follows its height — the build had picked 180 and the file needed the number."},{"id":"8.1/corner-reserve","s":"8.1","by":"28","what":"Corner reserve.","quote":"Superseded by §28: there is no corner reserve or triangle; after the gap, the next term is the genres run."},{"id":"8.1/frame-cell-note","s":"8.1","by":"33","what":"The frame’s last cell as NOTE.","quote":"Superseded by §33 on the frame’s cell: it now shows the About, labelled ABOUT, and the note moves to §9’s Journal section."},{"id":"13/placement-of-edit-and","s":"13","by":"24","what":"Edit and Delete placement.","quote":"Superseded by §24: both verbs sit together at AppHeader’s far right, in a slot empty on every other screen."},{"id":"13/the-eyebrow-row","s":"13","by":"27","what":"The eyebrow row.","quote":"Withdrawn by §27: the eyebrow row below is undone."},{"id":"17/cell-aspect-ruling","s":"17","by":"20","what":"The cell-aspect ruling.","quote":"Withdrawn by §20 — the drawing is width-bound, so matching the cell’s aspect lowers the scale and takes the floor from six failures to nine."},{"id":"17/offset-in-size","s":"17","by":"33","what":"Offset shown through size.","quote":"Withdrawn in part by §33: the offset is no longer shown through size; each record fits its own box and the offset survives as position in its slack."},{"id":"18/corner-reserve","s":"18","by":"28","what":"Corner reserve.","quote":"Superseded by §28 on the reserve: there is no two-track grid or corner field at any width now, so this distinction no longer applies."},{"id":"19/rotation-term-and-curve","s":"19","by":"20","what":"Rotation term and curve.","quote":"Superseded by §20 on the first term and on the curve’s shape, which are separate withdrawals."},{"id":"20/the-squeeze","s":"20","by":"22","what":"The squeeze.","quote":"Withdrawn by §22: k returns to 1, because at the factor that clears the floor the squeeze leaves two forms 3.9px apart — the colour assignment clears it instead."},{"id":"23/cover-inset","s":"23","by":"33","what":"Cover inset in its cell.","quote":"Withdrawn in part by §33: the cover is no longer inset; it is the largest square its cell holds, flush to the top and sides."},{"id":"23/per-record-height-fill","s":"23","by":"32","what":"Per-record height fill.","quote":"Superseded by §32 as a per-record claim: under §31’s fixed frame the frame fills the cell, and each record fills its own share of the frame."},{"id":"25/tint-top-face","s":"25","by":"26","what":"Tint top face.","quote":"Superseded by §26 for a solid’s top face: it is 0.745, not tint, because tint is the ground a construction’s disc paints and a tint top vanishes on it."},{"id":"26/0-78-scale","s":"26","by":"26","what":"0.78 scale.","quote":"Withdrawn within §26: the 0.78 scale, which an earlier draft of this drawing used because the drawing spilled past the cell’s left edge."},{"id":"26/first-wording-of-placement","s":"26","by":"26","what":"First wording of placement named solo and pair.","quote":"The first wording of this ruling named a solo in a strip and a pair in air, because this drawing has exactly one of each and the two variables move together."},{"id":"26/frame-sized-as-the","s":"26","by":"31","what":"Frame sized as the union over the list.","quote":"Superseded by §31 on how the frame is sized: it is now a stated constant that arrangements must fit, not a union that tracks the collection."},{"id":"28/returned-space-as-gap","s":"28","by":"33","what":"Returned space becomes gap.","quote":"Withdrawn in part by §33: the returned space no longer becomes gap; it becomes type, through the title’s display steps."},{"id":"30/floor-figures-above-1440","s":"30","by":"32","what":"Floor figures above 1440.","quote":"Superseded by §32 on the floor figures that follow: every number below from 581, 629, 0.683%, 0.643%, 0.644% and 0.587% on comes from that assumption and is wrong."},{"id":"31/fit-check","s":"31","by":"33","what":"Fit check rejects arrangements exceeding the frame.","quote":"Withdrawn by §33: with each record fitted to its own forms, an arrangement larger than the frame draws at a smaller scale, so the fit check rejects records for exceeding a bound that constrains nothing."},{"id":"31/whole","s":"31","by":"33","what":"The section: the frame constant, and with it the fit check and scale-to-fit.","quote":"Withdrawn in whole by §33, which retires this section’s subject, the frame constant: each record fits its own forms, and the fit check and scale-to-fit go with the frame."},{"id":"32/shared-frame-fill","s":"32","by":"33","what":"Shared frame fills the cell.","quote":"Withdrawn in part by §33: the shared frame no longer fills the cell on every record’s behalf; each record fills its own."},{"id":"33/about-clamped","s":"33","by":"33","what":"The About clamped in the frame and kept whole in the lower row.","quote":"Withdrawn within §33: the frame shows the About clamped, and the lower About row keeps it whole."},{"id":"33/journal-first","s":"33","by":"33","what":"The last cell’s order: journal, then note, then diagonal.","quote":"Withdrawn within §33: the lower frame’s last cell carries the journal, then the note, then the diagonal."},{"id":"33/two-line-ladder","s":"33","by":"33","what":"The two-line cap on the title ladder.","quote":"Withdrawn within §33: the title takes the largest step at which it sets in at most two lines."},{"id":"33/unmeasured-fallback-rate","s":"33","by":"33","what":"The claim that the journal entry and the diagonal are rare.","quote":"Withdrawn within §33: the journal entry and the diagonal are rare, because Claude’s About covers most records."},{"id":"33/three-line-cap","s":"33","by":"33","what":"The title's three-line ceiling.","quote":"Withdrawn within §33: the title sets in at most three lines."},{"id":"33/loss-of-life-144","s":"33","by":"33","what":"Loss Of Life expected at 144.","quote":"Withdrawn within §33: Loss Of Life is expected at 144 in three lines."},{"id":"34/acceptance-against-143","s":"34","by":"34","what":"The acceptance that the rule costs the About row’s solo on every record, made against the pre-fix count.","quote":"This section’s earlier acceptance that it costs the About row’s solo on every record was made against 143 and is withdrawn: it was made against a count and a cause that were both wrong."},{"id":"34/never-shrunk","s":"34","by":"34","what":"The ruling that a plane in a cell shorter than itself is never shrunk; §29 sizes it.","quote":"Withdrawn within §34: the ruling that a plane in a cell shorter than itself “is never shrunk, because a mark sized to its cell is a size that depends on the record”, which contradicted §29."},{"id":"33/about-budget-555","s":"33","by":"34","what":"The ten-line About budget of about 555, which was Gaucho’s own length.","quote":"Superseded by §34’s measured budget of 535: 555 is Gaucho’s own length, one record of four."},{"id":"5.1/about-arc","s":"5.1","by":"35","what":"The quarter-circle in About, drawn on one record of seventeen.","quote":"Withdrawn by §35: the quarter-circle in About, which the real collection draws on one record of seventeen."},{"id":"W.15/sign-inverted","s":"W.15","by":"W.20","what":"This section’s sign, which put the camera on the wrong side of the wall.","quote":"Withdrawn by §W.20: this section’s sign is inverted, and the paragraph is kept because its reasoning about the test is what survives."},{"id":"W.15/tiling","s":"W.15","by":"W.23","what":"Units tiling along the wall; the wall is one fixture whose row grows.","quote":"Withdrawn by §W.23: the wall is one fixture and the row length grows — units do not tile at all."},{"id":"W.16/sequential-phases","s":"W.16","by":"W.19","what":"The pull’s phases run in sequence; they overlap.","quote":"Withdrawn by §W.19: the phases overlap, and the paragraph below argued against that from a scalar clearance."},{"id":"W.20/growth-on-travel","s":"W.20","by":"W.25","what":"Growth riding the travel; it rides the rotation’s window.","quote":"Withdrawn by §W.25: growth rides the rotation’s window, because an orthographic projection has no size change on approach — the paragraph below reasons from a perspective intuition this drawing does not have."}] -->
