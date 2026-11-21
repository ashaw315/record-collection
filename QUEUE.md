# The queue

One file for every open item, beside `SPEC.md`, `NOTES.md` and
`WITHDRAWALS.md`. An item is written here the moment it is raised, and the
file is read through at the top of each session. **A row is closed in the turn
its answer arrives** (the coordinator, 10 Nov): Q10 sat open four days after its
ruling landed and gave a red gate a false cause, and Q2, Q4 and Q5 sat open after
Adam decided them and sent him back to captures he had judged. A row under
Blocked on Adam carries the date it was put to him, `**Put to Adam:** 6 Nov`, and,
when it comes, the words of his answer after `**Answer:**`; the check reports every
open row there without one and the days it has waited. Content compiled by the coordinator from the whole conversation
record as of 5 Nov 2026; the format and the check are Code's.

**A row is one line: its statement, its owner where the section does not say,
its status and its pointer** (Adam, through the coordinator, 11 Nov). The history
stays where the pointer says, in NOTES; restating it here was a second
hand-maintained copy of one record, the drift this file's own rule names below.
Every row as it stood before the cut, with its history inline, is this file at
dc05e5e6.

**What the check can and cannot do.** `node scripts/check-queue.mjs` reports,
and never refuses: ids unique, statuses valid, done items naming a commit git
resolves, rulings naming a section a design target holds. It cannot notice an
item that was never written down, and a clean report is not proof the list is
complete. Where a second record exists the check reads that record and not
this file's copy: closed items resolve against git; rulings against the
handoff and `WITHDRAWALS.md`.

**The unbuilt handoff steps are not items here.** They are held by the twins
test (`test/repo/handoff-twins.test.ts`) against the handoff, listed in
`scripts/handoff-unbuilt.json`, and printed by the check. Restating them here
would be a second hand-maintained copy of one list, the drift the index exists
to catch, and the check's one numbered assertion, `queue-1`, with the exit
code, is that no row here carries one of their heads. The draft's ids Q13 to Q18 were those
six, restated verbatim, and are retired, never reused.

**Statuses.** `open`; `done <commit>`, or `done <date>` for a deliverable no
commit here holds, whose record column then says where it lives (the
coordinator, 19 Nov); `dropped <commit or §section>`;
`ruled <§section>`; `parked` (real, and nobody works it: counted apart from
open, since 11 Nov). A row is `| id | status | item | record lives in |`, and
the last column says whether anything other than this file would notice the
item going missing.

## Blocked on Adam

