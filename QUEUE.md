# The queue

One file for every open item, beside `SPEC.md`, `NOTES.md` and
`WITHDRAWALS.md`. An item is written here the moment it is raised, and the
file is read through at the top of each session. Content compiled by the
coordinator from the whole conversation record as of 5 Nov 2026; the format
and the check are Code's.

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

**Statuses.** `open`; `done <commit>`; `dropped <commit or §section>`;
`ruled <§section>`. A row is `| id | status | item | record lives in |`, and
the last column says whether anything other than this file would notice the
item going missing.

## Blocked on Adam

| id | status | item | record lives in |
|---|---|---|---|
| Q1 | open | Store the 45 ABOUT notes. Stored by Adam, 6 Nov: 43 of 43, so 53 of the 55 records carry an ABOUT; Q22's blocker is cleared. Closes with the commit that records it. The two held back and a third are Q47 | the drafts file; NOTES, 6 Nov |
| Q47 | open | Three ABOUT notes to regenerate and store (the coordinator, 6 Nov), each with its constraint: `e1e349f6`, 999, The Biggest Prize In Sport: "Found Out Too Late" is not on the 1980 LP (a 1999 Anagram CD bonus track), the other two titles stand, and rule 2 of the checker should catch it on the regenerated note, a live test of the rule; `e315c6a7`, The Doors: side one's order is reversed in the note, Alabama Song is A5 and Light My Fire A6 closes the side; `dbcf97f0`, The Ink Spots' Greatest: the note names "a Deek Watson–led quartet" and rests its recommendation on it, unconfirmable and the record's own Discogs list points the other way, so regenerate without naming who led the group, saying at most a later lineup working the original formula. Store all three when they come back, same as the 43 (Adam). The third was lost between the fact-check and the queue and stored by mistake: the row each item gets the moment it is raised, which this one did not | NOTES, 6 Nov |
| Q2 | open | The 640px rail captures: look and judge. In the bundle `~/Downloads/Q2 to Q5 for Adam, 6 Nov/` from the build on the real collection, with the decision line in READ ME FIRST (6 Nov) | the bundle; NOTES, 6 Nov |
| Q3 | open | The far-view sheet at 1044 / 1273 / 1440: look and judge. In the bundle, from the build on the real collection (6 Nov) | the bundle; NOTES, 6 Nov |
| Q4 | open | The re-roll at about 2.5s: look and judge. In the bundle as a video from the build at 1440 × 900, measured 3006ms press-to-settled against 2462 by the constants (6 Nov) | the bundle; NOTES, 6 Nov |
| Q5 | open | The §62 covers group's look: look and judge. In the bundle, from the build at 1440 × 900 and 390 (6 Nov) | the bundle; NOTES, 6 Nov |
| Q6 | open | The Images disc size, and §55's figures: measured 6 Nov on the real collection from the build, none checked against a build before. The counts follow the collection (39 of 55 at 1440 × 1200, 28 at 900 against 11 and 6 of 17); Wired and On The Radio and The Hurdy Gurdy Man suppressed at 1200 as stated, Grave New World gone; **Bitches Brew suppressed at 1440 × 900 (aspect 4.694, gap-bound) where §55 states 443 × 113.9 drawn**, read as the ABOUT notes shortening the gap; the disc two-thirds of its reference at every count at 1440 and 1920 (345.300, 425.300), caption-bound at 390 by count (56.000, 97.500), and **"about 160" describes it at no window**. Two findings to the coordinator with both numbers; nothing adjusted | NOTES, 6 Nov; the JSONL |
| Q7 | open | The 455px put back: measured 6 Nov on the build, ten of ten returned to where they began (delta 0, 0; 200 records at 1440 × 900); the 31 Oct one-in-three was on production and never reproduced. Agrees; closes with the commit that records it | NOTES, 6 Nov |
| Q8 | open | The hold's bound figure: the target states no figure, the code's 2000 is provisional, and the measurement exists (Run A, 30 Oct, production): at 2000ms, 42 of 89 held presses would navigate instead of pulling, all 20 at cold fast-3g and 22 of 40 at slow-3g, none on a fast connection. A judgement with the numbers beside it, Adam's or the coordinator's | NOTES, 6 Nov; docs/measurements/window-160 |

Q1 blocks Q22. Q2 to Q8 block nothing and have been parked longest.

## In flight

