# R6 — deploy readiness

Fresh session, cold reader. Read `REVIEW-PLAN.md` for R6's brief and the triage rules,
`CLAUDE.md`, and `SPEC.md` §14 and §16. `NOTES.md` is long — read the standing rules and the
entries tagged for R6 rather than all of it.

**Step 15 is complete.** All twelve screens have been through a mobile pass, `/lookup` works
on a phone, and the E2E instrument is trustworthy. Step 16 is the Vercel deploy, and R6 runs
before it.

---

## What makes this review different from the five before it

**Nothing in this project has ever run anywhere except one laptop.** Every review so far has
read code against a spec. This one asks whether the app works somewhere it has never been —
which means most of its findings cannot be reached by reading, and the ones that can are the
easy half.

Three database-behind-its-schema incidents happened during step 15, all on a machine where
recovery was a shell command away. On production the same divergence is a much worse day.

---

## The list R6 has accumulated

These were recorded with R6 as their trigger. Each is a starting point, not the brief.

- **Every secret's path from `.env.local` to Vercel** — `DATABASE_URL`, `SESSION_SECRET`,
  `CRON_SECRET`, `ANTHROPIC_API_KEY`, `BLOB_READ_WRITE_TOKEN`, the Discogs token,
  `APP_PASSWORD_HASH`. The last one has a known trap: dotenv performs variable expansion, so a
  bcrypt hash needs its `$` escaped, and the escaping is environment-specific. Whether Vercel's
  env storage has the same property is a question, not an assumption.
- **`APP_PASSWORD_HASH` validated as `z.string().min(1)`** while adjacent variables carry
  `.min(32)` with reasoning. A malformed hash presents as a wrong password, and on production
  that means nobody can log in.
- **The migration story.** There is no supported command to migrate the Neon branch —
  `drizzle.config.ts` resolves `DATABASE_URL` and `TEST_DATABASE_URL` only. Three databases
  drifted during step 15 and the recovery depended on the drifted migrations being verifiably
  complete, which was luck. What the production path is, and what happens when it drifts, is
  R6's question.
- **`db:test:reset`** runs, exits 0, and leaves an unusable database. §14 lists it among
  scripts that must pass.
- **`sslmode=require`** currently behaving as `verify-full`, adopting weaker libpq semantics in
  pg v9. One word.
- **The `cause`-chain log leak** — a nested cause could carry a secret into logs. The fix is
  specified: redacted projection, plus a test planting a secret in a nested cause and asserting
  it does not reach the log.
- **The Discogs User-Agent** — hard-coded rather than environment-derived, and its contact URL
  404s (`adamshaw` where the remote is `ashaw315`). Discogs accepts a wrong-but-present header,
  so it fails only when someone tries to follow it.
- **The cron for price refresh** — whether it runs, what authenticates it, and what happens
  when it fails.
- **The Neon WebSocket driver under real serverless conditions.** It works against local Docker
  and a test branch. Production is a different execution model.

---

## What to attack beyond the list

**Every credential's failure mode at point of use.** This project has now been bitten three
times by an is-configured check that tests presence rather than shape — a placeholder Anthropic
key that passed, a shell-escaped password hash that passed, and a User-Agent that is present
and wrong. Ask what each secret does when it is absent, when it is malformed, and when it is
valid-but-wrong, and whether the user is told something they can act on.

**What is a literal that should be configuration**, and what is configuration that should be a
literal. The User-Agent is one instance; there may be others.

**What only exists on this machine.** Anything the app needs that lives in `.env.local`, a
Docker container, or a developer's shell — and is not in the deploy path.

**The first-boot case.** An empty production database, no records, no images, no LLM key. Every
screen should degrade to something honest rather than an error.

---

## Rules

**Verify before proposing.** REVIEW-PLAN's standing rule, and it has been earned: twice a
review's central claim here was wrong, and both times the implementing session's independent
check changed what got fixed. Findings arrive as hypotheses.

**Report against the four buckets** — fix now, fix in this remediation, defer with a named
trigger, decline with reasoning. Say which findings you are confident in and which you hold
loosely.

**Do not deploy anything.** R6 reads and measures; step 16 acts.

---

## Report

1. **What would stop a deploy working**, in order of likelihood.
2. **What would work on deploy and fail later** — the worse category, since nothing catches it.
3. **What only this laptop knows.**
4. **What you could not check without deploying**, stated as the residue R6 hands to the
   after-deploy pass rather than left implicit.
5. The entry REVIEW-PLAN asks for: what the review found, what it missed, and what only running
   it somewhere real could have shown.
