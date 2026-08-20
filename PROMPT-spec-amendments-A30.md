# SPEC.md amendment A30 — "one statement" is not "serialised", and §4.3 currently teaches the defect

Baseline `bd7a2fe`.

---

## Why

A29 specified the rate-limit claim as a conditional insert and justified it with "the count and
the insert then happen in one statement under one snapshot". **That is true and it is not
sufficient**, and the gap was found by measurement rather than by review: ten concurrent claims
against nine free slots admitted **TEN**, reproducibly, about two runs in five.

The mechanism, stated correctly:

- A single statement is atomic **with respect to its own snapshot**. That is what defeats
  check-then-act, where a `SELECT` and a later `INSERT` see two different states of the table
  and another caller writes between them.
- It is **not serialised against other claimants**. Under READ COMMITTED — Postgres' default
  and this app's — a statement cannot see rows other transactions have inserted but not
  committed. So ten conditional inserts issued together each count the same nine committed
  rows, each conclude there is room, and each insert.

The fix is `pg_advisory_xact_lock` taken before the count and held to the end of the enclosing
transaction, so the next claimant reads a committed table rather than a stale snapshot.

**Why this needs an amendment rather than a code comment.** §4.3 is where someone builds the
next quota, and the current wording reads as a complete recipe. Anyone following it inherits
the same defect, with the same reassuring justification attached. The original sentence is
recorded rather than quietly replaced, for the reason this document exists: a correction that
hides what it corrected teaches nothing.

---

## A30a — §4.3: state the mechanism correctly

**REPLACE:**

> **The check and the insert must be ONE atomic statement.** A `SELECT count(*)` followed by an `INSERT` is check-then-act: two concurrent requests both read 9, both pass, and both write — the eleventh request in an hour, admitted by a limiter that was working correctly at every individual step. This is the acquire-flow race in a new place, and §7.3's rule applies for the same reason: a pre-check handles bad input, and only the atomic write handles what changes between the check and the write.
>
> Write it as a conditional insert — `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < limit` — and treat **zero rows inserted** as the refusal. The count and the insert then happen in one statement under one snapshot, and the caller learns the outcome from what the database did rather than from what it predicted.

**WITH:**

> **Claimants must be serialised against each other, and one statement does not do it.**
>
> Two separate hazards, and conflating them is how this was specified wrongly the first time:
>
> 1. **Check-then-act within one caller.** A `SELECT count(*)` followed by an `INSERT` sees two different states of the table, and another caller writes between them. Two concurrent requests both read 9, both pass, and both write — the eleventh request in an hour, admitted by a limiter that was correct at every individual step. This is the acquire-flow race in a new place, and §7.3's rule applies for the same reason: a pre-check handles bad input, and only the atomic write handles what changes between the check and the write.
>
> 2. **Concurrent claimants reading the same committed state.** A conditional insert — `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < limit` — closes the first hazard, because its count and its insert cannot interleave with each other. It does **not** close the second: under READ COMMITTED, the default here, a statement cannot see rows other transactions have inserted and not yet committed, so ten such statements issued together each count the same nine committed rows and each insert.
>
> **So take `pg_advisory_xact_lock` on a fixed key before the count**, inside the transaction that performs the insert, so the lock is held until commit and the next claimant reads a committed table rather than a stale snapshot. Then treat **zero rows inserted** as the refusal: the caller learns the outcome from what the database did rather than from what it predicted.
>
> **A29 said "one statement, therefore atomic under one snapshot" and stopped there.** That sentence is true, reads as sufficient, and is not — the measurement that found it admitted ten claims against nine free slots, reproducibly. Recorded rather than replaced silently, because anyone reading this section to build a second quota would otherwise inherit the error along with its justification.
>
> **With the lock held, the statement's shape stops being load-bearing.** A count and an insert as two statements inside the lock is equally correct, because the lock is what makes it safe. The conditional insert is still preferred — it keeps the refusal in one place and needs no branch — but a test asserting the single-statement form is pinning an implementation detail rather than the property, and the property is that a claim cannot read stale state and write anyway.

---

## A30b — §4.3: the concurrent test, corrected by what it took to write

**REPLACE:**

> **This must be tested at the concurrent level, not only the sequential one.** Eleven requests in sequence will pass a limiter that is wrong; the test that matters fires the eleventh concurrently with the tenth. NOTES records the mock rule this needs: a mock intercepting every call disables the function, while one intercepting only the first simulates the race.

**WITH:**

> **This must be tested at the concurrent level, and writing that test is harder than it looks.** Eleven requests in sequence will pass a limiter that is wrong, because the first has committed by the time the second reads. Three things were measured while building it, each of which produced a test that passed and proved nothing:
>
> - **Two promises in flight is not enough.** A barrier placed *before* the claim caught the defect when its file ran alone and missed it in a full run — earlier tests warm the connection pool, so the first round-trip completes before the second is issued. **The isolated run is the honest one**; the full-file pass is the artefact.
> - **A lock in the test defeats the test.** Wrapping each claimant in an advisory lock serialises them, which is the sequential case the test exists to avoid.
> - **The barrier belongs between the READ and the WRITE**, because that is the window the defect lives in — every claimant must have counted before any inserts.
>
> And the detector must be **deterministic, not probabilistic**: a version relying on real concurrency caught the missing lock 4 runs in 6, which reads as flake and gets retried away. Hold every claimant at the same point instead, so timing is not part of the question.

---

## After applying

§4.3 describes a limiter that survives concurrent claimants, names the two distinct hazards
separately, and records that the earlier justification was insufficient. The code at `bd7a2fe`
already matches this text; the amendment brings the spec up to what was built and measured.