| id | status | item | record lives in |
|---|---|---|---|
| Q9 | open | The four-worker unit (Code): seed via the one-statement helper (wall-route:234); landing-count wait replacing a 900ms clock (wall-arrival-104:120); the whole-collection lock with a stale-lock break and a bounded poll, plus the seven-spec survey recorded in the file; raise the CI gate to four workers once a four-worker run is clean | NOTES, the config comment |
| Q10 | open | §43 (Design): does "first-painted height" mean the first frame, or the first styled frame? Raised by record-band-43:33 failing at four workers on an unstyled frame. Stays open whatever Q39 shows: a build serves its CSS as a static asset, so the test may go green under a build, and a green test is not a ruling (the coordinator, 5 Nov) | §43 |
| Q11 | done 194ac24 | Remove rule 3 and its test; record the Doors class in NOTES beside the debut class | NOTES, ASSERTIONS-spec |
| Q12 | done 194ac24 | The "unchecked" pointer on sentences that run a side from one thing to another: a reading aid, not an assertion, no ASSERTIONS-spec entry | the script |

## Code's queue, not started

The six unbuilt handoff steps come first in this queue and are not listed
here; see above.

| id | status | item | record lives in |
|---|---|---|---|
| Q19 | done b749d61 | The queue file and its check | this file |
| Q20 | done 6b20ff1 | `scripts/check-design-card.mjs`: tag balance, nesting depth 1, doctype, closing tag, withdrawal-sentence count and uniqueness, change-file quotes matched character for character including curly apostrophes, and the bold-sentence set diff against the previous card. A report that never refuses, not in ASSERTIONS-spec; 15 tests in the document suite | the script |
| Q21 | open | inferReissue is wrong on 2 records | NOTES |
| Q22 | open | The vibe search: embed the ABOUT notes, rank the collection by closeness to a typed vibe, 3 to 5 results, an honest weak-match state. Its blocker, Q1, cleared 6 Nov (53 of 55 records carry an ABOUT). Replaces the mood buttons; they survive as presets at most | nothing yet |
| Q23 | open | Want-list tagging (Phase 4): never designed | mood-search-scope doc |
| Q24 | open | lookup-flows:1743: an unread flake | the known-flaky table |
| Q25 | open | Mood tagging: the retry and the run-record | SPEC §5.10 |
| Q26 | open | sharp's cold-start cost: optional, from the Vercel work | NOTES |
| Q38 | open | roving-148:83 at four workers: a 30s timeout on openShelf at the test's start (4.6s at one worker, 9.1s and 30.4s at four), the seventh distinct four-worker test, one appearance; load-shaped, not a collision; read the trace before building anything | NOTES, 5 Nov |
| Q39 | done 09044cf | The gate against a build, not `next dev`, in two units (the coordinator, 5 Nov). Unit one (fbec00d), gated under dev: the suite honest against either server; the probe pages gate on `E2E_PROBES=1` and a parsed NODE_ENV, the sweep of the literal a watch (`test/repo/node-env-literal.test.ts`), the no-live-calls belt through the parsed env, shelf-offered-134's prefetch filter, hold-160:220 staged by the proxy's end mode with `holdHydration` removed. Unit two (09044cf), the switch, gated at four workers from a build, run 42231886732: chromium 16.4m against 37.0m dev, mobile 6.9m against 14.9m, the five tests in NOTES' table (record-navigation:295 18.3s against a failed 1.0m). Q10 stays open: record-band-43:33's 1.4m green under a build is not a ruling on §43. The gate verified on production 6 Nov: Adam, logged in, saw the app's own "Not found." on `/wall/overview` | NOTES, 6 Nov; the runs table |
| Q42 | open | lineup-146:36, classified 6 Nov: not a flake. Exact equality on the reserved slot's measured height; reproduced on CI twice at the same values (32.500, 32.500, 33.000 at the result's arrival, runs 42231886732 and 42243942847), locally a two-valued snap, 32.5 or 33.0, with fonts loaded, the same under dev. Ruled (the coordinator, 6 Nov): express the claim, do not pin the measurement; derive the line's height from the element's own computed line-height and assert the box holds one of them, a range that survives a half-pixel snap and excludes zero lines and two. The ruling applies to all ten exact-equality-on-a-fraction sites the sweep found, where the claim is a count of lines; where a site's claim is a specific measurement, say so per site and leave it exact | NOTES, 6 Nov; the runs table |
| Q44 | done 116aec7 | identity-band-holds:79: the band renders at 668.547 and `bandHeightAt` rounded the same formula to 669. The render is right, the target rules "547 ÷ 900 of the viewport's height, and never less than 547" and the CSS is that formula; the helper is the ruling unrounded now, and the assertions that pinned the rounding state the rendered values to three decimals (approved 6 Nov), each watched failing first. The same helper as Q43's first item, which closes with it | NOTES, 6 Nov |
| Q43 | open | The sweep's housekeeping constants, the same under dev and build (6 Nov): row-rules-33:218, 175.9 stated to one decimal against 175.933 rendered; wall-labelled:187/:188, the label's box 0.957px over the spine's edge against a 1px allowance, 0.043 to go, a measurement to watch. Each passes on its tolerance; neither is a build effect | NOTES, 6 Nov |
| Q40 | done af3bd9a | pick-moods-157's whole-collection test at four workers: the bracket could not close (no quiet two seconds across eight attempts, run 42115186427). Ruled and built: one page load under the filter, the line drawn and its count at least the collection's floor, the threshold derived from the fixture (the pool's untagged count from SETS against the seventeen's length) with a loud refusal if the fixture ever stops distinguishing the two readings; the equality stays in mood-pool.test.ts, which holds it with no concurrent writer; the bracket and its tests removed, the finding kept in NOTES as a measurement | NOTES, 6 Nov |
| Q41 | open | What shelf-offered-134's prefetch filter throws away (the coordinator, 5 Nov): a production `<Link>` prefetches every viewport link, which `next dev` never does, so after the filter nobody watches those requests. Measured 5 Nov against a local build (test database, 17 records, chromium at 1440): a prefetch of `/` is a 211-byte shell, 160 encoded, against 90,874 bytes for a full RSC fetch of `/`; a landing on /want-list makes 11 prefetches, 8,960 bytes on the wire, 10,417 decoded, each 13 to 30ms. The collection's data is not in a prefetch, so this is not the hidden-grid class; nothing to fix, the volume is the record | NOTES, 5 Nov |
| Q45 | open | wall-route:162 and :213, and now wall-settle:53, at four workers from a build: the wait built 6 Nov holds on the landing's own write and names both frames, and run 42273938707 read it: "before the round-trip: content 1253, region 872; now content 2136, region 1321", the wall 883 wider between two reads of one test, another worker's seed. §W.12 sizes the wall by the whole collection, and at four workers the collection moves between any two reads of the wall's width; every test that measures the wall, acts and measures again is the lineup shape with the other workers as the state change (the seven call sites of `settled()`: wall-route :130, :179, :229, :239, :345; wall-arrival-104 :146, :156; and wall-settle:53). What those tests should claim across a moving collection is a ruling, not a fix: the measurement window closed (one read), a wall of the test's own, or the claim made at one worker | NOTES, 6 Nov; the runs table |
| Q46 | done 20e79a8 | The judge (`scripts/run-result.ts`) read a run id as the failed count on run 42273938707's chromium half ("1058 passed, 42268956664 failed … NOT OK"), from a comment Playwright printed beside a failing line. Fixed: counts are read from a runner's summary line only, and from the judge's own fed-back verdict only where no runner's line exists; tests on that log's shape watched failing first. The stored logs re-judged, 118: no row of the runs table moves; the one genuine difference is the misread half itself, now GREEN WITH FLAKES | NOTES, 6 Nov |
| Q27 | open | Vercel deployment retention. 294 production deployments at 22.4 MB each is about 6.4 GB of the 7.5 GB. No action has been chosen, and the first proposal was wrong twice over: the numerator spans projects and the denominator should be retained deployments, and preview retention does not touch production deployments | the Vercel investigation |

