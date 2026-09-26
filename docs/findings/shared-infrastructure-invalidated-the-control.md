# Shared infrastructure invalidated the control

**The shape.** Two conditions are compared to isolate a cause, and both carry the same uncontrolled variable, so the comparison cannot see it. The conclusion drawn from the comparison is then confident and wrong.

**The instance.** Five full E2E runs on 25 Sep: two contaminated by a second Playwright runner on the shared database, three "clean". `manage (mobile) › moves a genre under another` failed in all five, and the reasoning was: failing identically under contaminated and clean conditions rules out load — broken, not flaky. But every one of the five interleaved the `chromium` and `mobile` projects on one dev server and one database. "Clean" controlled for the second runner and not for the contention that mattered. The mobile project alone: 194 passed, 0 failed, 0 flaky. The two chromium specs alone, serial: 11 of 11. Every flake and every failure in the five runs except one (§W.29, a real defect the load revealed) was the two projects contending.

**What it cost.** Not noise: conclusions. "Broken, not flaky" for `manage`; "known-contended" would have been right. "Degrading across runs" for §W.29 — it was a constant defect under a variable load. Two record-navigation entries diagnosed as one state bug at two reliability levels — they were one sampling hazard, revealed at two loads. Each of those readings was made from the numbers, and the numbers were of the interleaving.

**The rule.** Before comparing two runs, name every variable they share. A run is a control only for what it holds fixed, and shared infrastructure — one server, one database, one clock — is a variable in every run that does not isolate it. When a measurement's conditions are not yours to set, say so on the line that reports the number.

**Where it lives now.** `npm run test:e2e` runs the two projects one after the other, each with the server to itself; a bare `npx playwright test` still interleaves them, and its numbers should be read as such.

Related: [an-intermittent-failure-is-a-report](an-intermittent-failure-is-a-report.md), [a-check-whose-subject-is-a-list](a-check-whose-subject-is-a-list.md).