| id | status | item | record lives in |
|---|---|---|---|
| Q1 | done 4ece9b6a | Store the 45 ABOUT notes: stored by Adam 6 Nov, 43 of 43, so 53 of the 55 records carry an ABOUT; the three held back are Q47 | NOTES, 6 Nov |
| Q47 | done 4ece9b6a | Three ABOUT notes to regenerate and store, each with its constraint (999's "Found Out Too Late", The Doors' side one order, The Ink Spots' lineup); Adam stores them when they come back. **Put to Adam:** 6 Nov. **Closed 13 Nov:** the drafts 4ece9b6a's run made on 6 Nov were found in `.abouts/drafts.json` and stored by Adam with one command, `--store .abouts/q47-store.txt` then the embedding run: 3 of 3 stored, 3 embedded, 55 of 55 records with an ABOUT and a current vector, so production draws no count line. The Ink Spots' "name no leader" constraint is relaxed by the coordinator for any regeneration (this pressing's credits name Deek Watson, Leader): the lineup it credits may be named, attributed to the pressing, never as the original group; the draft stored names none, which is not false | NOTES, 6 and 13 Nov |
| Q48 | done 9211955a | The wall's region absent at a read under dev (wall-settle:78, 6 Nov): forty runs across two load bands did not reproduce it; ruled 7 Nov by the coordinator and closed as ruled and watched, `e2e/region-remount-q48.spec.ts` naming the candidate mechanism if it recurs, no more runs | NOTES, 6 and 7 Nov; the spec |
| Q2 | ruled §W.13 | The 640px rail captures, judged by Adam before 9 Nov: ADD RECORD leaves the rail | NOTES, 6 Nov; §W.13 |
| Q3 | parked | The far-view sheet at 1044 / 1273 / 1440, parked with §43's remedy (Q60) by Adam's 9 Nov redirect | NOTES, 6 and 9 Nov |
| Q4 | done 72b73290 | The re-roll at about 2.5s: Adam judged it good 8 Nov; the 544ms was the stopwatch, settled on the page's own clock | NOTES, 6 Nov |
| Q5 | ruled §62 | The §62 covers group's look: Adam's yes of 10 Nov closes §62's Provisionals line | NOTES, 6 Nov |
| Q6 | done 41bbc928 | The Images disc size and §55's figures, measured 6 Nov from the build: Design answered in the 6 Nov drop, and the work is three unnumbered handoff steps (§55, §60, §W.8) this row does not restate | NOTES, 6 Nov; the handoff |
| Q7 | done 4ece9b6a | The 455px put back: ten of ten returned to where they began on the build; nothing owed | NOTES, 6 Nov |
| Q8 | dropped §W.8 | The hold's bound figure: Design answered in the 6 Nov drop, and the measuring at three candidates is step 170, which is Q64; a duplicate of a row that exists | NOTES, 6 Nov; Q64 |
| Q73 | open | The ask control's placement (above the heading, or the scroll), the reason bound's final figure (160 set; 140 proposed, not set, since both capacity figures were measured above the heading) and §P.4's "wholly in view" lever, one decision with three parts; Adam judges by pressing ASK on his phone. **Put to Adam:** 19 Nov | NOTES, 19 Nov (evening and night); docs/captures/ask-fold-moved and ask-fold-capacity |
| Q82 | open | Four ABOUT sentences the adversarial pass found contradicted by the material (21 Nov, `docs/measurements/about-audit/`), Adam's to fix through the About cell: Great Doubt's "companion disc of edits" on a single LP; Nashville Skyline's "romp in the middle" (the Rag is A2 of ten); Never Too Much's "then" placing A House Is Not A Home after the title track (it closes side B); Ten Years Together's "the sequence runs" against the real order. **The reason to fix them is not the ABOUT page:** all four are sequence and format claims, exactly the class that leaks into a matched-text side sentence when a record is next redrafted. ABBA's "two writers" is left (the coordinator). **Put to Adam:** 21 Nov | NOTES, 21 Nov; docs/measurements/about-audit |

Q73 is the one row here that waits on Adam.

## In flight

| id | status | item | record lives in |
|---|---|---|---|
| Q9 | parked | The four-worker unit (Code): the one-statement seed helper, the landing-count wait and the whole-collection lock. Rewritten 19 Nov (the coordinator): the row's last clause, "the CI gate at four workers once a four-worker run is clean", described a precondition that was bypassed, not met: scripts/ship.sh has defaulted the gate to four workers since be966711 (6 Nov), while the config runs two locally and one under CI by itself, so a step-level run and a gate are not the same experiment and a step-level pass cannot catch a cross-worker race by construction (Q79 escaped that way). The three mechanisms stay parked; which setting is the truth, local to four or the gate to the config, is proposed in NOTES, 19 Nov (late), not applied | NOTES; the config comment; scripts/ship.sh |
| Q10 | ruled §43 | Whether "first-painted height" means the first frame or the first styled frame: ruled 5 Nov, landed in "First paint is styled" (step 171); closed 10 Nov after four days open that gave a red gate a false cause | §43; NOTES, 6 and 10 Nov |
| Q11 | done 194ac24 | Remove rule 3 and its test; record the Doors class in NOTES beside the debut class | NOTES, ASSERTIONS-spec |
| Q12 | done 194ac24 | The "unchecked" pointer on sentences that run a side from one thing to another: a reading aid, not an assertion | the script |

## Code's queue, not started

The unbuilt handoff steps come first in this queue and are not listed
here; see above.

