# For Design: the card's references to Images' span and the About's placement, against §53 (10 Nov)

**A change asked for, from Code, relayed by the coordinator.** Card: `docs/design/Record Detail 8a - build target.dc.html`
at HEAD, read through the shared heading parser (`blocksOf`, `sentencesOf` in `scripts/export-diff.mjs`). Sentences are
addressed `§N bB.sS`: block B of the section, sentence S within it.

**What §53 rules, as it stands.**
- b1.s1 and b4.s3: the About cell is the About's only place, and the lower About row is removed.
- b4.s6: "the images row is one section, not a pair: Images spans the row at every width".
- b4.s1 to s8: the base quarter-disc lost its host "beside About this record" and draws on Images at every width.

**The build follows §53.** `placementOf(width, 'images')` gives a span of 12, 8, 4 and 1 at 1440, 960, 480 and 390,
each ending its row. `SECTIONS` lists eight lower sections.

**How this was found.** I enumerated rather than spot-checked: every sentence matching Images, IMAGES, About, ABOUT,
"halves" or "6 / 6", 122 in all. Then I read every sentence naming the old host ("beside About this record", "lower
row", "About row") and every section count. I read each one against §53 and kept those that state a span, a host or a
count §53 changed and that carry no supersession marker. §28's own rule (b16.s6) is the reason for doing it this way:
"a withdrawal is not finished until every sentence that depended on the withdrawn thing is found, and the search is
by what the thing was called".

## A. Images' span: row 4 still described as a pair

1. **§26 b2.s9**, the listing in force, which assertion 14 pins: "…a full-width strip (12), **two halves (6 / 6)**, and a
   last row that begins with air (3 + 9)." Under §53 this is Images, full width (12).
2. **§26 b2.s12**, the row names: "**row 4 the two halves**". These are names, not positions, but the name is given by a
   description that §53 made false.
3. **§28 b5.s2**: "§26's rows are 7+5, 4/4/4, 12, **6/6** and 3+9." This has two stale figures and no marker: the 6/6,
   and no tracklist row (§65).
4. **§28 b17.s4**, the groupings: "Row 4, two sections: 6 / 6; 4 / 4; 2 / 2, kept side by side as the one pair; two rows
   of 1." Under §53 this reads "one section: 12; 8; 4; 1", which is what the build lays.
5. **§28 b17.s8 and b17.s12**, from "Row counts left to the build" (10 Nov): "§53, which does not split Images **at
   one**" and "§53's Images **at one**".
   - §53 says every width.
   - At 12, 8 and 4 a side-by-side pair and a single section are both one row. So the narrower reading gives the same
     row counts and different spans.
   - That is why the count-only pin (assertion 14) passes on item 1.

## B. The About's placement: the quarter-disc's old host

6. **§26 b3.s3**: "the base quarter-disc bleeds off the right edge **beside About this record**". Under §53 it is on
   Images.
7. **§26 b8.s3**: "So the quarter-disc **beside About this record** bleeds off the page's right edge…" The rule it states
   (a flat is not cut by its host's top) still applies, but the host is wrong.
8. **§26 b12.s2**: "Base goes to the quarter-disc on the right **beside About this record**…"
9. **§29 b1.s5**: "On the record with no About snippet, the host is 104px, so the quarter-disc's visible radius is 69px,
   not 150."
   - This is a worked example on a host that no longer exists.
   - §60 now sizes the disc against a stated reference height, so the figure is a different kind of example, not
     only a different number.
10. **§21 b7.s6**: "a flat on an About cell with no snippet is visibly smaller than one on a full cell".
    - I believe this means the same old host, but I'm not certain. "About cell" could be read as the upper cell.
    - Under §60 the disc no longer varies with Images' content either.

## C. The section count: a consequence of the About row's removal

11. **§26 b2.s5**: "§65 gave the page **a ninth section**, the tracklist". With the About row gone, the tracklist made
    eight, and the build has eight.
12. **§26 b3.s4**: "Two figures in **nine sections**, never consecutive…". This should be eight.
13. **§26 b2.s4**, a withdrawal: "…and its two figures as falling in **eight sections**." This withdraws a figure that
    is right as the page stands. The five rows it also withdraws are correctly withdrawn.

## D. A supersession note that keeps the removed row alive

14. **§36 b1.s7**: "Superseded in part by §42: the row keeps no reading copy; **it is the About's editor and its controls
    only**." In reading order this comes after the same block's "Withdrawn by §53: the lower About row is removed"
    (b1.s3), and it states the row as present. §42 b4.s6 has the same shape, but §42's own b4.s7 supersedes it, so §42
    is not listed.

## What this does not cover

- **The card's drawings.** I swept text only. §26 b2.s14 already says its drawing predates the tracklist's row. Whether
  a drawing still shows row 4 as halves, or the disc beside About, needs someone to look at it.
- **Other cards and the handoff.** I swept only Record Detail 8a.
- **Sentences already marked** "Withdrawn by §53" or "Superseded by §53": §33 b11.s6, §36 b1.s3 and b2.s3, §42 b4.s7.
  Those are already handled.

## What Code will do once Design's fix lands

Assertion 14 will be extended from §26's count to its spans: each row of the listing in force compared with
`placementOf` at twelve columns. This is recorded in `scripts/ASSERTIONS-spec.md` entry 14 (d8b86625). Extending it
before the fix would fail on a defect Design already owns.
