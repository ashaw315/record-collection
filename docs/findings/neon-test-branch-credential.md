# The Neon test branch is configured but rejects the password

**Bug report. Written as a file because the in-conversation drafts could not
be reviewed or sent from this side.**

## What happens

`test/integration/neon-transactions.test.ts` fails on every `npx vitest run`:

    NEON_TEST_DATABASE_URL is set but the branch is unreachable
    (host: ep-wispy-sunset-au5w293q-pooler.c-10.us-east-1.aws.neon.tech)
    Caused by: error: password authentication failed for user 'neondb_owner'

The host resolves and accepts a connection; the credential is rejected. So
this is a stale password or a rotated branch, not a network or
config-absent problem.

## The guard is working — that is the point

CLAUDE.md §2 requires distinguishing **absent** from **broken** from
**working**, and names the middle case as the dangerous one: "an unreachable
dependency is a broken environment, not an absent one... fail loudly rather
than skipping". This test does exactly that, which is why it is visible at
all rather than silently skipped.

## Why it still matters

**Every full unit run this session reported `1 failed` for an environmental
reason.** Across roughly a dozen runs the counts were consistently
`3743–3751 passed | 1 failed`, and the one failure was always this. A red
line that is always red and always ignorable trains the eye to skip the
summary — which is the habit CLAUDE.md §9 exists to prevent ("report the
summary line, never the exit code").

**And what it uniquely covers is currently unverified.** The rest of the
suite exercises transaction code against local Postgres. This test is the
only thing that runs it over Neon's serverless HTTP driver, which CLAUDE.md §2
says must be verified before deploy rather than assumed:

> "any transaction code must be verified to work over the Neon driver before
> deploy, not assumed"

So the project currently has no evidence for that claim.

## Evidence

- Present before this session's work began, unchanged throughout.
- Fails identically in isolation and in the full suite, on a clean tree and
  at every commit.
- Host `ep-wispy-sunset-au5w293q-pooler.c-10.us-east-1.aws.neon.tech`,
  user `neondb_owner`.

## Suggested next step

Refresh the branch credential, or point `NEON_TEST_DATABASE_URL` at a live
branch. If the branch is gone for good, that is a decision worth making
explicitly — unsetting the variable makes the test skip honestly (absent
rather than broken), but it also means nothing verifies the Neon driver path,
and CLAUDE.md §2 says that verification is required before deploy.