| id | status | item | record lives in |
|---|---|---|---|
| Q19 | done b749d61 | The queue file and its check | this file |
| Q20 | done 6b20ff1 | `scripts/check-design-card.mjs`, the card's report-only checks; 15 tests in the document suite | the script |
| Q21 | open | inferReissue is wrong on 2 records | NOTES |
| Q22 | open | The ask (Code), as it stands 19 Nov: the embedding ranking this row once described (the store and run 4d255a6e, the ranking at `POST /api/ask` 074f0dd6, the distance report delivered 12 Nov) is superseded by §P.2's model pick, latched 14 Nov, and is held unbuilt-over, not deleted, by the handoff's pick step; the control and its corrections (steps 178 to 182) stand. What is still this row's: the ask field's label WHAT TO PLAY, Proposed, judged from the captures (§P.5's provisional, open); the far answer's pair is Q59, the embedding's future Q72, the pick's own open work the handoff's unbuilt steps and Q73 to Q77 | NOTES, 12, 14 and 17 to 19 Nov; §P.2 to §P.6; the handoff's Provisionals |
| Q23 | parked | Want-list tagging (Phase 4): never designed | mood-search-scope doc |
| Q24 | parked | lookup-flows:1743: an unread flake. Present tense, not a future concern (the coordinator, 19 Nov): the gate already runs at four workers, the ship script's default, so a load-shaped flake is the gate's own environment | the known-flaky table |
| Q25 | dropped §P.2 | Mood tagging's retry and run-record: the moods are retired by §P.2, so the feature this served does not exist | SPEC §5.10; §P.2 |
| Q26 | dropped a326b46a | sharp's cold-start cost, optional from the Vercel work: dropped by the coordinator 11 Nov, nothing having asked for it in two weeks | NOTES, 11 Nov (tenth) |
| Q38 | parked | roving-148:83 at four workers: a 30s timeout on openShelf, one appearance, load-shaped; read the trace before building anything. Present tense (the coordinator, 19 Nov): the gate already runs at four workers, the ship script's default, so "at four workers" is where every gate runs, not a future setting | NOTES, 5 Nov |
| Q39 | done 09044cf | The gate against a build, not `next dev`, in two units | NOTES, 6 Nov; the runs table |
| Q42 | parked | lineup-146:36, not a flake: exact equality on a fraction; ruled 6 Nov to express the claim (a count of lines from the computed line-height) and not pin the measurement, across the ten sites the sweep found. Present tense (the coordinator, 19 Nov): the gate already runs at four workers, the ship script's default, so a site one snap from red is one snap from red on every gate | NOTES, 6 Nov |
| Q44 | done 116aec7 | identity-band-holds:79: the helper is the ruling unrounded and the assertions state the rendered values | NOTES, 6 Nov |
| Q43 | done b59c852d | The sweep's housekeeping constants (row-rules-33:218, wall-labelled:187/:188): each passes on its tolerance; neither is a build effect | NOTES, 6 Nov |
| Q40 | done af3bd9a | pick-moods-157's whole-collection test at four workers: one page load under the filter, the threshold derived from the fixture | NOTES, 6 Nov |
| Q41 | done fbec00df | What shelf-offered-134's prefetch filter throws away, measured 5 Nov against a local build: a prefetch of `/` is a 211-byte shell and a landing makes 11; nothing to fix, the volume is the record | NOTES, 5 Nov |
| Q45 | done 1012260 | wall-route and wall-settle at four workers (Code): ruled 6 Nov that a test asserts over what it owns and shared quantities go down to the pure function; :213, :162 and wall-arrival-104 rebuilt, the wait's equality a diagnostic; closes on a gate with none of the seven sites in the table. Closed on gate 42314309767 (6 Nov, 1012260), the first with none, sweep-twice run that evening as the row asked; reconciled 13 Nov: no gate since has failed or flaked at any of the seven, nor at the eleven `settled()` call sites counted later, the flakes since being region-remount-q48:82, record-band-43:33 and ring-144's seed | NOTES, 6 and 13 Nov; the runs table |
| Q46 | done 20e79a8 | The judge read a run id as the failed count; counts are read from a runner's summary line only | NOTES, 6 Nov |
| Q49 | done 0641b53d | commit-checked's carry check handed a `-` path token to basename as an option; fixed with `--` | NOTES, 7 Nov |
| Q50 | parked | The 65 candidate twice-sweep sites in 36 specs, by quantity: fix by quantity, one pattern at a time, each site's page read for itself; not started by ruling (7 Nov) | NOTES, 7 Nov; docs/measurements/twice |
| Q51 | parked | Negative assertions that may read a stream the helper discards: 986 counted, the sharpest eight listed first to read; not before §65 | NOTES, 7 Nov |
| Q52 | dropped a326b46a | check-queue's queue-1 reading the numbered-and-not-built heads too: dropped by the coordinator 11 Nov, more instrument for a problem that has bitten once | NOTES, 11 Nov (tenth) |
| Q53 | done eca45944 | The handoff's Done blocks declare their state in a field required by the twins test | NOTES, 7 Nov |
| Q54 | parked | The hand-application guard in commit-checked, a whole-file drop passing only where its files match the newest drop ref's copies; the record half done at 007a4551 | NOTES, 7 Nov |
| Q55 | open | Code's debt: three components carry their own copy of the §9.3 box string (ErrorBody, ShelfEmpty, CollectionList); fold them into the one constant | NOTES, 7 Nov |
| Q56 | parked | The landed record's 54 backfilled lines are undated until read against the commits themselves, never against the rule that produced them; after Q57 | NOTES, 7 Nov |
| Q57 | done 3c366457 | region-remount-q48.spec.ts:82 assumed the reader's scroll lands within 100ms of the sampler: the scroll's own time read (13b2015a), then its rounded frame time compared with the scroll's unrounded one, fixed 19 Nov from the gate's trace | NOTES, 7 and 19 Nov |
| Q58 | ruled §43 | record-band-43:33, intermittent, painted mid-parse (the partial-band and partial-cell shapes): ruled report-only, the WATCH line printing with every gate verdict, the remedy §43's boundary option (Q60) with step 171 parked; decided, not pending | NOTES, 8 and 9 Nov; gate-watches.txt; docs/measurements/band-43 |
| Q59 | open | A buying recommendation inside the ask's far answer (Adam, 9 and 10 Nov): ruled 11 Nov into §P.2 as the meantime pair, drawn as the owned record alone until a buying source is ruled; only the source is still this row; after Q22 | §P.2; Q22; Q23 |
| Q60 | parked | §43's boundary remedy ("First paint is styled"): ruled, not built, parked by Adam's 9 Nov redirect with the far-view thread; when it is picked up is Adam's to say | NOTES, 9 and 10 Nov; Q58; §43 |
| Q61 | open | The Record Detail 8a card's drawings regenerated from the build, Design's work once 173c's captures exist; until then the text governs | the coordinator, 10 Nov; §26, §53 |
| Q62 | open | Sorting by name counts a leading "The" (Adam, 10 Nov): ruled §T.4, built at step 176 as one SQL key; reopened for the record form's inline-add re-sort, which must take the database's order ("Names lists keyed too") | §T.4; NOTES, 11 Nov (third); Q69 |
| Q63 | parked | Two tags left behind by a covering run (sidebar-113 and manage), printed by the ledger and passed; not chased | the ledger; NOTES, 10 Nov |
| Q72 | open | A record added gets its description with no step from Adam (Adam, 13 Nov), rewritten 19 Nov when the coordinator took it off hold: the 14 Nov hold's reason is gone (the matched text's generation exists, `scripts/write-matched-text.mts` with all its rules, 55 written), and the row's open question is answered by Adam's 19 Nov ruling for every record ("i want this whole thing to be more accurate than even myself": correction in use, not marking up front, §4.6), so no separate answer is owed. What a new record needs: its Discogs grounding fetched as the drafting script does; its ABOUT generated and stored; its matched text generated and stored under the current prompt with all its rules; and a view on whether the embedding is still written at all, since the ranking it feeds is held unbuilt-over (Q22). The failure behaviour stands: any failure saves the record with no ABOUT and no matched text, loudly, never an empty one, a placeholder or a zero vector, and §P.6's count line reports it. Shape proposed before building, answering two questions first: whether the model call sits inside the add or the add succeeds and the description follows; and what the record page shows between the add and the description landing. **Waits on:** Q73 and Q78, the sheet being how a wrong new description gets fixed | the coordinator, 13 and 19 Nov; NOTES, 19 Nov (late); §4.6; §P.6; Q22 The failed-description state goes to Design as part of the record page's attention state, consolidated with the import's artist id refusal (the coordinator, 21 Nov; NOTES, 21 Nov evening). |
| Q64 | open | Step 170 (§W.8, the bound at a candidate): Code's measure-window mode for held presses at 3000, 4000 and 6000ms first, then Adam's run; its precondition, Q45, closed (reconciled 13 Nov); placed after handoff steps 184 and 185, which finish the ask Adam uses, so his production runs are not spent before it is finished (the coordinator, 13 Nov); then Q37, then Q72 | scripts/measure-window.mts; Q45; §W.8 |
| Q27 | parked | Vercel deployment retention: 294 production deployments at 22.4 MB each is about 6.4 GB of the 7.5 GB; no action chosen, the first proposal wrong twice over; parked against a limit that moves | the Vercel investigation |
| Q74 | open | Four matched-text sentences verified wrong and in use (Smerz s1, Vandross s5, ABBA s3, Blues Project s8): not hand-fixed by ruling, they are the first cases of §67's sheet and wait for it; owner Code once the sheet exists, Adam corrects through it; Q75 stands behind this row, the sheet being where a wrong `[supported]` sentence would also be met (the coordinator, 19 Nov) | NOTES, 19 Nov (first); the audit files under .matched/ |
| Q75 | open | `[supported]` is the drafting model's own unchecked field, on 125 of 439 stored sentences, and nothing in the pipeline verifies it against the tracklist, credits or format it claims; no owner and no mechanism yet, the honest state and not an oversight; the natural next look once §67's sheet lands and Q74's four are corrected through it (the coordinator, 19 Nov) | NOTES, 19 Nov (first); 71dcaa18 |
| Q76 | parked | The adversarial pass's recall: both planted controls missed at medium and at high, the one pre-registered fix attempt failed 0 of 3 and 0 of 3 and was withdrawn, investment stopped by the coordinator's rule; a zero from it is an unexamined result, not a clean one | NOTES, 18 Nov (the pass's three entries) and 19 Nov (first) |
| Q77 | open | Ruled by Design 19 Nov, in progress: the requirement-unmet slot drawn with "None has all of it." above its stand-in, measured 95.0 wide and one line at the rail's 112, 320's 284 and 1280's 300, built (unit A); the re-ask once built (B1): the over-bound records asked again alone, a reason back within the bound replacing the first, a record still over left out with the reason named, an answer left with nothing refused as today so the slot says "Not answered."; "No answer came. Ask again." measured 157.6 wide, two lines at 112, sent back to Design by the ruling's clause and not drawn (Q78); what remains (B2) is the no-answer verdict, its slot and the run kept, landing with the rewording. **Waits on:** Q78's rewording | the handoff's pick step, after "Bound the reason"; NOTES, 19 Nov (night and late) |
| Q80 | done dfcaa5a5 | record-modal-81:548 flaked on gate 44617708618 (4fda65ef): every sampled pose one frame behind its stamp, because React commits a frame callback's state update after the frame's rendering, not because of the callbacks' order (ruled as the cause, refuted by the assertion itself, built first); the samplers in record-modal-81 and gatefold-88 stamp a pose with the frame current when it reached the DOM and assert the alignment by name, lag 0.0 to 0.3ms; the standing rule and the observation-over-inference rule in CLAUDE.md §9 | NOTES, 19 Nov (night, Q80 built and the coordinator's word) |
| Q79 | done ef5436bc | record-page-8a:432 flaked on gate 44611551904 (6df5bd81): under fullyParallel at the gate's four workers the richest case's pressing was shared by key across the file's tests, found (200) by one worker 16ms before another worker's afterEach deleted it, so the record POST answered 400; the test's shape, not the build. Fixed as the coordinator ruled: the pressing keyed per worker (the catalog number suffixed with parallelIndex), and the comment that celebrated a reuse path the 11 Nov cleanup had ended rewritten to what is true, pointing at the integration tests that hold §4's found-or-create; standing form in CLAUDE.md §6 | NOTES, 19 Nov (night and late); the gate's test-results |