## Design's queue

| id | status | item | record lives in |
|---|---|---|---|
| Q28 | open | §43's ruling (the same question as Q10) | §43 |
| Q29 | open | The vibe search surface: one input or two; the result count; the weak-match state; whether §T.3 as ruled can carry both a vibe reason and an exact-match reason; where it lives; what becomes of the mood buttons | nothing yet |
| Q30 | open | The export bundle: four exports at `35da788` / `fcab6ed` are in Downloads. Whether Design has consumed them is not recorded anywhere | nothing |

## Owed by the coordinator

| id | status | item | record lives in |
|---|---|---|---|
| Q31 | open | The audio-analysis research write-up. Never written anywhere, in any document | nothing |
| Q32 | open | The matching table: candidate recording, duration difference, version differences, confidence | nothing |

## Decided by default, never chosen

Fields the import holds and the page does not show. No one ruled these out;
they were simply never ruled in.

| id | status | item | record lives in |
|---|---|---|---|
| Q33 | open | Format text: "Gatefold", on 39 records | nothing |
| Q34 | open | Community rating, and have/want counts | nothing |
| Q35 | open | Barcode | nothing |
| Q36 | open | Full release date, rather than the year alone | nothing |

## Raised, never answered

| id | status | item | record lives in |
|---|---|---|---|
| Q37 | open | The ABOUT grounding fetches 49 artists' Discogs discographies and discards formed-year, origin and members, the exact three fields that are 0 of 49 populated. Raised twice; no answer either time | nothing |

---

Where no second record exists (Q2 to Q8, Q22, Q29 to Q37) nothing mechanical
can help. Those are the ones that went missing three times, and they went
missing because they lived only in conversation. The fix for those is not a
check; it is the rule at the top of this file.
