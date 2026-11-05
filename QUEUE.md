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
| Q1 | open | Store the 45 ABOUT notes. Two to fix by hand first: `e1e349f6` (999: "Found Out Too Late" is not on the LP) and `e315c6a7` (The Doors: Alabama Song is A5, Light My Fire A6, so side one runs the other way). Mark the other 43, Carly Simon `e931d933` included. | the drafts file; nothing else |
| Q2 | open | The 640px rail captures: look and judge | nothing |
| Q3 | open | The far-view sheet at 1044 / 1273 / 1440: look and judge | nothing |
| Q4 | open | The re-roll at about 2.5s: look and judge | nothing |
| Q5 | open | The §62 covers group's look: look and judge | nothing |
| Q6 | open | The Images disc size, and eight unconfirmed §55 figures | §55 |
| Q7 | open | The 455px put back | nothing |
| Q8 | open | The hold's bound figure | nothing |

Q1 blocks Q22. Q2 to Q8 block nothing and have been parked longest.

## In flight

| id | status | item | record lives in |
|---|---|---|---|
| Q9 | open | The four-worker unit (Code): seed via the one-statement helper (wall-route:234); landing-count wait replacing a 900ms clock (wall-arrival-104:120); the whole-collection lock with a stale-lock break and a bounded poll, plus the seven-spec survey recorded in the file; raise the CI gate to four workers once a four-worker run is clean | NOTES, the config comment |
| Q10 | open | §43 (Design): does "first-painted height" mean the first frame, or the first styled frame? Raised by record-band-43:33 failing at four workers on an unstyled frame | §43 |
| Q11 | done 194ac24 | Remove rule 3 and its test; record the Doors class in NOTES beside the debut class | NOTES, ASSERTIONS-spec |
| Q12 | done 194ac24 | The "unchecked" pointer on sentences that run a side from one thing to another: a reading aid, not an assertion, no ASSERTIONS-spec entry | the script |

## Code's queue, not started

The six unbuilt handoff steps come first in this queue and are not listed
here; see above.

| id | status | item | record lives in |
|---|---|---|---|
| Q19 | done b749d61 | The queue file and its check | this file |
| Q20 | open | `scripts/check-design-card.mjs`: tag balance, nesting depth 1, doctype, closing tag, withdrawal-sentence count and uniqueness, change-file quotes matched character for character including curly apostrophes, and the bold-sentence set diff against the previous card | the script |
| Q21 | open | inferReissue is wrong on 2 records | NOTES |
| Q22 | open | The vibe search: embed the ABOUT notes, rank the collection by closeness to a typed vibe, 3 to 5 results, an honest weak-match state. Blocked on Q1. Replaces the mood buttons; they survive as presets at most | nothing yet |
| Q23 | open | Want-list tagging (Phase 4): never designed | mood-search-scope doc |
| Q24 | open | lookup-flows:1743: an unread flake | the known-flaky table |
| Q25 | open | Mood tagging: the retry and the run-record | SPEC §5.10 |
| Q26 | open | sharp's cold-start cost: optional, from the Vercel work | NOTES |
| Q38 | open | roving-148:83 at four workers: a 30s timeout on openShelf at the test's start (4.6s at one worker, 9.1s and 30.4s at four), the seventh distinct four-worker test, one appearance; load-shaped, not a collision; read the trace before building anything | NOTES, 5 Nov |
| Q39 | open | The gate against a build, not `next dev`: an `E2E_SERVER=build` switch in playwright.config.ts's webServer (`NODE_ENV=test next build && next start`), gate.yml's e2e job building once before Playwright, one four-worker CI run read against the runs table. Measured 5 Nov: build 9.3s, start ready in 222ms, login 200 and the session cookie set without Secure under runtime NODE_ENV=test. Plausibly one change against wall-route:234, record-band-43:33, roving-148:83, record-navigation:295 and hold-160:111/:123, all first responses from a dev server under four workers. Shared infrastructure, so a gate; error-probe's spec is the one dev-only path to check | NOTES, 5 Nov |
| Q40 | open | pick-moods-157's whole-collection test at four workers: the bracket cannot close (no quiet two seconds across eight attempts, run 42115186427). Proposed, a change to a test needing agreement: the e2e asserts only what the page can show (under a filter whose pool is four tagged records the line is drawn and reads at least seventeen), the equality stays in mood-pool.test.ts:59, which holds it against the real database with no concurrent writer; the bracket and its tests removed, not kept inert | NOTES, 5 Nov |
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