## Design's queue

| id | status | item | record lives in |
|---|---|---|---|
| Q65 | done 8ad5496b | One marker opener outside the grammar (§W.26's fork by §W.29): Design's "Grammar Q65 and Q66" amended the grammar with the qualifier slot before the reference, in DESIGN-RULES | NOTES, 10 and 11 Nov; DESIGN-RULES |
| Q66 | done 8ad5496b | Two §20 sentences reading as markers missing their colon: rewritten by the same file as conforming markers, both quote lines updated | NOTES, 10 and 11 Nov |
| Q67 | done 550fbe84 | Rows the ledger reports without failing: releases (6147a88e), pressings (55fd8518) and labels (550fbe84) each closed, the ledger failing on any left; the declared set for labels is the fixtures' fifteen names, not a pair from one run; scoping it as a 26-spec project came from a figure measured before the manage registration, and re-measuring made it a day's work | NOTES, 10 Nov (late, second) and 11 Nov (fourth, sixth, seventh, ninth); e2e/ledger.ts |
| Q68 | parked | A sweep of which assertions were written from the build rather than from a target sentence (CLAUDE.md §2's shape, seen twice); owner Code, when placed | NOTES, 10 Nov (late, second) |
| Q69 | parked | MusicBrainz's `sort-name`, carried and discarded: nothing reads it; it cannot replace §T.4's key, only inform the cases the article rule cannot reach | NOTES, 11 Nov (third); Q62 |
| Q70 | done 65a0eba1 | The one-time report of markers naming several targets, 75 of 289 at 4ce89829: the coordinator read the signature as over-firing, so the list is not sent; the harm-derived test (near-identical first words of live bold sentences in one section) is placed after Q22 | NOTES, 11 Nov; DESIGN-RULES |
| Q71 | done eb996c30 | Verified and fixed 11 Nov: an edit whose pressing section was untouched re-posted it, and a pressing with an empty §4 match key (a matrix alone) came back new, moving the record and orphaning the first; the form now keeps the pressing it had when the section reads as loaded (`samePressing`), asserted in record-form.spec. Production on 11 Nov: no pressing made this way, and 10 pressings nothing references, from other paths, left as they are (the coordinator, 12 Nov: referenced by nothing, and under §66 a barcode search goes through a record's current pressing, so they can never surface) | NOTES, 11 Nov (eleventh); scripts/count-orphan-pressings.mts; §4 |
| Q28 | ruled §43 | §43's ruling, the same question as Q10; closed 10 Nov | §43 |
| Q29 | done 8ad5496b | The vibe search surface: filed by Design 10 Nov ("Ask field") and made safe for the control 11 Nov ("the rest of the moods"), both holds lifted; what remains is Q22's build | NOTES, 10 and 11 Nov; Q22 |
| Q30 | done 11 Nov | The export bundle (four exports at 35da788 / fcab6ed in Downloads): whether Design consumed them. Answered by Design on 11 Nov: both exports consumed, the bundle gives what is needed. The history, in the coordinator's words, as the sharpest instance of the failure this file exists to prevent: "I closed it in conversation on 11 Nov, never wrote it to the row, and on 19 Nov proposed closing it on inferred conduct having forgotten the answer existed... The miss is entirely mine and it is the third this week where my own record-keeping was the fault." Code checked and found no answer recorded, left it open, and held that conduct is not an answer; both right. Design's two bundle gaps named with the answer are Q81 | Design's answer of 11 Nov, in conversation, recorded here 19 Nov; NOTES, 6 Nov (20:05) and 19 Nov (late) |
| Q81 | done ebc95f79 | Design's two gaps in the export bundle (relayed with its 11 Nov answer, the coordinator, 19 Nov; both justified by incidents): each card HEAD holds hashed and byte-counted at the export's commit, one line per card in a sixth bundle file, so Design anchors on the landed card without a relay (the 04548440 round trip; the coordinator's hand hashing retired); and what happened to each change in a change file, not only that the file arrived, the intake's --held requiring --why and --partial naming the changes applied and the reason for the rest, read into the record and printed in the applied list ("Count line headroom" and "Run end wording" read as arrived with nothing applied for four days; they never reached a ref here, which Design's list against Code's shows) | NOTES, 19 Nov (late, Q81 built); scripts/export-handoff.mjs; scripts/landed-list.mjs; scripts/apply-code-region.mjs |
| Q78 | open | §67's sheet, Design's half: the two provisionals that return with the sheet step's capture (its look and words at 1440 × 900 and 390, its head at 390 with the keyboard up, judged by Adam on his phone; §P.2's reason as a press), and the dropped-reason slot wording proposed 19 Nov, which measured 157.6 wide and took two lines in the rail's 112 (one at 320's 284 and 1280's 300), sent back for rewording rather than cut, as the ruling says; and one design question put as one (the coordinator, 19 Nov): the in-flight press, off hold, and Q72's pending state while a new record's description arrives (about 23 seconds measured), both how the app shows work in progress; the pick's shape per host (the coordinator, 20 Nov); and a fourth that consolidates two (the coordinator, 21 Nov): the record page's attention state, carrying Q72's failed-description case and the import's refusal to write a Discogs artist id onto a name-matched row that holds another, one surface ruled once (NOTES, 21 Nov evening); Code's build of the step is the twins test's, not restated here | the handoff's Provisionals; NOTES, 19 Nov |

## Owed by the coordinator

| id | status | item | record lives in |
|---|---|---|---|
| Q31 | done 15 Nov | The audio-analysis research write-up, delivered 15 Nov; the row read "Adam still wants it" for four days after, against the close-in-the-turn rule this file's header attributes to the coordinator, broken by him on his own row (his words, 19 Nov) | claude/audio-analysis-research.md, the coordinator's file, outside this repo |
| Q32 | done 15 Nov | The matching table (candidate recording, duration difference, version differences, confidence), delivered 15 Nov with Q31; open four days after, the same lapse, recorded as his | claude/audio-analysis-research.md, the coordinator's file, outside this repo |

## Ruled by Adam, 11 Nov

Fields the import holds and the page did not show. Never ruled out until 11
Nov, when Adam ruled on all four.

| id | status | item | record lives in |
|---|---|---|---|
| Q33 | done 41a6d214 | Format text ("Gatefold", on 39 records): ruled in by Adam 11 Nov, placed by Design's §66 the same day (a Pressing detail row after Colour), built at step 179 on 12 Nov | §66; the handoff's step 179 |
| Q34 | dropped a326b46a | Community rating and have/want counts: ruled out by Adam 11 Nov, not shown | the coordinator, 11 Nov; NOTES, 11 Nov (tenth) |
| Q35 | done 41a6d214 | Barcode: ruled in by Adam 11 Nov, placed by §66 (Pressing detail's last row, and reached by search through the record's current pressing), built at step 179; the barcode rows for releases cached before it come from Adam's backfill run (`npm run discogs:backfill-text`) | §66; the handoff's step 179 |
| Q36 | done 41a6d214 | The full release date rather than the year alone: ruled in by Adam 11 Nov, placed by §66 (in place of the pressed year at the PRESSING line's end), built at step 179 | §66; the handoff's step 179 |

## Answered 11 Nov

| id | status | item | record lives in |
|---|---|---|---|
| Q37 | open | The ABOUT grounding downloads formed-year, origin and members for 49 artists and throws them away, the three fields empty on all 49: Adam ruled 11 Nov to keep them and use them, so Code stores the three and uses them in the grounding; work, not a question | the coordinator, 11 Nov; NOTES |

---

Where no second record exists (Q2 to Q8, Q22, Q29 to Q37) nothing mechanical
can help. Those are the ones that went missing three times, and they went
missing because they lived only in conversation. The fix for those is not a
check; it is the rule at the top of this file.
