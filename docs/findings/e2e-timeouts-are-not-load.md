# Four E2E specs are a too-tight timeout, not a busy box

**Bug report. Written as a file because the in-conversation drafts could not
be reviewed or sent from this side.**

## What happens

Four specs fail intermittently in full E2E runs and pass in isolation:

- `record-navigation.spec.ts` — "put back lands in the HELD record's slot"
- `record-navigation.spec.ts` — "the previous arrow is ABSENT at the first record"
- `collection-filters.spec.ts` (mobile) — "clicking through to a filtered view"
- `manage.spec.ts` (mobile) — "moves a genre under another with the select"

They have been on the standing task list as "load-dependent probes" for
several sessions.

## Why that label is wrong

**Measured: one of them takes 32.9s of wall time against Playwright's 30s
default `timeout`.** The test is simply longer than its budget. A busy machine
pushes it over; a quiet one does not. That is not the same thing as load
causing the failure, and it wants a different fix.

The two produce an identical symptom — a 30s timeout error that passes on
re-run — which is exactly why the label stuck.

| | load contention | too-tight timeout |
|---|---|---|
| symptom | 30s timeout, passes alone | 30s timeout, passes alone |
| fix | fewer workers, serialise suites | raise the per-test budget, or make the test shorter |
| evidence needed | load average during the run | the test's own wall time against the budget |

## Evidence

Full-run counts from one session, with load averages at launch and landing:

| run | passed | failed | flaky | load start → end |
|---|---|---|---|---|
| 1 | 539 | 5 | 3 | 4.88 → 9.59 |
| 2 | 545 | 4 | 2 | 3.86 → 8.37 |
| 3 | 544 | 6 | 1 | 7.14 → 26.42 |
| 4 | 548 | 3 | 1 | 4.21 → 9.48 |

The same four specs appear across every run regardless of load, and **every
one passes in isolation — including at load 24.9**, which is higher than three
of the four runs ever reached.

`playwright.config.ts` sets `workers: 2` locally with no per-test `timeout`
override, so the 30s default applies to tests whose own wall time is already
near it.

## What is confirmed and what is not

**Confirmed in-session:** one test at 32.9s against the 30s default.

**Not confirmed:** the other three share the symptom and the
passes-in-isolation behaviour, but their individual wall times were not
measured. The same cause is likely rather than established for those.

## Suggested next step

Measure all four tests' wall times in isolation. Where a test is genuinely
near 30s, either raise its budget explicitly (with the figure in a comment
saying what it measured) or shorten the test. Re-label the standing task list
accordingly — "load-dependent" currently sends anyone investigating toward
worker counts, which is the wrong axis for at least one of these and possibly
all four.
