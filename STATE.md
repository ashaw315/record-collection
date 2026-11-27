# State at close, 27 Nov 2026

The project stopped here by Adam's choice. The coordinator held the finish line. Nothing below is in progress. Read this first, then `NOTES.md` from its end and `QUEUE.md`, before starting anything.

## Done means three things, all Adam's

1. **Eight sentence corrections.** Four are matched-text sentences, corrected through the correcting sheet (the record page's "Matched text" verb, or an answer's reason). Four are ABOUT sentences, corrected through the record page's About cell.

   The matched-text sentences, as production held them on 24 Nov (`test/fixtures/sheet-four-known-errors.json`):
   - **Smerz, Believer** (de2ad140), sentence 1: "…write, produce, engineer and perform all of it…". Cello, flute, two violins and drum programming are credited to others, and sentences 2 and 7 name them.
   - **Luther Vandross, Never Too Much** (d7047c62), sentence 5: "two percussionists" on "She's A Super Lady". Congas and two percussion are credited, so three players.
   - **ABBA, ABBA** (309a4726), sentence 3: "Mamma Mia", "the one track carrying a separate string arrangement". That is true of side one only: B3 Intermezzo No. 1 has one too.
   - **The Blues Project, The Best Of The Blues Project** (c893e66b), sentence 8: "the covers and originals alternate". This is false at B1 to B2, which are two covers in a row.

   The ABOUT sentences, as the 21 Nov audit read them (`docs/measurements/about-audit/`):
   - **Astrid Sonne, Great Doubt** (e80a0cf3): "The companion disc of edits…". The edition is a single LP.
   - **Bob Dylan, Nashville Skyline** (946db39b): "a fiddle-and-steel romp in the middle". Nashville Skyline Rag is A2 of ten.
   - **Luther Vandross, Never Too Much** (d7047c62): "Then the tempo falls away for … A House Is Not A Home". That track closes side B, five tracks after the title track.
   - **Peter, Paul & Mary, (Ten) Years Together** (8120765c): "The sequence runs from coffeehouse hymns … through the Dylan songs … the late pop flirtations." The record opens with two Dylan songs, and the pop selections come before "Puff".

   These are sequence and format claims. That class leaks into a matched-text sentence when a record is redrafted, which is the reason to fix the ABOUTs (Q82).
2. **The LINEUP press.** Manage → Artists → Blood, Sweat And Tears → LINEUP. It fills the band's formed year and origin, which the 22 Nov merge left null, and the resolver's own run skips that row (NOTES, 22 Nov). A press that dies on the 60-second limit resumes on a second press.
3. **Jeff Beck's Discogs artist id.** Set it in the artist form, read off the guitarist's Discogs page rather than guessed. Nothing fills a null id on a name match, by design. With it, 49 of 49 collection artists hold ids.

## Parked, and why

Everything here stopped at the finish line, not on a defect.

- **Step 170** (handoff, §W.8, "the bound at a candidate"). This would have been the next step. It measures, on production, a held press that would navigate at 3000, 4000 and 6000ms, each against when its record's page would have loaded, so the hold's bound is set from data. It is unblocked: units 2b, 4 and 3 are built, unit 5 is closed as overtaken, handoff steps 184 and 185 are Done, and Q45 is closed. It is first in Q64's order, then Q37, then Q72.
- **The negation measurement.** `docs/measurements/top-n/PREREGISTRATION-negation.md` is committed and **was never run**. Its reading is ordering only and computed by `negationReading` (`src/lib/ask/top-n.ts`, tested): consistent, not consistent, or undetermined. If it is ever run, run it as written. Its Result section is empty on purpose. The ruling it bears on ("Pool unbounded on measured ranks", §P.2) stands on measured ranks and does not wait on it.
- **Q95, waiting on Design.** Seven live markers use forms the marker grammar allows but the index's six declared prefixes don't: §21, two in §31, two in §55, §W and §W.12. None has a withdrawal entry, and nothing checks for one. The coordinator's view: the choice isn't to widen or narrow. The grammar should say which forms owe an entry, and the index should check exactly those. Design rules first, then the rule's owner. Both halves are held. The table is in NOTES, 27 Nov (second).
- **Every other open queue row** is in `QUEUE.md` as it stood. None was progressed after 27 Nov.

## Things a cold reader would trip on

- **"185" names two steps.** Before 22 Nov it meant §P.4's five cells in the column host, which was built as **184**. The handoff's 185 is §67's correcting sheet. Read any step number from before 22 Nov against its heading.
- **The last gate was not OK.** Run 45436187072, on 1b85f572 (24 Nov), was GREEN WITH FLAKES: unit and chromium passed, and mobile had 404 passed with 1 flaky, `e2e/want-list.spec.ts:1086` ("a row's market answer takes the control's height"). That flake was never read into NOTES. **No gate has run on the commits since**, which are drops, docs, scripts and repo tests, each through `commit-checked.sh`. Run one, alone on the machine (CLAUDE.md §10), before building anything.
- **Untracked files were left as found.** These are `docs/captures/` folders from Oct and Nov (arrow-167, covers-164, nav-menu and others), three change files at the repo root, and `marked.txt`. None was said to ride with a unit, and they were not read for this commit.
- **Docker may be down.** The unit suite refuses to run without `npm run db:test:up`.
