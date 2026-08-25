# Step 16 — deploy

Fresh session. Read `CLAUDE.md`, `SPEC.md` §12 and §16, and `REVIEW-PLAN.md`'s R6 entry.
`NOTES.md` is long — read the standing rules and R6's findings rather than all of it.

**This is the first time the app runs anywhere except one laptop.** Every previous step could
be verified by running something locally. This one cannot, and the findings that matter most
are the ones that only appear on the other side.

---

## Session start

Per CLAUDE.md §11: read the files, run the full suite, report its state, then state the plan
for the session's single unit and wait. Do not start deploying before that report.

Baseline at the time of writing: HEAD after R6's five remediation commits, 2,906 unit tests,
390 E2E at `--retries=0`, typecheck/lint/build clean.

---

## What step 16 has to deliver

§16 is the authority. In outline: Vercel project configuration, the production database, every
secret in place, the cron for price refresh, and the app reachable and working.

**Four items were deferred to this step with step 16 as their trigger.** They are not optional
extras; they were parked here deliberately:

- **`maxDuration` and `vercel.json`** — serverless function limits against what the app
  actually does. The LLM calls take tens of seconds; R5 measured 44s for one.
- **The LLM quota-slot leak** — a slot claimed and not released when a function times out
  rather than returns.
- **Per-isolate rate limiters** — the token bucket is in-memory and per module instance. On
  Vercel that means per isolate, so the ceiling is not the ceiling. Trigger was step 16 or a
  first production 429/503.
- **`db:migrate`'s state assertion** — R6 found it shares `db:test:reset`'s shape: on a
  ledger/journal divergence it dies on 42701, rolls back, prints success and exits 0,
  permanently. `db:verify` exists because exit 0 does not prove it. The production migration
  path needs the assertion, and R6 explicitly declined to invent one mid-remediation because
  doing it against production without care is how a worse thing happens.

---

## The rule that governs this whole step

**Nothing is done because it worked locally.** Every claim of the form "the secret is set" or
"the migration applied" or "the cron is configured" has a second half — whether the app can
read it, whether the schema is actually there, whether the cron fires — and this project has
been caught by exactly that gap three times in a week on databases where recovery was a shell
command away.

So: **assert the state, not the exit code.** That is R6's general form and it is the thing
step 16 is most likely to violate.

---

## What to be careful with

**Order matters.** A deploy that half-works is harder to diagnose than one that fails cleanly.
Think about what has to be true before the first request is served — schema, secrets,
migrations — versus what can be checked after.

**The production database is not the dev database.** Neon branches drifted three times during
step 15 and the recovery each time depended on the drifted migrations being verifiably
complete, which NOTES records as luck rather than design. There is currently no supported
command that migrates a branch other than the two `drizzle.config.ts` resolves.

**Secrets have shapes.** `APP_PASSWORD_HASH` needs escaping that is environment-specific —
dotenv expands `$`, and whether Vercel's env storage does the same is a question rather than an
assumption. R6 fixed the local validation; the production path is untested.

**Ask before anything irreversible.** Creating a production database, applying a migration to
it, or deploying are not things to do and report. Propose, then act on confirmation.

---

## What must not happen

- **No secret in a commit, a log, or a report.** R6's cause-chain fix landed for this reason;
  do not undo it by pasting a value into a summary.
- **No live external call in a test.** The guard is host-agnostic and covers Anthropic,
  Discogs and MusicBrainz.
- **Production is not a test fixture.** Nothing seeds, truncates or resets it.

---

## Report

1. **What is deployed and reachable**, with the evidence — a request that succeeded, not a
   dashboard that says green.
2. **Every secret: set, and readable by the app.** Both halves, separately.
3. **The schema on production**, asserted rather than assumed.
4. **The cron: configured, and observed to fire** — or, if it cannot be observed yet, what
   would show it and when.
5. **What you could not verify without waiting**, handed to R6's after-deploy pass rather than
   left implicit.

Then stop. R6 runs again after this, and Adam uses the app somewhere real.
